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
    const seeds = Number.isFinite(body?.seeds) ? Number(body.seeds) : null
    const weeklyWords = Number.isFinite(body?.weeklyWords) ? Number(body.weeklyWords) : null
    const weekStart =
      typeof body?.weekStart === "string" ? body.weekStart.trim() : null

    const payload: Record<string, number | string | null> = {}
    if (seeds !== null && seeds >= 0) payload.seeds = Math.floor(seeds)
    if (weeklyWords !== null && weeklyWords >= 0) payload.weekly_words = Math.floor(weeklyWords)
    if (weekStart) payload.weekly_words_week_start = weekStart

    if (!Object.keys(payload).length) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
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
