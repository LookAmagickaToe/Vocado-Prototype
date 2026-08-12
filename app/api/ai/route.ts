import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { slugifyVariant, variantLabel } from "@/lib/languages"

const DEFAULT_MODEL = "gemini-flash-lite-latest"

type ParseTask = "parse_text" | "parse_image" | "conjugate" | "theme_list" | "news" | "story"

// Extraction and translation want to be deterministic. Theme generation does not:
// at 0.3 a retry returns virtually the same list, which defeats the top-up loop
// that fills "generate 10 more" up to the requested count.
const TASK_TEMPERATURE: Partial<Record<ParseTask, number>> = {
  theme_list: 0.9,
  story: 0.9,
}

/**
 * Best-effort repair for JSON cut off mid-stream (the model hit its output
 * token limit while writing a long items array). Walks the string tracking
 * bracket depth, finds the last point where a complete element/value ended,
 * truncates there, and closes whatever brackets were still open. Returns null
 * if the text isn't salvageable this way.
 */
function repairTruncatedJson(text: string): string | null {
  const stack: Array<"{" | "["> = []
  let inString = false
  let escape = false
  let lastSafeCut = -1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch)
    } else if (ch === "}" || ch === "]") {
      stack.pop()
      lastSafeCut = i + 1
    } else if (ch === "," && stack.length > 0) {
      lastSafeCut = i
    }
  }

  if (lastSafeCut <= 0 || stack.length === 0) return null

  let repaired = text.slice(0, lastSafeCut).replace(/,\s*$/, "")
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]"
  }
  return repaired
}

export function extractJson(text: string) {
  // responseMimeType: "application/json" mostly prevents this, but the model
  // occasionally wraps the payload in a markdown fence anyway.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) text = fenced[1]

  // Try to find array first if it looks like one
  const startArr = text.indexOf("[")
  const startObj = text.indexOf("{")

  if (startArr >= 0 && (startObj === -1 || startArr < startObj)) {
    const end = text.lastIndexOf("]")
    if (end > startArr) {
      try {
        return JSON.parse(text.slice(startArr, end + 1))
      } catch (e) { }
    }
  }

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch (e) {
      // Likely truncated mid-item — salvage whatever complete items exist
      // rather than losing the whole generation to one cut-off entry.
      const repaired = repairTruncatedJson(slice)
      if (repaired) return JSON.parse(repaired)
      throw e
    }
  }
  return JSON.parse(text)
}

/**
 * Prompt lines for a regional variety (bayerisch, colombiano, valencià).
 *
 * Two jobs. First, generated text should actually sound like the variety —
 * Bavarian "i mog di" rather than standard "ich mag dich". Second, and more
 * importantly, each extracted item must say whether it is variety-specific or
 * standard, because that tag decides who ever sees the word again:
 *
 *   variant: null          -> standard, inherited by every variety of the language
 *   variant: "bayerisch"   -> only visible while studying Bayerisch
 *
 * Getting this wrong in the generous direction (tagging standard words as
 * dialect) is worse than the reverse: it hides ordinary vocabulary from the
 * standard learner. Hence the explicit "most words are standard" instruction —
 * a dialect text is mostly shared vocabulary with a few distinctive words.
 */
function variantPromptLines(variantName: string | null, targetLabel: string): string[] {
  if (!variantName) return []
  return [
    `REGIONAL VARIETY: the learner is studying the ${variantName} variety of ${targetLabel}.`,
    `Write all generated ${targetLabel} text in ${variantName} as it is actually spoken, including its characteristic spellings and expressions.`,
    `Every item MUST have a 'variant' field. Set it to "${variantName}" ONLY when the word or form is specific to ${variantName} and would not be used in standard ${targetLabel}. Set it to null when the word is standard ${targetLabel}.`,
    `Most words in any ${variantName} text are ordinary ${targetLabel} words — tag those null. Reserve the "${variantName}" tag for genuinely distinctive vocabulary and forms.`,
  ]
}

