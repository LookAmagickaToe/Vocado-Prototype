import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

function slugifyUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

async function usernameExists(username: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle()
  return !!data
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = typeof body?.userId === "string" ? body.userId : ""
    const email = typeof body?.email === "string" ? body.email : ""

    if (!userId || !email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json({ ok: true, existing: true })
    }

    const base = slugifyUsername(email.split("@")[0] ?? "user") || "user"
    let candidate = base
    let attempt = 0
    while (await usernameExists(candidate)) {
      attempt += 1
      candidate = `${base}_${attempt}`
      if (attempt > 50) break
    }

    const { error } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      email,
      username: candidate,
    })

    if (error) {
      return NextResponse.json({ error: "Insert failed", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, username: candidate })
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: (error as Error).message },
      { status: 400 }
    )
  }
}
