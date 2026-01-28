import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function middleware(req: NextRequest) {
  const debug = process.env.DEBUG_AUTH === "true"
  const res = NextResponse.next()
  const pathname = req.nextUrl.pathname
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return res
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({ name, value, ...options })
        },
        remove: (name, options) => {
          res.cookies.set({ name, value: "", ...options })
        },
      },
    }
  )
  const { data } = await supabase.auth.getUser()
  if (debug) {
    const sbCookies = req.cookies
      .getAll()
      .map((cookie) => cookie.name)
      .filter((name) => name.startsWith("sb-"))
    console.log("[auth][middleware]", {
      pathname,
      hasUser: Boolean(data.user),
      sbCookies,
    })
  }

  const isLogin = pathname.startsWith("/login")
  const isAuthCallback = pathname.startsWith("/auth/callback")
  const isApi = pathname.startsWith("/api")
  const isPrefetch =
    req.headers.get("x-middleware-prefetch") === "1" ||
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch"

  if (!data.user && !isLogin && !isAuthCallback && !isApi) {
    if (debug) {
      console.log("[auth][middleware] redirect -> /login", { pathname })
    }
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = "/login"
    redirectUrl.searchParams.set("redirectedFrom", req.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (data.user && isLogin && !isPrefetch) {
    if (debug) {
      console.log("[auth][middleware] redirect -> /", { pathname })
    }
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = "/"
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
}
