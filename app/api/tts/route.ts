// Read-aloud audio for a news article.
//
// One ElevenLabs call produces the whole article's audio plus character-level
// timings; those timings then let the client play any sentence or word by
// seeking, so sub-segment playback costs nothing extra.
//
// The cache is content-addressed and shared across users: the same text in the
// same voice is generated once, no matter how many people read it. Cost
// therefore tracks distinct articles, not plays.

import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getRequestContext } from "@/lib/track-server"
import { joinParagraphs } from "@/lib/news/segment"
import { buildMarks, isAlignment } from "@/lib/tts/marks"
import {
  OUTPUT_FORMAT,
  resolveVoice,
} from "@/lib/tts/voices"
import type { TtsMarks } from "@/lib/tts/types"

export const runtime = "nodejs"
export const maxDuration = 60

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"
const PREFIX = "_tts"
const SIGNED_URL_TTL_SECONDS = 3600

/** A Diario article is ~800 characters; this leaves generous headroom while
 *  keeping a single request from being an unbounded charge. */
const MAX_CHARS = 3000

/** Per-user, per-day ceiling on characters actually sent to the provider.
 *  ~25 articles/day at typical length. Cache hits never count against it. */
const DAILY_CHAR_LIMIT = Number(process.env.TTS_DAILY_CHAR_LIMIT ?? 20000)

function audioPath(hash: string) {
  return `${PREFIX}/${hash}.mp3`
}

function marksPath(hash: string) {
  return `${PREFIX}/${hash}.json`
}

async function signedAudioUrl(hash: string): Promise<string | null> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(audioPath(hash), SIGNED_URL_TTL_SECONDS)
  return data?.signedUrl ?? null
}

/** Cached marks, or null if this text has never been generated. */
async function readCachedMarks(hash: string): Promise<TtsMarks | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(marksPath(hash))
  if (error || !data) return null
  try {
    return JSON.parse(await data.text()) as TtsMarks
  } catch {
    // A corrupt marks blob should regenerate rather than break playback.
    return null
  }
}

/**
 * Reserve `chars` against the caller's daily budget.
 *
 * Read-modify-write, so two simultaneous generations can both pass on the same
 * read and overshoot slightly. That is acceptable: the ceiling exists to stop
 * runaway looping, not to bill precisely, and the overshoot is bounded by the
 * per-request cap.
 */
async function reserveQuota(userId: string, chars: number): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("tts_chars_today,tts_chars_date")
    .eq("id", userId)
    .maybeSingle()

  const usedToday = data?.tts_chars_date === today ? data?.tts_chars_today ?? 0 : 0
  if (usedToday + chars > DAILY_CHAR_LIMIT) return false

  await supabaseAdmin
    .from("profiles")
    .update({ tts_chars_today: usedToday + chars, tts_chars_date: today })
    .eq("id", userId)

  return true
}

/** Undo a reservation when ElevenLabs rejects the request before generating
 * audio. Provider failures must not consume the user's Vocado daily limit. */
async function releaseQuota(userId: string, chars: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("tts_chars_today,tts_chars_date")
    .eq("id", userId)
    .maybeSingle()

  if (data?.tts_chars_date !== today) return
  await supabaseAdmin
    .from("profiles")
    .update({ tts_chars_today: Math.max(0, (data?.tts_chars_today ?? 0) - chars) })
    .eq("id", userId)
}

function elevenLabsError(details: string, providerStatus: number) {
  let code = ""
  let message = ""
  try {
    const payload = JSON.parse(details)
    code = typeof payload?.detail?.code === "string" ? payload.detail.code : ""
    message = typeof payload?.detail?.message === "string" ? payload.detail.message : ""
  } catch {
    // A non-JSON provider response still falls back to the generic error below.
  }

  if (code === "quota_exceeded") {
    return {
      status: 429,
      body: {
        error: "ElevenLabs API key credit limit reached. Increase the key's credit quota.",
        code: "ELEVENLABS_QUOTA_EXCEEDED",
        details: message,
      },
    }
  }

  if (code === "missing_permissions") {
    return {
      status: 403,
      body: {
        error: "ElevenLabs API key needs Text to Speech access.",
        code: "ELEVENLABS_TTS_ACCESS_REQUIRED",
        details: message,
      },
    }
  }

  return {
    status: 502,
    body: {
      error: `Speech generation failed (${providerStatus})`,
      code: "ELEVENLABS_GENERATION_FAILED",
      details: message || details.slice(0, 500),
    },
  }
}

