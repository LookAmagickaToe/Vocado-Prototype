import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

const getWeekStartIso = () => {
  const date = new Date()
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

async function getUserId(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data.user?.id ?? null
}

export async function GET(req: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server missing Supabase credentials" },
        { status: 500 }
      )
    }
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const scope = searchParams.get("scope") === "weekly" ? "weekly" : "overall"
    const weekStart = getWeekStartIso()

    let data: any[] | null = null
    let error: any = null
    const baseSelect = "id,username,seeds,weekly_seeds,weekly_seeds_week_start"
    const withAvatarSelect = `${baseSelect},avatar_url`

    const withAvatar = await supabaseAdmin
      .from("profiles")
      .select(withAvatarSelect)
      .order(scope === "weekly" ? "weekly_seeds" : "seeds", { ascending: false })
      .limit(20)

    data = withAvatar.data ?? null
    error = withAvatar.error ?? null

    if (error && typeof error.message === "string" && error.message.includes("avatar_url")) {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select(baseSelect)
        .order(scope === "weekly" ? "weekly_seeds" : "seeds", { ascending: false })
        .limit(20)
      data = fallback.data ?? null
      error = fallback.error ?? null
    }

    if (error) {
      return NextResponse.json({ error: "Query failed", details: error.message }, { status: 500 })
    }

    const rows = (data ?? []).map((row) => {
      let validWeek = false
      if (row.weekly_seeds_week_start) {
        try {
          // Allow for timezone differences (client vs server)
          // If the stored monday is within 48 hours of server's monday, count it.
          const rowDate = new Date(row.weekly_seeds_week_start).getTime()
          const serverDate = new Date(weekStart).getTime()
          const diffHours = Math.abs(rowDate - serverDate) / (1000 * 60 * 60)
          if (diffHours < 48) {
            validWeek = true
          }
        } catch {
          // ignore
        }
      }

      const weeklyScore = validWeek ? Number(row.weekly_seeds ?? 0) || 0 : 0
      return {
        username: row.username || "User",
        score: scope === "weekly" ? weeklyScore : Number(row.seeds ?? 0) || 0,
        avatarUrl: typeof row.avatar_url === "string" && row.avatar_url ? row.avatar_url : null,
      }
    })

    const entries = rows
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    return NextResponse.json({ entries, scope })
  } catch (error) {
    return NextResponse.json(
      { error: "Load failed", details: (error as Error).message },
      { status: 500 }
    )
  }
}