function buildParsePrompt({
  sourceLabel,
  targetLabel,
  desiredMode,
  rawText,
  level,
  context,
  variantName,
}: {
  sourceLabel: string
  targetLabel: string
  desiredMode?: string | null
  rawText: string
  level?: string | null
  context?: string | null
  variantName?: string | null
}) {
  const modeLine = desiredMode
    ? `The user selected mode: "${desiredMode}". Respect it even if you disagree.`
    : "Auto-select mode based on the content."
  const levelLine = level ? `Target proficiency level: ${level}.` : ""

  // The input was tapped inside a sentence: the surrounding words decide which
  // sense of an ambiguous word to translate.
  const contextLines = context?.trim()
    ? [
        "Context sentence the input was taken from:",
        context.trim(),
        "CRITICAL: Translate the input as it is used in that sentence. When the input has several possible meanings, pick the one the context supports and ignore the others; the 'explanation' must describe that sense.",
        "CRITICAL: The context sentence is reference only. Extract vocabulary from the Input alone — never add items for other words in the context sentence.",
      ]
    : []

  return [
    "You are extracting vocabulary pairs from user input.",
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    levelLine,
    "Return ONLY valid JSON with this shape (no markdown, no code blocks):",
    `{"mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":"","conjugation":null,"variant":null}]}`,
    "Usage Rules:",
    "1. Even if the input is a single word, you MUST return a valid JSON with an 'items' array containing that single item.",
    "2. A single word or phrase may be entered in EITHER configured language. Identify which configured language it is written in, then translate it to the other configured language.",
    "3. 'items' array MUST NEVER be empty. Create at least one item from the input.",
    "For verbs, you MUST provide a 'conjugation' object. It MUST have exactly 3 sections with titles corresponding to 'Present', 'Simple Past', and 'Perfect' in the TARGET language.",
    "For verbs, you MUST provide a 'conjugation' object. It MUST have exactly 3 sections with titles corresponding to 'Present', 'Simple Past', and 'Perfect' in the TARGET language.",
    "Structure: {\"infinitive\":\"...\",\"translation\":\"...\",\"sections\":[{\"title\":\"(Present Tense)\",\"rows\":[[\"(pronoun)\",\"...\"],...]},{\"title\":\"(Past Tense)\",\"rows\":[...] },{\"title\":\"(Perfect Tense)\",\"rows\":[...]}]}.",
    "CRITICAL: Pronouns (rows[i][0]) MUST be in the TARGET language (e.g. 'yo', 'tú' for Spanish; 'ich', 'du' for German). Do NOT use source language pronouns.",
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (verb, noun, adj, or other).",
    `Every item's 'source' MUST be written in ${sourceLabel}; every item's 'target' MUST be written in ${targetLabel}. Never swap these fields, even when the input is written in ${targetLabel}.`,
    `explanation is required: 1-2 sentences describing the word in ${sourceLabel}, never in ${targetLabel}.`,
    // example removed per user request
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Return items in the same order as the input lines. Do not drop items.",
    "Use lemma ONLY for verbs when the target word is not already the infinitive/base form.",
    "If the input provides only one language, translate into the other configured language while preserving the configured source/target field order.",
    "If the input already provides pairs, normalize them to source → target order and keep the same pairing and order.",
    ...variantPromptLines(variantName ?? null, targetLabel),
    ...contextLines,
    "Input:",
    rawText,
  ].join("\n")
}