async function savedVoiceId(
  userId: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("user_tracks")
    .select("tts_voice_id")
    .eq("user_id", userId)
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
    .maybeSingle()

  if (error) throw new Error(`Voice settings are not installed: ${error.message}`)
  return typeof data?.tts_voice_id === "string" ? data.tts_voice_id : null
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    // Auth is the first gate: this route spends real money per call, and an
    // anonymous caller should not be able to probe the server's configuration
    // by reading which internal error comes back.
    const context = await getRequestContext(req, {
      source: body?.sourceLanguage,
      target: body?.targetLanguage,
      variant: body?.variant,
    })
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { userId, track } = context

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 })
    }

    const paragraphs = Array.isArray(body?.paragraphs)
      ? body.paragraphs.filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
      : []

    if (!paragraphs.length) {
      return NextResponse.json({ error: "No paragraphs provided" }, { status: 400 })
    }

    const text = joinParagraphs(paragraphs)
    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `Text too long (${text.length} chars, max ${MAX_CHARS})` },
        { status: 413 }
      )
    }

    // The language of the text being spoken, which is not always the track's
    // target — the reader can show either side of the article.
    const language = typeof body?.language === "string" && body.language.trim()
      ? body.language.trim()
      : track.target
    const variant = typeof body?.variant === "string" && body.variant.trim()
      ? body.variant.trim()
      : track.variant

    // The saved voice ID is revalidated against the live ElevenLabs language
    // list before use. If a provider removes a voice, use the first verified
    // alternative instead of trying a stale arbitrary ID.
    const voiceId = await savedVoiceId(userId, track.source, track.target)
    const voice = await resolveVoice(language, variant, voiceId, apiKey)

    const hash = createHash("sha256")
      .update(`${voice.modelId}|${voice.voiceId}|${OUTPUT_FORMAT}|${text}`)
      .digest("hex")

    // ── Cache hit ────────────────────────────────────────────────────────────
    const cached = await readCachedMarks(hash)
    if (cached) {
      const url = await signedAudioUrl(hash)
      if (url) {
        await supabaseAdmin
          .from("tts_cache")
          .update({ last_used_at: new Date().toISOString() })
          .eq("hash", hash)

        return NextResponse.json({
          hash,
          url,
          marks: cached,
          voiceId: voice.voiceId,
          modelId: voice.modelId,
          language,
          variant: voice.variant,
          cached: true,
        })
      }
      // Marks survived but the audio blob did not — fall through and regenerate.
    }

    // ── Generate ─────────────────────────────────────────────────────────────
    if (!(await reserveQuota(userId, text.length))) {
      return NextResponse.json(
        { error: "Daily audio limit reached", limit: DAILY_CHAR_LIMIT },
        { status: 429 }
      )
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: voice.modelId,
          language_code: voice.code,
        }),
      }
    )

    if (!response.ok) {
      const details = await response.text().catch(() => "")
      console.error(`[tts] ElevenLabs ${response.status}: ${details.slice(0, 500)}`)
      await releaseQuota(userId, text.length)
      const failure = elevenLabsError(details, response.status)
      return NextResponse.json(failure.body, { status: failure.status })
    }

    const payload = await response.json()
    const audioBase64 = payload?.audio_base64
    if (typeof audioBase64 !== "string" || !audioBase64) {
      return NextResponse.json({ error: "Provider returned no audio" }, { status: 502 })
    }
    if (!isAlignment(payload?.alignment)) {
      return NextResponse.json({ error: "Provider returned no alignment" }, { status: 502 })
    }

    const marks = buildMarks(paragraphs, payload.alignment)
    if (!marks.words) {
      // Not fatal — sentence playback still works — but it means the provider
      // normalized the text, and word karaoke is off for this article.
      console.warn(`[tts] ${hash}: alignment did not match input; word timings disabled`)
    }

    const audio = Buffer.from(audioBase64, "base64")

    // upsert so two users racing on the same uncached article is harmless:
    // identical input means identical bytes, so last write wins costs nothing.
    const [audioUpload, marksUpload] = await Promise.all([
      supabaseAdmin.storage.from(BUCKET).upload(audioPath(hash), audio, {
        contentType: "audio/mpeg",
        upsert: true,
      }),
      supabaseAdmin.storage.from(BUCKET).upload(marksPath(hash), JSON.stringify(marks), {
        contentType: "application/json",
        upsert: true,
      }),
    ])

    if (audioUpload.error || marksUpload.error) {
      console.error("[tts] upload failed", audioUpload.error ?? marksUpload.error)
      return NextResponse.json({ error: "Failed to store audio" }, { status: 500 })
    }

    await supabaseAdmin.from("tts_cache").upsert(
      {
        hash,
        language,
        variant: voice.variant,
        voice_id: voice.voiceId,
        model_id: voice.modelId,
        char_count: text.length,
        duration_sec: marks.durationSec,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "hash" }
    )

    const url = await signedAudioUrl(hash)
    if (!url) {
      return NextResponse.json({ error: "Failed to sign audio url" }, { status: 500 })
    }

    return NextResponse.json({
      hash,
      url,
      marks,
      voiceId: voice.voiceId,
      modelId: voice.modelId,
      language,
      variant: voice.variant,
      cached: false,
    })
  } catch (error: any) {
    console.error("[tts] unexpected error", error)
    return NextResponse.json(
      { error: "Speech generation failed", details: error?.message },
      { status: 500 }
    )
  }
}
