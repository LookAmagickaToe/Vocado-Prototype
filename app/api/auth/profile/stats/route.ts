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

    const body = await req.json()
    const seeds = Number.isFinite(body?.seeds) ? Number(body.seeds) : null
    const weeklySeeds = Number.isFinite(body?.weeklySeeds) ? Number(body.weeklySeeds) : null
    const dailySeeds = Number.isFinite(body?.dailySeeds) ? Number(body.dailySeeds) : null
    const dailySeedsDate = typeof body?.dailySeedsDate === "string" ? body.dailySeedsDate.trim() : null
    const weeklyWords = Number.isFinite(body?.weeklyWords) ? Number(body.weeklyWords) : null
    const weekStart = typeof body?.weekStart === "string" ? body.weekStart.trim() : null
    const weeklySeedsWeekStart =
      typeof body?.weeklySeedsWeekStart === "string"
        ? body.weeklySeedsWeekStart.trim()
        : null
    const dailyState = body?.dailyState && typeof body.dailyState === "object" ? body.dailyState : null
    const dailyStateDate =
      typeof body?.dailyStateDate === "string" ? body.dailyStateDate.trim() : null
    const ripenessLevel = Number.isFinite(body?.ripenessLevel) ? Number(body.ripenessLevel) : null
    const lastPlayedDate = typeof body?.lastPlayedDate === "string" ? body.lastPlayedDate.trim() : null

    const payload: Record<string, number | string | null | object> = {}
    if (seeds !== null && seeds >= 0) payload.seeds = Math.floor(seeds)
    if (weeklySeeds !== null && weeklySeeds >= 0) payload.weekly_seeds = Math.floor(weeklySeeds)
    if (weeklySeedsWeekStart) payload.weekly_seeds_week_start = weeklySeedsWeekStart
    if (dailySeeds !== null && dailySeeds >= 0) payload.daily_seeds = Math.floor(dailySeeds)
    if (dailySeedsDate) payload.daily_seeds_date = dailySeedsDate
    if (weeklyWords !== null && weeklyWords >= 0) payload.weekly_words = Math.floor(weeklyWords)
    if (weekStart) payload.weekly_words_week_start = weekStart
    if (dailyState) payload.daily_state = dailyState
    if (dailyStateDate) payload.daily_state_date = dailyStateDate

    // Ripeness cycle logic
    if (ripenessLevel !== null && ripenessLevel >= 0 && lastPlayedDate) {
      // Check if user completed a harvest cycle (reached day 7)
      if (ripenessLevel >= 7) {
        // Get current harvest count
        const { data: currentProfile } = await supabaseAdmin
          .from("profiles")
          .select("harvest_count")
          .eq("id", userId)
          .single()

        const currentHarvestCount = currentProfile?.harvest_count || 0
        payload.harvest_count = currentHarvestCount + 1
        payload.ripeness_level = 0 // Reset cycle after harvest
      } else {
        payload.ripeness_level = Math.floor(ripenessLevel)
      }
      payload.last_played_date = lastPlayedDate

      // Update longest streak if this is a new record
      const { data: currentProfile } = await supabaseAdmin
        .from("profiles")
        .select("longest_streak")
        .eq("id", userId)
        .single()

      const currentLongestStreak = currentProfile?.longest_streak || 0
      if (ripenessLevel > currentLongestStreak) {
        payload.longest_streak = Math.floor(ripenessLevel)
      }
    }

    if (!Object.keys(payload).length) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
      .eq("id", userId)

    if (error) {
      return NextResponse.json(
        { error: "Update failed", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: (error as Error).message },
      { status: 400 }
    )
  }
}
