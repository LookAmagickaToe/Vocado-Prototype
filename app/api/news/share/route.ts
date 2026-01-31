import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const world = body?.world

        if (!world || !world.news) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
        }

        const news = world.news
        const today = new Date().toISOString().slice(0, 10)

        // Validate essential fields
        if (!news.sourceUrl || !news.category || !news.date) {
            return NextResponse.json({ error: "Missing news metadata" }, { status: 400 })
        }

        // We use the same matching logic as the GET route
        // Assuming world.source_language and world.target_language are present
        // Typically source_language is like "Español"

        // Upsert based on URL or composite key?
        // The table `daily_news` likely has columns: date, category, source_language, level, json
        // We want to avoid duplicates.

        // We'll trust the client provided level/languages for now, or extract from world
        const LANGUAGES: Record<string, string> = {
            es: "Español",
            en: "English",
            fr: "Français",
            pt: "Português",
            de: "Deutsch",
            deutsch: "Deutsch",
            english: "English",
            español: "Español",
            français: "Français",
            português: "Português",
            spanish: "Español",
            german: "Deutsch",
            french: "Français",
            portuguese: "Português",
            aleman: "Deutsch",
            alemán: "Deutsch",
            spanisch: "Español"
        }

        const level = (body.level || "A2").toUpperCase()

        const rawSource = (world.source_language || "Español").toLowerCase().split("-")[0]
        const sourceLabel = LANGUAGES[rawSource] || "Español"

        const rawTarget = (world.target_language || "Alemán").toLowerCase().split("-")[0]
        const targetLabel = LANGUAGES[rawTarget] || "Deutsch"

        // Check if exists first to avoid overwriting with potentially slightly different AI variation?
        // Or just upsert. Let's insert if not exists (ignore duplicates).
        // Since Supabase simple insert doesn't support "ON CONFLICT DO NOTHING" easily without a constraint,
        // we check existence first.

        const { data: existing } = await supabaseAdmin
            .from("daily_news")
            .select("id")
            .eq("date", today)
            .eq("category", news.category)
            .eq("source_language", sourceLabel)
            .eq("level", level)
            .filter("json->>target_language", "eq", targetLabel)
            .filter("json->news->>sourceUrl", "eq", news.sourceUrl)
            .maybeSingle()

        if (existing) {
            return NextResponse.json({ status: "already_exists" })
        }

        const { error } = await supabaseAdmin
            .from("daily_news")
            .insert({
                date: today,
                category: news.category,
                source_language: sourceLabel,
                // We should ideally update the world object with normalized languages too?
                // But let's just trust the columns. For json, we keep it as is or update it?
                // Let's update it to ensure consistency.
                json: JSON.stringify({
                    ...world,
                    source_language: sourceLabel,
                    target_language: targetLabel
                })
            })

        if (error) {
            console.error("Share error:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ status: "ok" })
    } catch (error) {
        return NextResponse.json(
            { error: "Internal Error", details: (error as Error).message },
            { status: 500 }
        )
    }
}
