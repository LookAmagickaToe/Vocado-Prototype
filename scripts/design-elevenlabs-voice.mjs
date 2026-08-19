#!/usr/bin/env node

// Admin-only helper for filling an accent slot. It generates three audition
// files and stops there: a human must listen before adding one to the ElevenLabs
// library and putting its final voice ID in Vercel.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

function argsFrom(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]
    if (!item.startsWith("--")) continue
    result[item.slice(2)] = argv[index + 1]
    index += 1
  }
  return result
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const args = argsFrom(process.argv.slice(2))
const language = args.language?.trim()
const accent = args.accent?.trim()
const gender = args.gender?.trim().toLowerCase()
const textFile = args["text-file"]?.trim()
const slot = args.slot?.trim()

if (!language || !accent || !["female", "male"].includes(gender)) {
  fail(
    "Usage: npm run voice:design -- --language Deutsch --accent Bayerisch --gender female --slot female-1 --text-file ./sample.txt"
  )
}
if (!textFile) fail("--text-file is required; use authentic text written in the requested variety.")
if (slot && !["female-1", "female-2", "male-1", "male-2"].includes(slot)) {
  fail("--slot must be female-1, female-2, male-1, or male-2.")
}

const apiKey = process.env.ELEVENLABS_API_KEY
if (!apiKey) fail("ELEVENLABS_API_KEY is not set in this shell.")

const text = (await readFile(resolve(textFile), "utf8")).trim()
if (text.length < 100 || text.length > 1000) {
  fail(`Preview text must contain 100-1000 characters; received ${text.length}.`)
}

const voiceDescription = [
  `A native ${accent} speaker of ${language}.`,
  `An adult ${gender} voice with authentic, contemporary regional pronunciation and phonology.`,
  "Warm, clear educational newsreader delivery at a measured natural pace.",
  "Consistent articulation for language learners, with natural sentence melody and no exaggerated character acting.",
  `The ${accent} variety must sound locally authentic rather than like a non-native imitation or caricature.`,
].join(" ")

const response = await fetch("https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128", {
  method: "POST",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    voice_description: voiceDescription,
    model_id: "eleven_ttv_v3",
    text,
    guidance_scale: 7,
    quality: 0.8,
  }),
})

if (!response.ok) {
  const details = await response.text().catch(() => "")
  fail(`ElevenLabs Voice Design failed (${response.status}): ${details.slice(0, 500)}`)
}

const data = await response.json()
const previews = Array.isArray(data?.previews) ? data.previews : []
if (!previews.length) fail("ElevenLabs returned no voice previews.")

const safeName = `${language}-${accent}-${gender}`
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
const outputDir = resolve("voice-previews", safeName)
await mkdir(outputDir, { recursive: true })

const manifest = {
  language,
  accent,
  gender,
  slot: slot ?? null,
  voiceDescription,
  previewText: text,
  generatedAt: new Date().toISOString(),
  previews: [],
}

for (let index = 0; index < previews.length; index += 1) {
  const preview = previews[index]
  const encoded = preview?.audio_base_64
  if (typeof encoded !== "string" || !encoded) continue
  const filename = `candidate-${index + 1}.mp3`
  await writeFile(resolve(outputDir, filename), Buffer.from(encoded, "base64"))
  manifest.previews.push({
    filename,
    generatedVoiceId: preview.generated_voice_id,
    durationSeconds: preview.duration_secs,
    language: preview.language,
  })
}

await writeFile(resolve(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2))
console.log(`Created ${manifest.previews.length} audition files in ${outputDir}`)
console.log("Listen to every candidate with a native speaker before creating a permanent voice.")
