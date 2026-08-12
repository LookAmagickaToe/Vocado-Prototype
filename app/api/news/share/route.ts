import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { languageLabel, slugifyVariant } from "@/lib/languages"

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
        const level = (body.level || "A2").toUpperCase()

        // Language resolution lives in lib/languages; this route used to carry
        // its own copy of the alias table.
        const sourceLabel = languageLabel(world.source_language, "Español")
        const targetLabel = languageLabel(world.target_language, "Deutsch")
        const variant = slugifyVariant(world.variant)

        // Check if exists first to avoid overwriting with potentially slightly different AI variation?
        // Or just upsert. Let's insert if not exists (ignore duplicates).
        // Since Supabase simple insert doesn't support "ON CONFLICT DO NOTHING" easily without a constraint,
        // we check existence first.

        const existingQuery = supabaseAdmin
            .from("daily_news")
            .select("id")
            .eq("date", today)
            .eq("category", news.category)
            .eq("source_language", sourceLabel)
            .eq("level", level)
            .eq("target_language", targetLabel)
            .eq("source_url", news.sourceUrl)

        // The variety is part of the identity of an article: the Bayerisch
        // rendering of a story is not the same row as the standard one.
        const { data: existing } = await (
            variant ? existingQuery.eq("variant", variant) : existingQuery.is("variant", null)
        ).maybeSingle()

        if (existing) {
            return NextResponse.json({ status: "already_exists" })
        }

        const { error } = await supabaseAdmin
            .from("daily_news")
            .insert({
                date: today,
                category: news.category,
                source_language: sourceLabel,
                level: level,
                target_language: targetLabel,
                variant,
                source_url: news.sourceUrl,
                title: news.title || world.title,
                json: JSON.stringify({
                    ...world,
                    source_language: sourceLabel,
                    target_language: targetLabel,
                    variant
                })
            })

        if (error) {
            // Handle unique constraint violation gracefully if race condition occurs
            if (error.code === '23505') {
                return NextResponse.json({ status: "already_exists" })
            }
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
