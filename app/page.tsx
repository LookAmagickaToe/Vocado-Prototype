import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase/admin"
import NewHomeClient from "@/components/newhomescreen/NewHomeClient"

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => { },
        remove: () => { },
      },
    }
  )
  const { data } = await supabase.auth.getSession()

  if (!data.session?.user) {
    redirect("/login")
  }

  const userId = data.session.user.id

  let profileRow: any = null
  const withAvatar = await supabaseAdmin
    .from("profiles")
    .select("level,source_language,target_language,news_category,seeds,weekly_seeds,weekly_seeds_week_start,weekly_words,weekly_words_week_start,daily_state,daily_state_date,onboarding_done,avatar_url")
    .eq("id", userId)
    .maybeSingle()

  if (withAvatar.error && typeof withAvatar.error.message === "string" && withAvatar.error.message.includes("avatar_url")) {
    const fallback = await supabaseAdmin
      .from("profiles")
      .select("level,source_language,target_language,news_category,seeds,weekly_seeds,weekly_seeds_week_start,weekly_words,weekly_words_week_start,daily_state,daily_state_date,onboarding_done")
      .eq("id", userId)
      .maybeSingle()
    profileRow = fallback.data ?? null
  } else {
    profileRow = withAvatar.data ?? null
  }

  return (
    <NewHomeClient
      profile={{
        level: profileRow?.level ?? "",
        sourceLanguage: profileRow?.source_language ?? "",
        targetLanguage: profileRow?.target_language ?? "",
        newsCategory: profileRow?.news_category ?? "",
        seeds: profileRow?.seeds ?? 0,
        weeklySeeds: profileRow?.weekly_seeds ?? 0,
        weeklySeedsWeekStart: profileRow?.weekly_seeds_week_start ?? "",
        weeklyWords: profileRow?.weekly_words ?? 0,
        weeklyWordsWeekStart: profileRow?.weekly_words_week_start ?? "",
        dailyState: profileRow?.daily_state ?? null,
        dailyStateDate: profileRow?.daily_state_date ?? "",
        onboardingDone: profileRow?.onboarding_done ?? false,
        avatarUrl: profileRow?.avatar_url ?? "",
      }}
    />
  )
}
