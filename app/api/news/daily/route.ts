import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { translateNewsTemplatesBatch } from "@/lib/news/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

        // 2. Batch Translate (handles caching internally)
        const templateIds = templates.map(t => t.id)
        const batchResults = await translateNewsTemplatesBatch(templateIds, targetLabel, sourceLabel)

        const items = batchResults.results.map(r => r.data).filter(Boolean)

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
