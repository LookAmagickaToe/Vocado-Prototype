import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase/admin"
import ProfileClient from "@/components/newhomescreen/ProfileClient"

export default async function ProfilePage() {
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
    const { data: authUser } = await supabase.auth.getUser()

    if (!authUser.user) {
        redirect("/login")
    }

    const userId = authUser.user.id

    let profileRow: any = null
    const withAvatar = await supabaseAdmin
        .from("profiles")
        .select("level,source_language,target_language,news_category,seeds,username,avatar_url")
        .eq("id", userId)
        .maybeSingle()

    if (withAvatar.error && typeof withAvatar.error.message === "string" && withAvatar.error.message.includes("avatar_url")) {
        const fallback = await supabaseAdmin
            .from("profiles")
            .select("level,source_language,target_language,news_category,seeds,username")
            .eq("id", userId)
            .maybeSingle()
        profileRow = fallback.data ?? null
    } else {
        profileRow = withAvatar.data ?? null
    }

    return (
        <ProfileClient
            profile={{
                level: profileRow?.level ?? "",
                name: profileRow?.username ?? "",
                sourceLanguage: profileRow?.source_language ?? "",
                targetLanguage: profileRow?.target_language ?? "",
                newsCategory: profileRow?.news_category ?? "",
                seeds: profileRow?.seeds ?? 0,
                avatarUrl: profileRow?.avatar_url ?? "",
            }}
        />
    )
}
