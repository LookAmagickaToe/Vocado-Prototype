import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { indexUserWords, shouldIndexWorld } from "@/lib/user-words"
import { getRequestContext } from "@/lib/track-server"
import { trackColumns } from "@/lib/track"

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

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // A world belongs to whichever track was active when it was created. The
    // client may pass that track explicitly — a switch that has not yet reached
    // `profiles` must not file new content under the previous language.
    const context = await getRequestContext(req, {
      source: body?.sourceLanguage,
      target: body?.targetLanguage,
      variant: body?.variant,
    })
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { userId, track } = context

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
      // Stamp the track into the blob as well as onto the row. The blob is the
      // source of truth that survives a re-import, and AppClient filters worlds
      // client-side by reading these fields off it.
      const world = { ...worlds[i], ...trackColumns(track) }
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
            ...trackColumns(track),
          },
          { onConflict: "user_id,world_id" }
        )

      if (error) {
        return NextResponse.json(
          { error: "Metadata upsert failed", details: error.message },
          { status: 500 }
        )
      }

      // Saving an article makes its narration permanent for this user. The audio
      // blob is shared and content-addressed, so pinning the row is enough —
      // nothing is copied, and a future prune must skip it. Best effort.
      const audioHash = world?.news?.audio?.hash
      if (typeof audioHash === "string" && audioHash) {
        const { error: pinError } = await supabaseAdmin
          .from("tts_cache")
          .update({ pinned: true })
          .eq("hash", audioHash)
        if (pinError) {
          console.error("[worlds/save] failed to pin tts_cache row", pinError)
        }
      }

      // Mirror the pool into the queryable word index so later generations can
      // avoid repeating these words. Best effort: never fails the save.
      if (shouldIndexWorld(world)) {
        await indexUserWords(userId, world.pool ?? [], "theme", worldId, track)
      }

      saved.push({ worldId, path })
    }

    revalidatePath("/play")
    revalidatePath("/")
    return NextResponse.json({ saved })
  } catch (error) {
    return NextResponse.json(
      { error: "Save failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
