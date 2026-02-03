import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { translateNewsTemplate } from "@/lib/news/service"

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
        // 1. Fetch templates for today (limit 5)
        let { data: templates, error: templateError } = await supabaseAdmin
            .from("daily_news_templates")
            .select("*")
            .eq("date", today)
            .eq("category", category)
            .eq("level", level)
            .limit(5)

        if (templateError) throw new Error(templateError.message)

        // If we have fewer than 5 templates, generate more
        if (!templates || templates.length < 5) {
            const existingCount = templates?.length || 0
            const needed = 5 - existingCount
            console.log(`[/api/news/daily] Only ${existingCount} templates exist. Generating ${needed} more...`)

            // Trigger template generation (this will be async, but we'll fetch again immediately)
            try {
                await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/news/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        category,
                        level,
                        count: needed,
                        date: today
                    })
                })

                // Wait a moment for generation to complete
                await new Promise(resolve => setTimeout(resolve, 1000))

                // Fetch templates again
                const { data: newTemplates } = await supabaseAdmin
                    .from("daily_news_templates")
                    .select("*")
                    .eq("date", today)
                    .eq("category", category)
                    .eq("level", level)
                    .limit(5)

                templates = newTemplates || templates
                console.log(`[/api/news/daily] After generation: ${templates?.length || 0} templates available`)
            } catch (genError) {
                console.error(`[/api/news/daily] Generation failed:`, genError)
                // Continue with whatever templates we have
            }
        }

        if (!templates || templates.length === 0) {
            const totalTime = Date.now() - startTime
            console.log(`[/api/news/daily] No templates found after generation attempt - total time: ${totalTime}ms`)
            return NextResponse.json({ items: [] })
        }

        // 2. Check which templates are already translated and cached
        const templateIds = templates.map(t => t.id)
        const { data: cachedNews, error: cacheError } = await supabaseAdmin
            .from("daily_news")
            .select("json, template_id")
            .in("template_id", templateIds)
            .eq("target_language", targetLabel)

        const cachedMap = new Map()
        if (cachedNews) {
            cachedNews.forEach(item => {
                if (item.template_id) {
                    let content = item.json
                    if (typeof content === "string") {
                        try { content = JSON.parse(content) } catch (e) {
                            console.error("Failed to parse cached JSON:", e)
                        }
                    }
                    cachedMap.set(item.template_id, content)
                }
            })
        }

        console.log(`[/api/news/daily] Found ${templates.length} templates. Cached: ${cachedMap.size}. Needs translation: ${templates.length - cachedMap.size}`)

        // 3. Translate missing items
        const resultsPromises = templates.map(async (template) => {
            // Return cached if exists
            if (cachedMap.has(template.id)) {
                return cachedMap.get(template.id)
            }

            // Translate on demand
            try {
                const result = await translateNewsTemplate(template.id, targetLabel, sourceLabel)
                // Parse the data if it's a cached database row with a json field
                let worldData = result.data

                if (worldData && typeof worldData === 'object' && 'json' in worldData) {
                    // This is a raw database row, parse the json field
                    const jsonField = worldData.json
                    if (typeof jsonField === 'string') {
                        try {
                            worldData = JSON.parse(jsonField)
                        } catch (e) {
                            console.error(`Failed to parse JSON for template ${template.id}:`, e)
                            return null
                        }
                    } else {
                        worldData = jsonField
                    }
                }

                return worldData
            } catch (err) {
                console.error(`Translation error for template ${template.id}:`, err)
                return null
            }
        })

        const items = (await Promise.all(resultsPromises)).filter(Boolean)

        const totalTime = Date.now() - startTime
        console.log(`[/api/news/daily] Success - ${items.length} items returned in ${totalTime}ms total`)
        return NextResponse.json({ items, cached: false })

    } catch (error) {
        const totalTime = Date.now() - startTime
        console.error(`[/api/news/daily] Error after ${totalTime}ms:`, (error as Error).message)
        return NextResponse.json(
            { error: "Failed to load daily news", details: (error as Error).message },
            { status: 500 }
        )
    }
}
