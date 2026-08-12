import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { indexUserWords, shouldIndexWorld, type KnownWord } from "@/lib/user-words"
import { getRequestContext, trackFromSearchParams } from "@/lib/track-server"
import { applyTrackScope, buildTrack, type Track } from "@/lib/track"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"
const MAX_WORDS = 3000

/**
 * One-time migration of a user's existing vocabulary into `user_words`. The words
 * were only ever stored as JSON blobs, so the first request after deploying the
 * index has to walk them. `profiles.words_indexed_at` makes sure a user with an
 * genuinely empty vocabulary does not re-scan storage on every call.
 *
 * Each world is filed under the track recorded in its own blob, not under
 * whichever track happens to be active now — otherwise a user who backfills while
 * studying English would have their German vocabulary indexed as English.
 */
async function backfill(userId: string, fallbackTrack: Track) {
  const { data: files } = await supabaseAdmin
    .from("world_files")
    .select("world_id,storage_path")
    .eq("user_id", userId)

  for (const file of files ?? []) {
    const download = await supabaseAdmin.storage.from(BUCKET).download(file.storage_path)
    if (download.error) continue
    try {
      const world = JSON.parse(await download.data.text())
      if (!shouldIndexWorld(world)) continue
      const worldTrack = world?.source_language && world?.target_language
        ? buildTrack({
            source: world.source_language,
            target: world.target_language,
            variant: world.variant,
          })
        : fallbackTrack
      await indexUserWords(userId, world.pool ?? [], "import", file.world_id, worldTrack)
    } catch {
      // corrupt blob — skip it rather than failing the whole backfill
    }
  }

  await supabaseAdmin
    .from("profiles")
    .update({ words_indexed_at: new Date().toISOString() })
    .eq("id", userId)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const context = await getRequestContext(req, trackFromSearchParams(searchParams))
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { userId, track } = context

    // "Do I already know this word?" is a per-track question — knowing `Haus` in
    // German says nothing about whether you know `house` in English.
    const select = () =>
      applyTrackScope(
        supabaseAdmin
          .from("user_words")
          .select("source,target,norm_source,norm_target")
          .eq("user_id", userId) as any,
        track
      )
        .order("created_at", { ascending: false })
        .limit(MAX_WORDS)

    let { data, error } = await select()
    if (error) {
      return NextResponse.json({ error: "Query failed", details: error.message }, { status: 500 })
    }

    if ((data?.length ?? 0) === 0) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("words_indexed_at")
        .eq("id", userId)
        .single()

      if (!profile?.words_indexed_at) {
        await backfill(userId, track)
        const retry = await select()
        if (!retry.error) data = retry.data
      }
    }

    const words: KnownWord[] = (data ?? []).map((row: any) => ({
      source: row.source,
      target: row.target,
      normSource: row.norm_source,
      normTarget: row.norm_target,
    }))

    return NextResponse.json({ words, total: words.length })
  } catch (error) {
    return NextResponse.json(
      { error: "Load failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
