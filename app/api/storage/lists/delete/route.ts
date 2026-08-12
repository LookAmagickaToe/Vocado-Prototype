import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getUserId } from "@/lib/track-server"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"

// Not track-scoped, for the same reason as worlds/delete: the list id is
// explicit and already owned by the user, and scoping the lookup would turn a
// track mismatch into a silent no-op.
export async function POST(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const listId = typeof body?.listId === "string" ? body.listId.trim() : ""
    if (!listId) {
      return NextResponse.json({ error: "Missing listId" }, { status: 400 })
    }

    // Ignore non-UUID list IDs (e.g. temporary client IDs)
    // If it's not a UUID, it can't be in the DB, so consider it deleted.
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_REGEX.test(listId)) {
      return NextResponse.json({ deletedListId: listId })
    }

    const { data: files, error: filesError } = await supabaseAdmin
      .from("world_files")
      .select("world_id,storage_path")
      .eq("user_id", userId)
      .eq("list_id", listId)

    if (filesError) {
      return NextResponse.json(
        { error: "Load failed", details: filesError.message },
        { status: 500 }
      )
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

    if (files && files.length > 0) {
      const { error: deleteWorldsError } = await supabaseAdmin
        .from("world_files")
        .delete()
        .eq("user_id", userId)
        .eq("list_id", listId)

      if (deleteWorldsError) {
        return NextResponse.json(
          { error: "World delete failed", details: deleteWorldsError.message },
          { status: 500 }
        )
      }
    }

    const { error: listDeleteError } = await supabaseAdmin
      .from("lists")
      .delete()
      .eq("user_id", userId)
      .eq("id", listId)

    if (listDeleteError) {
      return NextResponse.json(
        { error: "List delete failed", details: listDeleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ deletedListId: listId })
  } catch (error) {
    return NextResponse.json(
      { error: "Delete failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
