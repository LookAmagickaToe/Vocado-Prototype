import { redirect } from "next/navigation"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import LeaderboardClient from "@/components/newhomescreen/LeaderboardClient"

export default async function LeaderboardPage() {
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect("/login")
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("username, seeds, avatar_url, source_language")
        .eq("id", user.id)
        .single()

    return (
        <LeaderboardClient
            profile={{
                username: profile?.username ?? "User",
                seeds: profile?.seeds ?? 0,
                avatarUrl: profile?.avatar_url ?? "",
                sourceLanguage: profile?.source_language ?? "Español",
            }}
        />
    )
}
