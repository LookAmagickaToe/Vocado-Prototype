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
    const language = typeof body?.language === "string" ? body.language.trim() : ""
    const level = typeof body?.level === "string" ? body.level.trim() : ""
    const sourceLanguage =
      typeof body?.sourceLanguage === "string" ? body.sourceLanguage.trim() : ""
    const targetLanguage =
      typeof body?.targetLanguage === "string" ? body.targetLanguage.trim() : ""

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        language: language || null,
        level: level || null,
        source_language: sourceLanguage || null,
        target_language: targetLanguage || null,
      })
      .eq("id", userId)

    if (error) {
      return NextResponse.json({ error: "Update failed", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: (error as Error).message },
      { status: 400 }
    )
  }
}
