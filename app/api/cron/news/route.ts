import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildNewsPrompt, extractJson, stripHtml } from "@/app/api/ai/route"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes for multiple AI calls

const TAGESSCHAU_BASE = "https://www.tagesschau.de/api2u/news/"
const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"
const DEFAULT_MODEL = "gemini-flash-latest"

async function fetchTagesschau(category: string) {
    const ressort = category === "world" ? "ausland" : category
    const query = ["ausland", "wirtschaft", "sport"].includes(ressort) ? `?ressort=${ressort}` : ""

    try {
        const res = await fetch(`${TAGESSCHAU_BASE}${query}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
            }
        })
        if (!res.ok) return []
        const data = await res.json()
        return Array.isArray(data?.news) ? data.news : []
    } catch {
        return []
    }
}

async function generateNewsContent(url: string, sourceLabel: string, level: string, title?: string, teaser?: string) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY")

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
        targetLabel: "Alemán",
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
                // If 429 or 500, throw to trigger retry
                if (response.status === 429 || response.status >= 500) {
                    throw new Error(`Gemini status ${response.status}`)
                }
                // Other errors might be fatal
                throw new Error("Gemini failed")
            }

            const data = await response.json()
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
            if (!text) throw new Error("Empty Gemini response")

            return extractJson(text)
        } catch (err) {
            if (attempt === 3) throw err
            console.warn(`Retry ${attempt}/3 for ${url} (Level: ${level}). Error: ${(err as Error).message}`)
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

    const results = {
        processed: 0,
        errors: 0,
        skipped: 0,
        details: [] as string[]
    }

    const categories = ["world", "wirtschaft", "sport"]
    const today = new Date().toISOString().slice(0, 10)

    const LANGUAGES: Record<string, string> = {
        es: "Español",
        en: "English",
        fr: "Français",
        pt: "Português",
        de: "Deutsch"
    }

    // 1. Fetch active user settings to optimize generation
    const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("source_language, level")

    const targetsMap = new Map<string, { code: string, label: string, level: string }>()

    // Helper to add target
    const addTarget = (langCode: string, level: string) => {
        const code = langCode.toLowerCase()
        const label = LANGUAGES[code]
        const lvl = (level || "A2").toUpperCase()
        if (label && ["A1", "A2", "B1", "B2", "C1", "C2"].includes(lvl)) {
            const key = `${code}-${lvl}`
            targetsMap.set(key, { code, label, level: lvl })
        }
    }

    // Default fallbacks
    addTarget("es", "A2")
    addTarget("en", "A2")

    // Add dictionary-based targets from profiles
    if (profiles) {
        for (const p of profiles) {
            let code = "es"
            if (p.source_language) {
                if (LANGUAGES[p.source_language.toLowerCase()]) {
                    code = p.source_language.toLowerCase()
                } else {
                    const foundCode = Object.keys(LANGUAGES).find(k => LANGUAGES[k] === p.source_language)
                    if (foundCode) code = foundCode
                }
            }
            addTarget(code, p.level)
        }
    }

    const targets = Array.from(targetsMap.values())
    console.log(`Generating news for ${targets.length} configurations:`, targets.map(t => `${t.code}-${t.level}`).join(", "))

    for (const category of categories) {
        const headlines = await fetchTagesschau(category)
        // Process top 5
        for (const item of headlines.slice(0, 5)) {
            const url = item.detailsweb || item.details || item.shareurl || item.url
            if (!url) continue

            const id = safeSegment(item.externalId || item.title || url)

            // Generate for each target configuration
            for (const target of targets) {
                try {
                    console.log(`Generating [${target.code}-${target.level}]: ${url}`)

                    const generated = await generateNewsContent(url, target.label, target.level, item.title, item.teaser)

                    const payload = {
                        id: `news-${Date.now()}-${id}-${target.code}-${target.level}`,
                        ui: {
                            vocab: {
                                carousel: {
                                    primaryLabel: `${target.label}:`,
                                    secondaryLabel: "Alemán:"
                                }
                            }
                        },
                        mode: "vocab",
                        news: {
                            sourceUrl: url,
                            title: item.title,
                            teaser: item.teaser,
                            image: item.teaserImage?.imageVariants?.["1x1-840"] || item.teaserImage?.imageUrl,
                            date: new Date().toISOString(),
                            generatedAt: new Date().toISOString(),
                            index: 0,
                            level: target.level,
                            ...generated // summary, items, text, summary_source
                        },
                        pool: generated.items.map((it: any, idx: number) => ({
                            ...it,
                            id: `news-${Date.now()}-${id}-${target.code}-${target.level}-${idx}`
                        })),
                        title: `Vocado Diario - ${item.title}`,
                        chunking: { itemsPerGame: 8 },
                        description: generated.summary.join(" "),
                        source_language: target.label,
                        target_language: "Alemán"
                    }

                    // 3. Save to Supabase Table 'daily_news'
                    // First delete existing for this specific configuration
                    await supabaseAdmin
                        .from("daily_news")
                        .delete()
                        .eq("source_url", url)
                        .eq("date", today)
                        .eq("source_language", target.label)
                        .eq("level", target.level)

                    const { error: insertError } = await supabaseAdmin
                        .from("daily_news")
                        .insert({
                            id: crypto.randomUUID(),
                            date: today,
                            category: category,
                            level: target.level,
                            source_language: target.label,
                            target_language: "Alemán",
                            source_url: url,
                            title: item.title,
                            json: JSON.stringify(payload)
                        })

                    if (insertError) throw new Error(insertError.message)

                    results.processed++
                    results.details.push(`Generated [${target.code}-${target.level}]: ${category}/${item.title}`)
                } catch (err) {
                    console.error(`Failed to generate [${target.code}-${target.level}] ${url}:`, err)
                    results.errors++
                    results.details.push(`Error [${target.code}-${target.level}] ${category}/${item.title}: ${(err as Error).message}`)
                }
            }
        }
    }

    return NextResponse.json(results)
}
