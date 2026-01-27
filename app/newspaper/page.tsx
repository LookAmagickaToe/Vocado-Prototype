import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase/admin"
import FeedClient from "@/components/newspaper/FeedClient"

export default async function NewspaperPage() {
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

    // Reuse the query logic from app/news/page.tsx
    const { data: profileRow } = await supabaseAdmin
        .from("profiles")
        .select("level,source_language,target_language,seeds")
        .eq("id", userId)
        .maybeSingle()

    return (
        <FeedClient
            profile={{
                level: profileRow?.level ?? "",
                sourceLanguage: profileRow?.source_language ?? "Spanish",
                targetLanguage: profileRow?.target_language ?? "English",
                seeds: profileRow?.seeds ?? 0,
            }}
        />
    )
}
