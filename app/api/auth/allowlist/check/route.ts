import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!email) {
      return NextResponse.json({ allowed: false }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("allowed_users")
      .select("email")
      .eq("email", email)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { allowed: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ allowed: Boolean(data?.email) })
  } catch (error) {
    return NextResponse.json(
      { allowed: false, error: (error as Error).message },
      { status: 400 }
    )
  }
}
