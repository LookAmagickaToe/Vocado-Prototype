import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function POST(req: Request) {
  try {
    return NextResponse.json({ allowed: true })
  } catch (error) {
    return NextResponse.json({ allowed: true })
  }
}
