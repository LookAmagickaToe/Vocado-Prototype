import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"

async function getUserId(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data.user?.id ?? null
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: files, error } = await supabaseAdmin
      .from("world_files")
      .select("world_id,title,storage_path,list_id,position,hidden")
      .eq("user_id", userId)
      .order("position", { ascending: true })

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

    const { data: lists, error: listError } = await supabaseAdmin
      .from("lists")
      .select("id,name,position")
      .eq("user_id", userId)
      .order("position", { ascending: true })

    if (listError) {
      return NextResponse.json({ error: "Lists query failed", details: listError.message }, { status: 500 })
    }

    return NextResponse.json({ worlds, lists })
  } catch (error) {
    return NextResponse.json(
      { error: "Load failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
