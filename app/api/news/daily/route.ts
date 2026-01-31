import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"

export async function GET(req: Request) {
    const startTime = Date.now()
    const { searchParams } = new URL(req.url)
    const category = (searchParams.get("category") || "world").toLowerCase()
    const sourceParam = (searchParams.get("source_language") || "es").toLowerCase()
    const level = (searchParams.get("level") || "A2").toUpperCase()
    const today = new Date().toISOString().slice(0, 10)

    console.log(`[/api/news/daily] Request started - category: ${category}, source: ${sourceParam}, level: ${level}, date: ${today}`)

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
    const targetParam = (searchParams.get("target_language") || "de").toLowerCase()

    // approximate matching for codes like 'en-US'
    const shortCode = sourceParam.split("-")[0].toLowerCase()
    const sourceLabel = LANGUAGES[shortCode] || "Español"

    const targetShortCode = targetParam.split("-")[0].toLowerCase()
    const targetLabel = LANGUAGES[targetShortCode] || "Deutsch"

    try {
        const queryStartTime = Date.now()
        const { data: rows, error } = await supabaseAdmin
            .from("daily_news")
            .select("json")
            .eq("date", today)
            .eq("category", category)
            .eq("source_language", sourceLabel)
            .eq("level", level)
            .eq("target_language", targetLabel)  // Use column instead of JSON field
            .limit(5)

        const queryTime = Date.now() - queryStartTime
        console.log(`[/api/news/daily] Query completed in ${queryTime}ms - found ${rows?.length || 0} rows`)

        if (error) throw new Error(error.message)
        if (!rows || rows.length === 0) {
            const totalTime = Date.now() - startTime
            console.log(`[/api/news/daily] No results found - total time: ${totalTime}ms`)
            return NextResponse.json({ items: [] })
        }

        const items = rows.map((row) => {
            if (typeof row.json === "string") {
                return JSON.parse(row.json)
            }
            return row.json
        })

        const totalTime = Date.now() - startTime
        console.log(`[/api/news/daily] Success - ${items.length} items returned in ${totalTime}ms total`)
        return NextResponse.json({ items })

    } catch (error) {
        const totalTime = Date.now() - startTime
        console.error(`[/api/news/daily] Error after ${totalTime}ms:`, (error as Error).message)
        return NextResponse.json(
            { error: "Failed to load daily news", details: (error as Error).message },
            { status: 500 }
        )
    }
}