function buildImagePrompt({
  sourceLabel,
  targetLabel,
  desiredMode,
  level,
}: {
  sourceLabel: string
  targetLabel: string
  desiredMode?: string | null
  level?: string | null
}) {
  const modeLine = desiredMode
    ? `The user selected mode: "${desiredMode}". Respect it even if you disagree.`
    : "Auto-select mode based on the content."
  const levelLine = level ? `Target proficiency level: ${level}.` : ""

  return [
    "You are extracting vocabulary pairs from an image of text.",
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    levelLine,
    "Return ONLY valid JSON with this shape:",
    `{"title":"...","mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":""}]}`,
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (verb, noun, adj, or other).",
    `Every item's 'source' MUST be written in ${sourceLabel}; every item's 'target' MUST be written in ${targetLabel}. Never swap these fields.`,
    `explanation is required: 1-2 sentences describing the word in ${sourceLabel}, never in ${targetLabel}.`,
    // example removed
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Return items in the same order as the input lines. Do not drop items.",
    "Use lemma ONLY for verbs when the target word is not already the infinitive/base form.",
    "Generate a short, descriptive title based on the image content.",
    "The image may contain either configured language. Normalize every result to the configured source → target order.",
  ].join("\n")
}

function buildConjugationPrompt({
  sourceLabel,
  targetLabel,
  verbs,
}: {
  sourceLabel: string
  targetLabel: string
  verbs: Array<{ lemma: string; translation?: string }>
}) {
  return [
    "Generate conjugation tables for the following verbs.",
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    "Return ONLY valid JSON with this shape:",
    `{"conjugations":[{"verb":"(target_verb)","translation":"(translation)","sections":[{"title":"(Present)","rows":[["(pronoun)","(verb)"],...]}]}]}`,
    "Include ONLY these 4 tenses: Simple Present, Simple Past, Present Perfect, and Future.",
    "Use standard tense names (titles) in the TARGET language.",
    "CRITICAL: Use pronouns (rows[i][0]) in the TARGET language (e.g. 'yo', 'tú' for Spanish; 'ich', 'du' for German). Do NOT use source language pronouns.",
    "The conjugated forms (rows[i][1]) must matches the pronoun.",
    `Verbs: ${JSON.stringify(verbs)}`,
  ].join("\n")
}

function buildThemePrompt({
  sourceLabel,
  targetLabel,
  desiredMode,
  theme,
  count,
  level,
  exclude,
}: {
  sourceLabel: string
  targetLabel: string
  desiredMode?: string | null
  theme: string
  count: number
  level: string
  exclude?: string[]
}) {
  const modeLine = desiredMode
    ? `The user selected mode: "${desiredMode}". Respect it even if you disagree.`
    : "Auto-select mode based on the content."
  // Hard rule, placed last so it is the final thing the model reads. A soft
  // "avoid ..." phrasing was routinely ignored and produced repeated words.
  const excludeLine =
    Array.isArray(exclude) && exclude.length > 0
      ? [
        "HARD CONSTRAINT — the user already knows the following words.",
        "The output MUST NOT contain any of them, nor their plural, inflected, or derived forms, in either the 'source' or the 'target' field.",
        "Every returned item must be genuinely new to the user. If the theme is nearly exhausted, return fewer items rather than repeating a known one.",
        `Known words: ${JSON.stringify(exclude)}`,
      ].join("\n")
      : ""

  return [
    "You are generating a vocabulary list from a theme.",
    `Theme: "${theme}"`,
    `Target count: ${count}`,
    `Level: ${level}`,
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    "Return ONLY valid JSON with this shape:",
    `{"title":"...","mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":"","conjugation":null}]}`,
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (verb, noun, adj, or other).",
    `Every item's 'source' MUST be written in ${sourceLabel}; every item's 'target' MUST be written in ${targetLabel}. Never swap these fields.`,
    `explanation is required: 1-2 sentences describing the word in ${sourceLabel}, never in ${targetLabel}.`,
    // example removed
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "For verbs, you MUST provide a 'conjugation' object. It MUST have exactly 4 sections with titles for 'Present', 'Simple Past', 'Perfect', and 'Future' in the TARGET language.",
    "Structure: {\"infinitive\":\"...\",\"translation\":\"...\",\"sections\":[{\"title\":\"(Present)\",\"rows\":[[\"(pronoun)\",\"...\"],...]},{\"title\":\"(Past)\",\"rows\":[...] }, etc.]}.",
    "CRITICAL: Pronouns (rows[i][0]) MUST be in the TARGET language (e.g. 'yo', 'tú' for Spanish, 'ich', 'du' for German). Do NOT use source language pronouns.",
    "Return exactly the requested number of items if possible.",
    excludeLine,
  ].filter(Boolean).join("\n")
}

