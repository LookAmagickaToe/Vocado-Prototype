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

export async function POST(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const worldIds = Array.isArray(body?.worldIds)
      ? body.worldIds.filter((id: unknown) => typeof id === "string")
      : []
    const uniqueWorldIds = Array.from(new Set(worldIds))

    if (uniqueWorldIds.length === 0) {
      return NextResponse.json({ error: "No worlds provided" }, { status: 400 })
    }

    const { data: files, error: listError } = await supabaseAdmin
      .from("world_files")
      .select("world_id,storage_path")
      .eq("user_id", userId)
      .in("world_id", uniqueWorldIds)

    if (listError) {
      return NextResponse.json({ error: "Load failed", details: listError.message }, { status: 500 })
    }

    const paths = (files ?? [])
      .map((file) => file.storage_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0)

    if (paths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove(paths)
      if (storageError) {
        return NextResponse.json(
          { error: "Storage delete failed", details: storageError.message },
          { status: 500 }
        )
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("world_files")
      .delete()
      .eq("user_id", userId)
      .in("world_id", uniqueWorldIds)

    if (deleteError) {
      return NextResponse.json(
        { error: "Metadata delete failed", details: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ deletedWorldIds: uniqueWorldIds })
  } catch (error) {
    return NextResponse.json(
      { error: "Delete failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
