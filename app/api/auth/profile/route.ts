import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const userId = typeof body?.userId === "string" ? body.userId : ""
    const email = typeof body?.email === "string" ? body.email : ""
    const username = typeof body?.username === "string" ? body.username.trim() : ""

    if (!userId || !email || !username) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      username,
    })

    if (error) {
      return NextResponse.json({ error: "Upsert failed", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: (error as Error).message },
      { status: 400 }
    )
  }
}
