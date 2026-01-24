import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function safeSegment(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || "world"
}

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
    const worlds = Array.isArray(body?.worlds) ? body.worlds : []
    const rawListId = typeof body?.listId === "string" ? body.listId : null
    const trimmedListId = rawListId && rawListId.trim().length > 0 ? rawListId.trim() : null
    const listId = trimmedListId && UUID_REGEX.test(trimmedListId) ? trimmedListId : null
    const positions = typeof body?.positions === "object" && body?.positions ? body.positions : {}

    if (!worlds.length) {
      return NextResponse.json({ error: "No worlds provided" }, { status: 400 })
    }

    const saved: Array<{ worldId: string; path: string }> = []

    for (let i = 0; i < worlds.length; i += 1) {
      const world = worlds[i]
      const worldId = world?.id ?? `world-${Date.now()}-${i + 1}`
      const title = world?.title ?? worldId
      const filename = `${Date.now()}-${safeSegment(title)}.json`
      const path = `${userId}/${filename}`

      const upload = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, JSON.stringify(world, null, 2), {
          contentType: "application/json",
          upsert: false,
        })

      if (upload.error) {
        return NextResponse.json(
          { error: "Upload failed", details: upload.error.message },
          { status: 500 }
        )
      }

      const position = typeof positions[worldId] === "number" ? positions[worldId] : i

      const { error } = await supabaseAdmin
        .from("world_files")
        .upsert(
          {
            user_id: userId,
            world_id: worldId,
            title,
            storage_path: path,
            list_id: listId,
            position,
            hidden: false,
          },
          { onConflict: "user_id,world_id" }
        )

      if (error) {
        return NextResponse.json(
          { error: "Metadata upsert failed", details: error.message },
          { status: 500 }
        )
      }

      saved.push({ worldId, path })
    }

    return NextResponse.json({ saved })
  } catch (error) {
    return NextResponse.json(
      { error: "Save failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
