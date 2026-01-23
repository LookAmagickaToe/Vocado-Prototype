import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import path from "path"
import fs from "fs/promises"

const UPLOADS_DIR =
  process.env.VOCAB_UPLOADS_DIR ?? path.join(process.cwd(), "data", "uploads")

function safeSegment(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || "default"
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const worlds = Array.isArray(body?.worlds) ? body.worlds : []
  const listId = typeof body?.listId === "string" ? body.listId : ""
  const listName = typeof body?.listName === "string" ? body.listName : ""

  if (!worlds.length) {
    return NextResponse.json({ error: "No worlds provided" }, { status: 400 })
  }

  const folderName = safeSegment(listId || listName || "unlisted")
  const dir = path.join(UPLOADS_DIR, folderName)
  await fs.mkdir(dir, { recursive: true })

  const timestamp = Date.now()
  const saved: Array<{ file: string }> = []

  for (let i = 0; i < worlds.length; i += 1) {
    const world = worlds[i]
    const baseName = safeSegment(world?.title || world?.id || `world-${i + 1}`)
    const filename = `${baseName}-${timestamp}-${i + 1}.json`
    const filePath = path.join(dir, filename)
    await fs.writeFile(filePath, JSON.stringify(world, null, 2), "utf8")
    saved.push({ file: filename })
  }

  return NextResponse.json({ saved, dir })
}
