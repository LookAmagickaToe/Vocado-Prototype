import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getRequestContext, trackFromSearchParams } from "@/lib/track-server"
import { applyTrackScope } from "@/lib/track"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const context = await getRequestContext(req, trackFromSearchParams(searchParams))
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { userId, track } = context

    // Only this track's worlds, with a variety inheriting its base language's.
    const { data: files, error } = await applyTrackScope(
      supabaseAdmin
        .from("world_files")
        .select("world_id,title,storage_path,list_id,position,hidden")
        .eq("user_id", userId) as any,
      track
    ).order("position", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Query failed", details: error.message }, { status: 500 })
    }

    const worlds = []
    for (const file of files ?? []) {
      const download = await supabaseAdmin.storage.from(BUCKET).download(file.storage_path)
      if (download.error) {
        continue
      }
      const text = await download.data.text()
      worlds.push({
        worldId: file.world_id,
        title: file.title,
        listId: file.list_id,
        position: file.position,
        hidden: file.hidden,
        json: JSON.parse(text),
      })
    }

    const { data: lists, error: listError } = await applyTrackScope(
      supabaseAdmin
        .from("lists")
        .select("id,name,position")
        .eq("user_id", userId) as any,
      track
    ).order("position", { ascending: true })

    if (listError) {
      return NextResponse.json({ error: "Lists query failed", details: listError.message }, { status: 500 })
    }

    return NextResponse.json({ worlds, lists, track })
  } catch (error) {
    return NextResponse.json(
      { error: "Load failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
