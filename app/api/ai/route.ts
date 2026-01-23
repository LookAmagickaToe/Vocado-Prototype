import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const DEFAULT_MODEL = "gemini-flash-latest"

type ParseTask = "parse_text" | "parse_image" | "conjugate"

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
}: {
  sourceLabel: string
  targetLabel: string
  desiredMode?: string | null
  rawText: string
}) {
  const modeLine = desiredMode
    ? `The user selected mode: "${desiredMode}". Respect it even if you disagree.`
    : "Auto-select mode based on the content."

  return [
    "You are extracting vocabulary pairs from user input.",
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    "Return ONLY valid JSON with this shape:",
    `{"mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂"}]}`,
    "Choose a fitting emoji for each item (emoji is required).",
    "Use lemma ONLY for verbs when the target word is not already the infinitive/base form.",
    "If the input provides only one language, translate into the other language.",
    "If the input already provides pairs, preserve them without changing.",
    "Input:",
    rawText,
  ].join("\n")
}

function buildImagePrompt({
  sourceLabel,
  targetLabel,
  desiredMode,
}: {
  sourceLabel: string
  targetLabel: string
  desiredMode?: string | null
}) {
  const modeLine = desiredMode
    ? `The user selected mode: "${desiredMode}". Respect it even if you disagree.`
    : "Auto-select mode based on the content."

  return [
    "You are extracting vocabulary pairs from an image of text.",
    `Source language label: "${sourceLabel}". Target language label: "${targetLabel}".`,
    modeLine,
    "Return ONLY valid JSON with this shape:",
    `{"mode":"vocab|conjugation","items":[{"source":"...","target":"...","pos":"verb|noun|adj|other","lemma":"","emoji":"🙂"}]}`,
    "Choose a fitting emoji for each item (emoji is required).",
    "Use lemma ONLY for verbs when the target word is not already the infinitive/base form.",
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
    "Use pronouns and conjugated forms in the target language.",
    `Verbs: ${JSON.stringify(verbs)}`,
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
    })
    parts = [
      { text: prompt },
      { inline_data: { mime_type: image.mimeType, data: image.data } },
    ]
  } else if (task === "conjugate") {
    const verbs = Array.isArray(body?.verbs) ? body.verbs : []
    prompt = buildConjugationPrompt({ sourceLabel, targetLabel, verbs })
    parts = [{ text: prompt }]
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

  const data = await response.json()
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
