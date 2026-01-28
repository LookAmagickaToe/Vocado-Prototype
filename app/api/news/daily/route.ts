import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// Helper to normalize URL for comparison if needed (though we rely on DB query)
const normalizeNewsUrl = (value: string) => {
    // ... logic from client if needed, but here we just query headers
    return value
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const category = searchParams.get("category") || "world"
        const level = searchParams.get("level") || "A1"
        const sourceLang = searchParams.get("source_language") || "Español"
        const targetLang = searchParams.get("target_language") || "Alemán"

        // Convert "world" -> "ausland" if needed to match DB, 
        // BUT we saved it as 'world'/'wirtschaft'/'sport' in cron if logic matched.
        // In cron: ressort === "ausland" ? "world" : ressort
        // So 'world' is correct in DB.

        const today = new Date().toISOString().split('T')[0]

        const { data: news, error } = await supabaseAdmin
            .from("daily_news")
            .select("json")
            .eq("date", today)
            .eq("category", category)
            .eq("level", level)
            .eq("source_language", sourceLang)
            .eq("target_language", targetLang)
            .limit(5)

        if (error) {
            console.error("News fetch error", error)
            return NextResponse.json({ items: [] })
        }

        const items = news?.map(n => n.json) || []
        return NextResponse.json({ items })

    } catch (error) {
        return NextResponse.json(
            { error: "Failed to fetch daily news", details: (error as Error).message },
            { status: 500 }
        )
    }
}
