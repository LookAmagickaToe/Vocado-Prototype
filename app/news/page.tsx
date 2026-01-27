import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import NewsClient from "@/components/NewsClient"
import { supabaseAdmin } from "@/lib/supabase/admin"

export default async function NewsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
  const { data: authUser } = await supabase.auth.getUser()

  if (!authUser.user) {
    redirect("/login")
  }

  const userId = authUser.user.id
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("level,source_language,target_language,news_category,seeds,weekly_seeds,weekly_seeds_week_start,weekly_words,weekly_words_week_start")
    .eq("id", userId)
    .maybeSingle()

  return (
    <NewsClient
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
      }}
    />
  )
}
