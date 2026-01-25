import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const debug = process.env.DEBUG_AUTH === "true"
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  if (debug) {
    const params = Object.fromEntries(requestUrl.searchParams.entries())
    console.log("[auth][callback] request", {
      hasCode: Boolean(code),
      url: requestUrl.toString(),
      params,
    })
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: (name, value, options) => {
            cookieStore.set({ name, value, ...options })
          },
          remove: (name, options) => {
            cookieStore.set({ name, value: "", ...options })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (debug) {
      console.log("[auth][callback] exchange", {
        ok: !error,
        error: error?.message ?? null,
      })
    }

    const { data: sessionData } = await supabase.auth.getUser()
    const email = sessionData.user?.email?.toLowerCase() ?? ""
    if (email) {
      const { data: allowedRow } = await supabaseAdmin
        .from("allowed_users")
        .select("email")
        .eq("email", email)
        .maybeSingle()

      if (!allowedRow?.email) {
        await supabase.auth.signOut()
        return NextResponse.redirect(new URL("/login?denied=1", request.url))
      }
    }
  }

  return NextResponse.redirect(new URL("/", request.url))
}
