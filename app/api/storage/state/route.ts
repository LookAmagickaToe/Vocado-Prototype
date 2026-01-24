import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

async function getUserId(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data.user?.id ?? null
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const lists = Array.isArray(body?.lists) ? body.lists : []
    const worlds = Array.isArray(body?.worlds) ? body.worlds : []

    if (lists.length > 0) {
      const payload = lists.map((list: any, index: number) => ({
        id: list.id,
        user_id: userId,
        name: list.name,
        position: typeof list.position === "number" ? list.position : index,
      }))
      const { error } = await supabaseAdmin.from("lists").upsert(payload)
      if (error) {
        return NextResponse.json({ error: "List upsert failed", details: error.message }, { status: 500 })
      }
    }

    if (worlds.length > 0) {
      const payload = worlds.map((world: any, index: number) => ({
        user_id: userId,
        world_id: world.worldId,
        title: world.title,
        list_id: world.listId ?? null,
        position: typeof world.position === "number" ? world.position : index,
        hidden: !!world.hidden,
      }))
      const { error } = await supabaseAdmin.from("world_files").upsert(payload)
      if (error) {
        return NextResponse.json({ error: "World upsert failed", details: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Save failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