function buildStoryPrompt({
  sourceLabel,
  targetLabel,
  topic,
  level,
}: {
  sourceLabel: string
  targetLabel: string
  topic: string
  level: string
}) {
  return [
    "You are a creative writer and language teacher.",
    `Write a short, engaging story (approx. 150 words) about: "${topic}".`,
    `Language: Write the story in "${targetLabel}" (the target language).`,
    `Target proficiency level: ${level}.`,
    "Extract key vocabulary from your story.",
    `Source language for explanations/translation: "${sourceLabel}".`,
    "Return ONLY valid JSON with this shape:",
    `{"title":"...","story":["..."],"story_source":["..."],"items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":"","conjugation":null}]}`,
    "title: A creative title for the story in the TARGET language.",
    "story: The content of the story, split into an array of paragraphs (strings).",
    "story_source: The same story translated into the SOURCE language (for reference), split into paragraphs.",
    "items: Extract 10-15 vocabulary items from the story.",
    `For every vocabulary item, 'source' must be ${sourceLabel} and 'target' must be ${targetLabel}; never reverse them.`,
    "For verbs, you MUST provide a 'conjugation' object. It MUST have exactly 4 sections with titles for 'Present', 'Simple Past', 'Perfect', and 'Future' in the TARGET language.",
    "Structure: {\"infinitive\":\"...\",\"translation\":\"...\",\"sections\":[{\"title\":\"(Present)\",\"rows\":[[\"(pronoun)\",\"...\"],...]},{\"title\":\"(Past)\",\"rows\":[...] }, etc.]}.",
    "CRITICAL: Pronouns (rows[i][0]) MUST be in the TARGET language. Do NOT use source language pronouns.",
    "Choose a fitting emoji for each item.",
    "explanation: 1-2 sentences explaining the word in the SOURCE language.",
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables'.",
  ].join("\n")
}

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function buildNewsPrompt({
  sourceLabel,
  targetLabel,
  level,
  rawText,
  variantName,
}: {
  sourceLabel: string
  targetLabel: string
  level?: string | null
  rawText: string
  variantName?: string | null
}) {
  const levelLine = level
    ? `Target proficiency level: ${level}. Use vocabulary, sentence length, and grammar strictly appropriate for this level.`
    : ""
  return [
    "You are summarizing a news article and extracting vocabulary.",
    `Summary language must be: "${targetLabel}" (the target language that the user is learning).`,
    `Vocabulary pairs must use source language "${sourceLabel}" and target language "${targetLabel}". This order is mandatory: each item's 'source' is ${sourceLabel}; each item's 'target' is ${targetLabel}.`,
    levelLine,
    "Return ONLY valid JSON with this shape:",
    `{"title":"...","summary":["..."],"summary_source":["..."],"items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":"","conjugation":null,"variant":null}]}`,
    "title: Extract the title from the input text. Keep it in its ORIGINAL LANGUAGE (do NOT translate it).",
    "For verbs, you MUST provide a 'conjugation' object. It MUST have exactly 4 sections with titles corresponding to 'Present', 'Simple Past', 'Perfect', and 'Future' in the TARGET language.",
    "Structure: {\"infinitive\":\"...\",\"translation\":\"...\",\"sections\":[{\"title\":\"(Present Tense)\",\"rows\":[[\"(pronoun)\",\"...\"],...]},{\"title\":\"(Past Tense)\",\"rows\":[...] }, etc.]}.",
    "CRITICAL: Pronouns (rows[i][0]) MUST be in the TARGET language (e.g. 'yo', 'tú' for Spanish, 'ich', 'du' for German). Do NOT use source language pronouns.",
    `summary: Write a comprehensive summary/article in ${targetLabel}. It MUST be at least 120 words long.`,
    `summary_source: **REQUIRED**: The exact translation of the 'summary' into ${sourceLabel}. It MUST be a parallel text.`,
    "items: Extract at least 8 relevant vocabulary items from the text. More is better (up to 15).",
    "If level is A1/A2: use very short sentences, common words, present tense when possible, no complex clauses.",
    "If level is B1/B2: medium length sentences, limited subordinate clauses, clear connectors.",
    "If level is C1/C2: more natural flow, richer vocabulary, but still concise.",
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (strictly one of: \"verb\", \"noun\", \"adj\", or \"other\"). Do not use capital letters.",
    "Correct capitalization, accents, and spacing in source/target text while preserving meaning.",
    `explanation is required: 1-2 sentences describing the word in ${sourceLabel}, never in ${targetLabel}.`,
    // example removed
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Select vocabulary based on the user's level. Be generous: extract MORE words rather than fewer, to ensure the text is easy to understand. Include even moderately common words if they are relevant to the context.",
    ...variantPromptLines(variantName ?? null, targetLabel),
    "Input article text:",
    rawText,
  ].join("\n")
}


export function buildBatchNewsPrompt({
  articles,
  sourceLabel,
  targetLabel,
  level
}: {
  articles: Array<{ id: string; title: string; text: string }>;
  sourceLabel: string;
  targetLabel: string;
  level: string;
}) {
  const levelLine = `Target proficiency level: ${level}. Use vocabulary, sentence length, and grammar strictly appropriate for this level.`

  return [
    "You are simplifying and summarizing multiple German news articles.",
    "These are German-language source templates; do not translate them in this step.",
    `Template language: "${targetLabel}".`,
    `Explanation/Source Context: "${sourceLabel}".`,
    levelLine,
    "Return ONLY a JSON array where each element corresponds to one input article.",
    "Order MUST match the input order.",
    "Input:",
    JSON.stringify(articles, null, 2),
    "",
    "Output JSON Array format:",
    `[
  {
    "id": "(original id)",
    "title": "(original title)",
    "summary": ["(paragraph 1 in the template language, simplified)", ...],
    "summary_source": ["(same as summary, for now)"],
    "items": [
       { "source": "(word in German)", "target": "(same word)", "pos": "...", "emoji": "...", "explanation": "(explanation in German)", "example": "..." }
    ]
  }
]`,
    "Requirements:",
    "- 'summary': Write a comprehensive summary in German, simplified for the requested level (approx 120 words).",
    "- 'summary_source': Duplicate of 'summary' because this template is German → German.",
    "- 'items': Extract 8-15 vocabulary items relevant to the text.",
    "   - 'source' and 'target' should be the SAME German word.",
    "   - 'explanation': 1-2 sentences explaining the word in German.",
    `- Adapt content strictly to Level ${level}.`,
    "   - A1/A2: Simple sentences, common words, present tense.",
    "   - B1/B2: Medium complexity, clear connectors.",
    "- Ensure 'id' matches the input."
  ].join("\n")
}


export function buildBatchTranslationPrompt({
  articles,
  sourceLabel,
  targetLabel,
  variantName,
}: {
  articles: Array<{ id: string; title: string; summary: string[]; items: any[] }>;
  sourceLabel: string;
  targetLabel: string;
  variantName?: string | null;
}) {
  return [
    "You are translating multiple news articles from German.",
    `Lesson Language (Target): "${targetLabel}".`,
    `Explanation Language (Native): "${sourceLabel}".`,
    "Return ONLY a JSON array where each element corresponds to one input article.",
    "Order MUST match the input order.",
    "Input:",
    JSON.stringify(articles, null, 2),
    "",
    "Output JSON Array format:",
    `[
  {
    "id": "(original id)",
    "title": "(title in ${targetLabel})", 
    "summary": ["(paragraph 1 in ${targetLabel})", ...],
    "summary_source": ["(paragraph 1 in ${sourceLabel})", ...],
    "items": [
       { "source": "...", "target": "...", "pos": "...", "emoji": "...", "explanation": "...", "variant": null }
    ]
  }
]`,
    "Requirements:",
    `- 'summary': Translate the full article summary to ${targetLabel}.`,
    `- 'summary_source': Translate the full article summary to ${sourceLabel}.`,
    "- 'items': Extract/Translate vocabulary.",
    `   - 'source' field: Translate to ${sourceLabel}.`,
    `   - 'target' field: Translate to ${targetLabel}.`,
    `   - The field order is mandatory: source is always ${sourceLabel}, target is always ${targetLabel}; do not retain the German template's field order.`,
    `   - 'explanation' must always be written in ${sourceLabel}.`,
    "- Ensure 'id' matches the input.",
    ...variantPromptLines(variantName ?? null, targetLabel),
  ].join("\n")
}

import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY_WORLDS || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY_WORLDS (or fallback GEMINI_API_KEY)" }, { status: 500 })
  }

  // Track usage
  const authHeader = req.headers.get("Authorization")
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "")
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (user) {
      // Increment counter (read-write)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("gemini_api_calls")
        .eq("id", user.id)
        .single()

      const current = Number(profile?.gemini_api_calls || 0)
      await supabaseAdmin
        .from("profiles")
        .update({ gemini_api_calls: current + 1 })
        .eq("id", user.id)
    }
  }

  const body = await req.json()
  const task = body?.task as ParseTask
  const sourceLabel = typeof body?.sourceLabel === "string" ? body.sourceLabel : "Español"
  const targetLabel = typeof body?.targetLabel === "string" ? body.targetLabel : "Alemán"

  // Regional variety of the language being learned. Passed to the model as its
  // display name ("Bayerisch"), while the DB stores the slug.
  const variantName = variantLabel(slugifyVariant(body?.variant), targetLabel)

  let prompt = ""
  let parts: Array<any> = []

  if (task === "parse_text") {
    const rawText = typeof body?.text === "string" ? body.text : ""
    prompt = buildParsePrompt({
      sourceLabel,
      targetLabel,
      desiredMode: body?.mode ?? null,
      rawText,
      level: typeof body?.level === "string" ? body.level : null,
      context: typeof body?.context === "string" ? body.context : null,
      variantName,
    })
    parts = [{ text: prompt }]
  } else if (task === "parse_image") {
    const image = body?.image
    if (!image?.data || !image?.mimeType) {
      return NextResponse.json({ error: "Missing image data" }, { status: 400 })
    }
    prompt = buildImagePrompt({
      sourceLabel,
      targetLabel,
      desiredMode: body?.mode ?? null,
      level: typeof body?.level === "string" ? body.level : null,
    })
    parts = [
      { text: prompt },
      { inline_data: { mime_type: image.mimeType, data: image.data } },
    ]
  } else if (task === "conjugate") {
    const verbs = Array.isArray(body?.verbs) ? body.verbs : []
    prompt = buildConjugationPrompt({ sourceLabel, targetLabel, verbs })
    parts = [{ text: prompt }]
  } else if (task === "theme_list") {
    const theme = typeof body?.theme === "string" ? body.theme : ""
    const count = typeof body?.count === "number" ? body.count : 20
    const level = typeof body?.level === "string" ? body.level : "A2"
    const exclude = Array.isArray(body?.exclude)
      ? body.exclude.filter((entry: unknown) => typeof entry === "string" && entry.trim())
      : []
    if (!theme.trim()) {
      return NextResponse.json({ error: "Missing theme" }, { status: 400 })
    }
    prompt = buildThemePrompt({
      sourceLabel,
      targetLabel,
      desiredMode: body?.mode ?? null,
      theme,
      count,
      level,
      exclude,
    })
    parts = [{ text: prompt }]
  } else if (task === "story") {
    const topic = typeof body?.topic === "string" ? body.topic : ""
    const level = typeof body?.level === "string" ? body.level : "A2"
    if (!topic.trim()) {
      return NextResponse.json({ error: "Missing topic" }, { status: 400 })
    }
    prompt = buildStoryPrompt({
      sourceLabel,
      targetLabel,
      topic,
      level,
    })
    parts = [{ text: prompt }]
  } else if (task === "news") {
    const rawText = typeof body?.text === "string" ? body.text.trim() : ""
    if (rawText) {
      prompt = buildNewsPrompt({
        sourceLabel,
        targetLabel,
        level: typeof body?.level === "string" ? body.level : null,
        rawText: rawText.slice(0, 12000),
        variantName,
      })
      parts = [{ text: prompt }]
    } else {
      const url = typeof body?.url === "string" ? body.url.trim() : ""
      if (!url) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 })
      }
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 })
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return NextResponse.json({ error: "Invalid url protocol" }, { status: 400 })
      }
      const articleResponse = await fetch(parsedUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
      })
      if (!articleResponse.ok) {
        return NextResponse.json(
          { error: `Failed to fetch article (${articleResponse.status})` },
          { status: 500 }
        )
      }
      const html = await articleResponse.text()
      const plainText = stripHtml(html).slice(0, 12000)
      if (!plainText) {
        return NextResponse.json({ error: "Empty article content" }, { status: 500 })
      }
      prompt = buildNewsPrompt({
        sourceLabel,
        targetLabel,
        level: typeof body?.level === "string" ? body.level : null,
        rawText: plainText,
        variantName,
      })
      parts = [{ text: prompt }]
    }
  } else {
    return NextResponse.json({ error: "Unknown task" }, { status: 400 })
  }

  const rawModel = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`

  const MAX_ATTEMPTS = 3
  let lastError: { message: string; status: number; details?: any } | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: TASK_TEMPERATURE[task] ?? 0.3,
            // Explicit ceiling so a long items array (e.g. theme_list with many
            // verbs and full conjugation tables) fails loudly via finishReason
            // instead of silently truncating mid-JSON.
            maxOutputTokens: 8192,
          },
        }),
      }
    )

    const raw = await response.text()
    let data: any = null
    try {
      data = JSON.parse(raw)
    } catch {
      data = { error: { message: raw } }
    }

    if (!response.ok) {
      console.error("Gemini error response:", data)
      // 429 (quota) and other 4xx won't be fixed by retrying immediately.
      if (response.status === 429 || (response.status >= 400 && response.status < 500)) {
        return NextResponse.json({ error: "Gemini request failed", details: data }, { status: 500 })
      }
      lastError = { message: "Gemini request failed", status: 500, details: data }
      continue
    }

    const candidate = data?.candidates?.[0]
    const text = candidate?.content?.parts
      ?.map((part: any) => part?.text ?? "")
      .join("")
      .trim()

    if (!text) {
      lastError = { message: "Empty response from Gemini", status: 500 }
      continue
    }

    try {
      const parsed = extractJson(text)
      return NextResponse.json(parsed)
    } catch (error) {
      const finishReason = candidate?.finishReason
      console.error(
        `JSON parse failed (attempt ${attempt}/${MAX_ATTEMPTS}, finishReason=${finishReason ?? "?"}, task=${task}):`,
        (error as Error).message
      )
      lastError = { message: "Failed to parse JSON response", status: 500, details: { raw: text, finishReason } }
      // A different sample from the model is the most reliable fix here —
      // truncation and stray malformed output rarely repeat identically.
      continue
    }
  }

  return NextResponse.json(
    { error: lastError?.message ?? "Gemini request failed", details: lastError?.details },
    { status: lastError?.status ?? 500 }
  )
}
