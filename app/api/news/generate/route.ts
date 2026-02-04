
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { fetchTagesschau, generateNewsContentBatch } from "@/lib/news/generator"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

export async function POST(req: Request) {
    try {
        const { category, level, count = 5, date } = await req.json()
        const today = date || new Date().toISOString().slice(0, 10)

        console.log(`[/api/news/generate] Request: category=${category}, level=${level}, count=${count}, date=${today}`)

        // 1. Fetch available headlines
        const headlines = await fetchTagesschau(category)
        if (!headlines.length) {
            return NextResponse.json({ success: false, error: "No headlines found" }, { status: 404 })
        }

        // 2. Fetch existing templates to avoid duplicates
        const { data: existingTemplates } = await supabaseAdmin
            .from("daily_news_templates")
            .select("source_url")
            .eq("date", today)
            .eq("category", category)
            .eq("level", level)

        const existingUrls = new Set(existingTemplates?.map(t => t.source_url) || [])

        // 3. Select candidates that aren't already generated
        const candidates = headlines.filter((item: any) => {
            const url = item.detailsweb || item.details || item.shareurl || item.url
            return url && !existingUrls.has(url)
        }).slice(0, count)

        if (candidates.length === 0) {
            console.log(`[/api/news/generate] No new candidates found (all existing)`)
            return NextResponse.json({ success: true, count: 0, message: "No new candidates" })
        }

        // 4. Generate content for each candidate (BATCHED)
        const results: { id: string; title: string }[] = []
        const batchCandidates = candidates.map((item: any) => ({
            url: item.detailsweb || item.details || item.shareurl || item.url,
            title: item.title,
            teaser: item.teaser
        })).filter((c: any) => c.url)

        console.log(`[/api/news/generate] Generating ${batchCandidates.length} new templates (Batch)...`)

        const batchResults = await generateNewsContentBatch(batchCandidates, level)

        for (const res of batchResults) {
            if (!res) continue
            const { url, title, generated } = res as { url: string; title: string; generated: any }
            // Save to DB
            const templateId = crypto.randomUUID()

            try {
                const { error } = await supabaseAdmin
                    .from("daily_news_templates")
                    .upsert({
                        id: templateId,
                        date: today,
                        category: category,
                        level: level,
                        source_url: url,
                        title: title,
                        template_json: generated
                    }, {
                        onConflict: 'date,category,level,source_url'
                    })

                if (error) throw error

                results.push({ id: templateId, title: title })
                console.log(`[/api/news/generate] Generated: ${title}`)
            } catch (err) {
                console.error(`[/api/news/generate] Failed to save ${url}:`, err)
            }
        }

        return NextResponse.json({
            success: true,
            generated: results.length,
            items: results
        })

    } catch (error) {
        console.error("[/api/news/generate] Error:", error)
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
    }
}
