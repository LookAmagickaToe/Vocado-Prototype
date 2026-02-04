import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildNewsPrompt, extractJson, stripHtml } from "@/app/api/ai/route"
import { fetchTagesschau, generateNewsContentBatch } from "@/lib/news/generator"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes for multiple AI calls

const TAGESSCHAU_BASE = "https://www.tagesschau.de/api2u/news/"
const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"
const DEFAULT_MODEL = "gemini-flash-latest"



async function generateNewsContent(url: string, sourceLabel: string, targetLabel: string, level: string, title?: string, teaser?: string) {
    const apiKey = process.env.GEMINI_API_KEY_NEWS || process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY_NEWS (or fallback GEMINI_API_KEY)")

    // Rate limit safeguard: wait 500ms before processing
    await new Promise(resolve => setTimeout(resolve, 500))

    let rawText = ""
    try {
        const articleResponse = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            },
        })
        if (!articleResponse.ok) throw new Error("Failed to fetch article")
        const html = await articleResponse.text()
        rawText = stripHtml(html).slice(0, 12000)
    } catch (err) {
        if (title && teaser) {
            rawText = [title, teaser].join(". ")
        } else {
            throw err
        }
    }

    if (!rawText) throw new Error("Empty text")

    const prompt = buildNewsPrompt({
        sourceLabel: sourceLabel,
        targetLabel: targetLabel,  // Use the passed targetLabel
        level: level, // Use passed level
        rawText,
    })

    const rawModel = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`

    // Retry loop: 3 attempts
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.3,
                        },
                    }),
                }
            )

            if (!response.ok) {
                // 429 = quota exceeded - don't retry, it won't help
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({}))
                    throw new Error(`QUOTA_EXCEEDED: ${errorData.error?.message || 'API quota limit reached'}`)
                }
                // 500+ server errors - retry might help
                if (response.status >= 500) {
                    throw new Error(`Gemini status ${response.status}`)
                }
                // Other errors are fatal
                throw new Error("Gemini failed")
            }

            const data = await response.json()
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
            if (!text) throw new Error("Empty Gemini response")

            const parsed = extractJson(text)

            // Normalize items
            if (parsed && Array.isArray(parsed.items)) {
                parsed.items = parsed.items.map((item: any) => ({
                    ...item,
                    pos: item.pos?.toLowerCase() || "other",
                    // Ensure conjugation is null if not present or empty
                    conjugation: item.conjugation || null
                }))
            }

            return parsed
        } catch (err) {
            const errorMsg = (err as Error).message
            // Don't retry quota errors - they won't succeed until quota resets
            if (errorMsg.includes('QUOTA_EXCEEDED')) {
                throw err
            }
            if (attempt === 3) throw err
            console.warn(`Retry ${attempt}/3 for ${url} (Level: ${level}). Error: ${errorMsg}`)
            // Exponential backoff: 1s, 2s, 3s
            await new Promise(resolve => setTimeout(resolve, attempt * 1000))
        }
    }
    throw new Error("Failed after 3 attempts")
}

function safeSegment(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "news"
}

export async function GET(req: Request) {
    const authHeader = req.headers.get("Authorization")
    const cronSecret = process.env.CRON_SECRET
    // Simple protection: if CRON_SECRET is set, require it.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const maxPerCategory = 5
    const results = {
        processed: 0,
        errors: 0,
        skipped: 0,
        details: [] as string[]
    }

    const categories = ["world", "wirtschaft", "sport"]
    const today = new Date().toISOString().slice(0, 10)

    // Clean up old news before generating new ones
    console.log(`[cron/news] Cleaning up old news (keeping only ${today})`)
    const { error: cleanupError } = await supabaseAdmin
        .from("daily_news")
        .delete()
        .neq("date", today)

    if (cleanupError) {
        console.error("[cron/news] Cleanup error:", cleanupError)
        results.details.push(`⚠️ Cleanup error: ${cleanupError.message}`)
    } else {
        console.log("[cron/news] Old news cleaned up successfully")
        results.details.push("✅ Old news cleaned up")
    }

    // NEW APPROACH: Generate German templates for common levels only
    // Uncommon levels (A1, C1, C2) will be generated on-demand to save API quota
    const LEVELS = ["A2", "B1", "B2"]
    const TEMPLATE_LANGUAGE = "Deutsch"  // Always German for templates

    console.log(`[cron/news] Generating German templates for levels:`, LEVELS)

    for (const category of categories) {
        const headlines = await fetchTagesschau(category)

        // Batch candidates for this category
        const allCandidates = headlines.slice(0, maxPerCategory).map((item: any) => ({
            url: item.detailsweb || item.details || item.shareurl || item.url,
            title: item.title,
            teaser: item.teaser
        })).filter((c: any) => c.url)

        if (allCandidates.length === 0) continue

        // Iterate levels and generate batches
        for (const level of LEVELS) {
            const batchResults = await generateNewsContentBatch(allCandidates, level)

            for (const res of batchResults) {
                if (!res) continue
                const { url, title, generated } = res

                const configKey = `[${category}/${level}/template-de]`

                try {
                    // Check for existing template first to preserve ID and avoid breaking FKs
                    const { data: existing } = await supabaseAdmin
                        .from("daily_news_templates")
                        .select("id")
                        .eq("date", today)
                        .eq("category", category)
                        .eq("level", level)
                        .eq("source_url", url)
                        .maybeSingle()

                    const templateId = existing?.id || crypto.randomUUID()

                    const { error: templateError } = await supabaseAdmin
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

                    if (templateError) throw new Error(templateError.message)

                    results.processed++
                    results.details.push(`✅ Template saved: ${configKey}`)

                } catch (err) {
                    console.error(`Error ${configKey}:`, err)
                    results.errors++
                    results.details.push(`❌ Error ${configKey}: ${(err as Error).message}`)
                }
            }
        }
    }

    return NextResponse.json(results)
}
