import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase/admin"
import VocablesClient from "@/components/newhomescreen/VocablesClient"

export default async function VocablesPage() {
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

    const { data: profileRow } = await supabaseAdmin
        .from("profiles")
        .select("level,source_language,target_language,news_category,seeds")
        .eq("id", userId)
        .maybeSingle()

    return (
        <VocablesClient
            profile={{
                level: profileRow?.level ?? "",
                sourceLanguage: profileRow?.source_language ?? "",
                targetLanguage: profileRow?.target_language ?? "",
                newsCategory: profileRow?.news_category ?? "",
                seeds: profileRow?.seeds ?? 0,
            }}
        />
    )
}
