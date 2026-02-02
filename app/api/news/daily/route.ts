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
        // 1. First, try to get cached translated news
        const queryStartTime = Date.now()
        const { data: cachedNews, error: cacheError } = await supabaseAdmin
            .from("daily_news")
            .select("json")
            .eq("date", today)
            .eq("category", category)
            .eq("target_language", targetLabel)
            .eq("level", level)
            .limit(5)

        const queryTime = Date.now() - queryStartTime
        console.log(`[/api/news/daily] Cache query completed in ${queryTime}ms - found ${cachedNews?.length || 0} cached items`)

        if (cachedNews && cachedNews.length > 0) {
            // Return cached translations
            const items = cachedNews.map((row) => {
                if (typeof row.json === "string") {
                    return JSON.parse(row.json)
                }
                return row.json
            })

            const totalTime = Date.now() - startTime
            console.log(`[/api/news/daily] Success (cached) - ${items.length} items returned in ${totalTime}ms total`)
            return NextResponse.json({ items, cached: true })
        }

        // 2. No cached translations - fetch templates for on-demand translation
        console.log(`[/api/news/daily] No cached news, fetching templates for translation`)

        const { data: templates, error: templateError } = await supabaseAdmin
            .from("daily_news_templates")
            .select("*")
            .eq("date", today)
            .eq("category", category)
            .eq("level", level)
            .limit(5)

        if (templateError) throw new Error(templateError.message)

        if (!templates || templates.length === 0) {
            const totalTime = Date.now() - startTime
            console.log(`[/api/news/daily] No templates found - total time: ${totalTime}ms`)
            return NextResponse.json({ items: [] })
        }

        console.log(`[/api/news/daily] Found ${templates.length} templates, triggering translations`)

        // 3. Trigger translation for each template
        const translationPromises = templates.map(async (template) => {
            try {
                // Call internal translation API
                const translateResponse = await fetch(
                    `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/news/translate`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            templateId: template.id,
                            targetLanguage: targetLabel,
                            sourceLanguage: "Deutsch"
                        })
                    }
                )

                if (!translateResponse.ok) {
                    console.error(`Translation failed for template ${template.id}`)
                    return null
                }

                const result = await translateResponse.json()
                return result.data
            } catch (err) {
                console.error(`Translation error for template ${template.id}:`, err)
                return null
            }
        })

        const translatedItems = (await Promise.all(translationPromises)).filter(Boolean)

        const totalTime = Date.now() - startTime
        console.log(`[/api/news/daily] Success (translated on-demand) - ${translatedItems.length} items returned in ${totalTime}ms total`)
        return NextResponse.json({ items: translatedItems, cached: false })

    } catch (error) {
        const totalTime = Date.now() - startTime
        console.error(`[/api/news/daily] Error after ${totalTime}ms:`, (error as Error).message)
        return NextResponse.json(
            { error: "Failed to load daily news", details: (error as Error).message },
            { status: 500 }
        )
    }
}
