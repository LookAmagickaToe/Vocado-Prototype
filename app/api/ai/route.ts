import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const DEFAULT_MODEL = "gemini-flash-latest"

type ParseTask = "parse_text" | "parse_image" | "conjugate" | "theme_list" | "news"

function extractJson(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1)
    return JSON.parse(slice)
  }
  return JSON.parse(text)
}

function buildParsePrompt({
  sourceLabel,
  targetLabel,
  desiredMode,
  rawText,
  level,
}: {
  sourceLabel: string
  targetLabel: string
  desiredMode?: string | null
  rawText: string
  level?: string | null
}) {
  const modeLine = desiredMode
    ? `The user selected mode: "${desiredMode}". Respect it even if you disagree.`
    : "Auto-select mode based on the content."
  const levelLine = level ? `Target proficiency level: ${level}.` : ""

  return [
    "You are extracting vocabulary pairs from user input.",
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    levelLine,
    "Return ONLY valid JSON with this shape:",
    `{"mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":""}]}`,
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (verb, noun, adj, or other).",
    "Correct capitalization, accents, and spacing in source/target text while preserving meaning.",
    "explanation is required: 1-2 sentences describing the word in the SOURCE language.",
    // example removed per user request
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Return items in the same order as the input lines. Do not drop items.",
    "Use lemma ONLY for verbs when the target word is not already the infinitive/base form.",
    "If the input provides only one language, translate into the other language.",
    "If the input already provides pairs, keep the same pairing and order.",
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
    "Correct capitalization, accents, and spacing in source/target text while preserving meaning.",
    "explanation is required: 1-2 sentences describing the word in the SOURCE language.",
    // example removed
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Return items in the same order as the input lines. Do not drop items.",
    "Use lemma ONLY for verbs when the target word is not already the infinitive/base form.",
    "Generate a short, descriptive title based on the image content.",
    "If the image only contains one language, translate into the other language.",
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
    `{"conjugations":[{"verb":"gehen","translation":"ir","sections":[{"title":"Präsens","rows":[["ich","gehe"],["du","gehst"],["er/sie/es","geht"],["wir","gehen"],["ihr","geht"],["sie/Sie","gehen"]]}]}]}`,
    "Include ONLY these tenses: Simple Present, Simple Past (Präteritum), Present Perfect (Perfekt).",
    "Use pronouns and conjugated forms in the target language.",
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
  const excludeLine =
    Array.isArray(exclude) && exclude.length > 0
      ? `Avoid generating items that match these source words: ${JSON.stringify(exclude)}`
      : ""

  return [
    "You are generating a vocabulary list from a theme.",
    `Theme: "${theme}"`,
    `Target count: ${count}`,
    `Level: ${level}`,
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    excludeLine,
    "Return ONLY valid JSON with this shape:",
    `{"title":"...","mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":""}]}`,
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (verb, noun, adj, or other).",
    "Correct capitalization, accents, and spacing.",
    "explanation is required: 1-2 sentences describing the word in the SOURCE language.",
    // example removed
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Return exactly the requested number of items if possible.",
  ].join("\n")
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildNewsPrompt({
  sourceLabel,
  targetLabel,
  level,
  rawText,
}: {
  sourceLabel: string
  targetLabel: string
  level?: string | null
  rawText: string
}) {
  const levelLine = level
    ? `Target proficiency level: ${level}. Use vocabulary, sentence length, and grammar strictly appropriate for this level.`
    : ""
  return [
    "You are summarizing a news article and extracting vocabulary.",
    `Summary language must be: "${targetLabel}".`,
    `Vocabulary pairs must use source language "${sourceLabel}" and target language "${targetLabel}".`,
    levelLine,
    "Return ONLY valid JSON with this shape:",
    `{"summary":["..."],"items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂","explanation":"...","example":"...","syllables":""}]}`,
    "summary: 3-7 sentences forming a single flowing mini-article, not bullet points.",
    "If level is A1/A2: use very short sentences, common words, present tense when possible, no complex clauses.",
    "If level is B1/B2: medium length sentences, limited subordinate clauses, clear connectors.",
    "If level is C1/C2: more natural flow, richer vocabulary, but still concise.",
    "Choose a fitting emoji for each item (emoji is required).",
    "Always set pos for every item (verb, noun, adj, or other).",
    "Correct capitalization, accents, and spacing in source/target text while preserving meaning.",
    "explanation is required: 1-2 sentences describing the word in the SOURCE language.",
    // example removed
    "For verbs, provide syllable breakdown of the TARGET verb in 'syllables' using mid dots, e.g. 'Ur·be·völ·ker·ung'. Leave empty for non-verbs.",
    "Select vocabulary based on the user's level. Be generous: extract MORE words rather than fewer, to ensure the text is easy to understand. Include even moderately common words if they are relevant to the context.",
    "Input article text:",
    rawText,
  ].join("\n")
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 })
  }

  const body = await req.json()
  const task = body?.task as ParseTask
  const sourceLabel = typeof body?.sourceLabel === "string" ? body.sourceLabel : "Español"
  const targetLabel = typeof body?.targetLabel === "string" ? body.targetLabel : "Alemán"

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
  } else if (task === "news") {
    const rawText = typeof body?.text === "string" ? body.text.trim() : ""
    if (rawText) {
      prompt = buildNewsPrompt({
        sourceLabel,
        targetLabel,
        level: typeof body?.level === "string" ? body.level : null,
        rawText: rawText.slice(0, 12000),
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
      })
      parts = [{ text: prompt }]
    }
  } else {
    return NextResponse.json({ error: "Unknown task" }, { status: 400 })
  }

  const rawModel = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
  const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
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
    return NextResponse.json({ error: "Gemini request failed", details: data }, { status: 500 })
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text ?? "")
    .join("")
    .trim()

  if (!text) {
    return NextResponse.json({ error: "Empty response from Gemini" }, { status: 500 })
  }

  try {
    const parsed = extractJson(text)
    return NextResponse.json(parsed)
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to parse JSON response", raw: text },
      { status: 500 }
    )
  }
}
