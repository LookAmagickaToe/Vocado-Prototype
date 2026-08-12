import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getRequestContext } from "@/lib/track-server"
import { trackColumns } from "@/lib/track"

export async function POST(req: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server missing Supabase credentials" },
        { status: 500 }
      )
    }

    const body = await req.json()
    const context = await getRequestContext(req, {
      source: body?.sourceLanguage,
      target: body?.targetLanguage,
      variant: body?.variant,
    })
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { userId, track } = context

    const lists = Array.isArray(body?.lists) ? body.lists : []
    const worlds = Array.isArray(body?.worlds) ? body.worlds : []

    if (lists.length > 0) {
      // A list belongs to the track it was created in, or worlds/list would
      // filter it out and its worlds would look orphaned.
      const payload = lists.map((list: any, index: number) => ({
        id: list.id,
        user_id: userId,
        name: list.name,
        position: typeof list.position === "number" ? list.position : index,
        ...trackColumns(track),
      }))
      const { error } = await supabaseAdmin.from("lists").upsert(payload)
      if (error) {
        return NextResponse.json({ error: "List upsert failed", details: error.message }, { status: 500 })
      }
    }

    if (worlds.length > 0) {
      const worldIds = worlds.map((world: any) => world.worldId).filter(Boolean)
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("world_files")
        .select("world_id,storage_path")
        .eq("user_id", userId)
        .in("world_id", worldIds)
      if (existingError) {
        return NextResponse.json(
          { error: "World lookup failed", details: existingError.message },
          { status: 500 }
        )
      }

      const storageMap = new Map<string, string>()
      existing?.forEach((row) => {
        if (row?.world_id && row?.storage_path) {
          storageMap.set(row.world_id, row.storage_path)
        }
      })

      const payload = worlds
        .map((world: any, index: number) => {
          const storagePath = storageMap.get(world.worldId)
          if (!storagePath) return null
          return {
            user_id: userId,
            world_id: world.worldId,
            title: world.title,
            storage_path: storagePath,
            list_id: world.listId ?? null,
            position: typeof world.position === "number" ? world.position : index,
            hidden: !!world.hidden,
            ...trackColumns(track),
          }
        })
        .filter(Boolean)

      if (payload.length > 0) {
        const { error } = await supabaseAdmin
          .from("world_files")
          .upsert(payload, { onConflict: "user_id,world_id" })
        if (error) {
          return NextResponse.json({ error: "World upsert failed", details: error.message }, { status: 500 })
        }
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
