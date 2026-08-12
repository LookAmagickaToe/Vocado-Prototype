import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getUserId } from "@/lib/track-server"
import { buildTrack } from "@/lib/track"
import { languageLabel, slugifyVariant } from "@/lib/languages"

// The language tabs in Profile.
//
// `user_tracks` is the durable per-track state — one row per language the user
// is learning, each with its own CEFR level and variety. `profiles` holds a
// pointer to whichever one is active, which is what lets every existing page and
// component keep reading profiles.source_language / target_language unchanged.

type TrackRow = {
  id: string
  source_language: string
  target_language: string
  variant: string | null
  level: string | null
  position: number
  last_used_at: string | null
}

async function listTracks(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_tracks")
    .select("id,source_language,target_language,variant,level,position,last_used_at")
    .eq("user_id", userId)
    .order("position", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TrackRow[]
}

/** Point `profiles` at a track and mark it as most recently used. */
async function activate(userId: string, track: TrackRow) {
  await supabaseAdmin
    .from("profiles")
    .update({
      source_language: track.source_language,
      target_language: track.target_language,
      active_variant: track.variant,
      level: track.level,
    })
    .eq("id", userId)

  await supabaseAdmin
    .from("user_tracks")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", track.id)
    .eq("user_id", userId)
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tracks = await listTracks(userId)

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("source_language,target_language,active_variant")
      .eq("id", userId)
      .maybeSingle()

    const active = buildTrack({
      source: profile?.source_language,
      target: profile?.target_language,
      variant: profile?.active_variant,
    })

    return NextResponse.json({ tracks, active })
  } catch (error) {
    return NextResponse.json(
      { error: "Load failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * Create a track, update one, or switch which is active.
 * Body: { action: "create" | "update" | "switch" | "delete", ... }
 */
export async function POST(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const action = typeof body?.action === "string" ? body.action : "switch"

    if (action === "create") {
      const source = languageLabel(body?.sourceLanguage, "")
      const target = languageLabel(body?.targetLanguage, "")
      if (!source || !target) {
        return NextResponse.json({ error: "Unknown language" }, { status: 400 })
      }
      if (source === target) {
        return NextResponse.json(
          { error: "A language cannot be learned from itself" },
          { status: 400 }
        )
      }

      const existing = await listTracks(userId)
      const duplicate = existing.find(
        (row) => row.source_language === source && row.target_language === target
      )
      // Adding a language you already have is a switch to it, not an error.
      if (duplicate) {
        await activate(userId, duplicate)
        return NextResponse.json({ track: duplicate, created: false })
      }

      const { data, error } = await supabaseAdmin
        .from("user_tracks")
        .insert({
          user_id: userId,
          source_language: source,
          target_language: target,
          variant: slugifyVariant(body?.variant),
          level: typeof body?.level === "string" ? body.level : "A2",
          position: existing.length,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Create failed", details: error.message }, { status: 500 })
      }

      await activate(userId, data as TrackRow)
      return NextResponse.json({ track: data, created: true })
    }

    const trackId = typeof body?.trackId === "string" ? body.trackId : ""
    if (!trackId) {
      return NextResponse.json({ error: "Missing trackId" }, { status: 400 })
    }

    const tracks = await listTracks(userId)
    const target = tracks.find((row) => row.id === trackId)
    if (!target) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 })
    }

    if (action === "switch") {
      await activate(userId, target)
      return NextResponse.json({ track: target })
    }

    if (action === "update") {
      const patch: Record<string, unknown> = {}
      if (typeof body?.level === "string") patch.level = body.level
      // `variant` is sent explicitly as null to clear it, so presence in the body
      // matters rather than truthiness.
      if ("variant" in body) patch.variant = slugifyVariant(body.variant)

      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ track: target })
      }

      const { data, error } = await supabaseAdmin
        .from("user_tracks")
        .update(patch)
        .eq("id", trackId)
        .eq("user_id", userId)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Update failed", details: error.message }, { status: 500 })
      }

      // Keep the profile pointer in step when the edited track is the active one.
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("source_language,target_language")
        .eq("id", userId)
        .maybeSingle()

      if (
        profile?.source_language === target.source_language &&
        profile?.target_language === target.target_language
      ) {
        await activate(userId, data as TrackRow)
      }

      return NextResponse.json({ track: data })
    }

    if (action === "delete") {
      if (tracks.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove your only language" },
          { status: 400 }
        )
      }

      const { error } = await supabaseAdmin
        .from("user_tracks")
        .delete()
        .eq("id", trackId)
        .eq("user_id", userId)

      if (error) {
        return NextResponse.json({ error: "Delete failed", details: error.message }, { status: 500 })
      }

      // Removing the tab does not delete the worlds or vocabulary behind it —
      // they stay filed under that language pair and come back if it is re-added.
      const remaining = tracks.filter((row) => row.id !== trackId)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("source_language,target_language")
        .eq("id", userId)
        .maybeSingle()

      const removedWasActive =
        profile?.source_language === target.source_language &&
        profile?.target_language === target.target_language

      if (removedWasActive && remaining[0]) {
        await activate(userId, remaining[0])
      }

      return NextResponse.json({ deletedTrackId: trackId, active: remaining[0] ?? null })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: "Request failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
