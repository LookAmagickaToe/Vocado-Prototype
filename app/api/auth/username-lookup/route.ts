import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const username = typeof body?.username === "string" ? body.username.trim() : ""
    if (!username) {
      return NextResponse.json({ error: "Missing username" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("username", username)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: "Lookup failed", details: error.message }, { status: 500 })
    }

    if (!data?.email) {
      return NextResponse.json({ error: "Username not found" }, { status: 404 })
    }

    return NextResponse.json({ email: data.email })
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: (error as Error).message },
      { status: 400 }
    )
  }
}
