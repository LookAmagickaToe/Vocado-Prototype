import { NextResponse } from "next/server"
import { getUserId } from "@/lib/track-server"
import { listVoiceOptions } from "@/lib/tts/voices"

/**
 * Public settings metadata from the caller's ElevenLabs library. Voice IDs are
 * safe to return as selections; the API key remains server-only.
 */
export async function GET(req: Request) {
  const userId = await getUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const language = params.get("language") ?? "Español"
  const variant = params.get("variant") || null

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 })
  }

  try {
    return NextResponse.json(
      { options: await listVoiceOptions(language, variant, apiKey) },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    const details = (error as Error).message
    const missingVoiceAccess = details.includes("Voices Read access")
    return NextResponse.json(
      {
        error: missingVoiceAccess
          ? "ElevenLabs API key needs Voices Read access"
          : "Could not load ElevenLabs voices",
        code: missingVoiceAccess ? "ELEVENLABS_VOICES_READ_REQUIRED" : "ELEVENLABS_VOICES_LOAD_FAILED",
        details,
      },
      { status: missingVoiceAccess ? 403 : 502 }
    )
  }
}
