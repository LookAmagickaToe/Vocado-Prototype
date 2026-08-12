import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getUserId } from "@/lib/track-server"

// Word counts for the language tabs in Profile: one figure per track, plus the
// total across every language the user is learning.
//
// Counts come from `user_words` rather than the world blobs because it is the
// deduplicated index — a word that appears in three worlds is one word learned.

export async function GET(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin
      .from("user_words")
      .select("source_language,target_language,variant")
      .eq("user_id", userId)

    if (error) {
      return NextResponse.json({ error: "Query failed", details: error.message }, { status: 500 })
    }

    // Grouped in JS rather than SQL: PostgREST has no GROUP BY, and a user's
    // vocabulary is small enough that a round trip per track would cost more.
    const byTrack = new Map<
      string,
      { source: string; target: string; total: number; variants: Record<string, number> }
    >()

    for (const row of data ?? []) {
      const source = row.source_language ?? ""
      const target = row.target_language ?? ""
      const key = `${source}|${target}`
      let entry = byTrack.get(key)
      if (!entry) {
        entry = { source, target, total: 0, variants: {} }
        byTrack.set(key, entry)
      }
      entry.total += 1
      // Variety-specific words are counted separately so a tab can show both
      // "1,240 words" and how many of those only exist in the active variety.
      if (row.variant) {
        entry.variants[row.variant] = (entry.variants[row.variant] ?? 0) + 1
      }
    }

    const tracks = Array.from(byTrack.values()).sort((a, b) => b.total - a.total)

    return NextResponse.json({
      tracks,
      total: data?.length ?? 0,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Load failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
