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

    const maxPerCategory = 5
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

    // 1. Fetch active user settings to determine what to generate
    // We want to generate for every occurring (Level, SourceLanguage) tuple.
    const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("source_language, level")

    // Map: Level -> Set of SourceLanguageCodes
    // e.g. "A2" -> ["es", "en"], "B1" -> ["es"]
    const demands = new Map<string, Set<string>>()

    // Helper to register demand
    const addDemand = (level: string, langCode: string) => {
        const lvl = (level || "A2").toUpperCase()
        if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(lvl)) return

        let code = langCode.toLowerCase()
        // normalize code from full name if needed
        if (LANGUAGES[code]) {
            // ok
        } else {
            const found = Object.keys(LANGUAGES).find(k => LANGUAGES[k].toLowerCase() === code)
            if (found) code = found
            else {
                const foundName = Object.keys(LANGUAGES).find(k => LANGUAGES[k] === langCode)
                if (foundName) code = foundName
                else return // unsupported language
            }
        }

        if (!demands.has(lvl)) {
            demands.set(lvl, new Set())
        }
        demands.get(lvl)!.add(code)
    }

    // Default Fallbacks (always generate ES/EN A2)
    addDemand("A2", "es")
    addDemand("A2", "en")

    if (profiles) {
        for (const p of profiles) {
            if (p.source_language) {
                addDemand(p.level || "A2", p.source_language)
            }
        }
    }

    console.log(`Generation Demands:`, Array.from(demands.entries()).map(([lvl, set]) => `${lvl}:[${Array.from(set).join(",")}]`))

    for (const category of categories) {
        const headlines = await fetchTagesschau(category)

        // LIMIT: 5 stories per category
        for (const item of headlines.slice(0, maxPerCategory)) {
            const url = item.detailsweb || item.details || item.shareurl || item.url
            if (!url) continue

            const id = safeSegment(item.externalId || item.title || url)

            // Iterate Levels
            for (const [level, sourceCodes] of demands.entries()) {
                let baseTextForLevel: string | null = null

                // Sort to ensure deterministic order (maybe put 'en' or 'es' first as they are good anchors)
                const sortedSources = Array.from(sourceCodes).sort()

                for (const sourceCode of sortedSources) {
                    const sourceLabel = LANGUAGES[sourceCode]
                    const targetLabel = "Alemán"
                    const configKey = `[${category}/${level}/${sourceCode}]`

                    try {
                        let generated: any = null
                        let statusTag = "[Fresh]"

                        if (baseTextForLevel) {
                            console.log(`Reusing base text for ${configKey}`)
                            // Reuse the base German text. 
                            // We pass 'baseTextForLevel' as 'rawText' to the prompt builder.
                            // The prompt builder sees: "Input article text: <German Summary>".
                            // It will extract vocabulary and back-translate to Source.
                            generated = await generateNewsContent(
                                "", // url empty
                                sourceLabel,
                                level,
                                item.title,
                                baseTextForLevel // Pass the summary as "teaser/text" override logic
                            )
                            // Important: verify if generated.summary matches baseTextForLevel?
                            // The AI *should* ideally keep the summary (Target) identical if input is identical to output.
                            // But it might re-summarize. We can force it to be the same if we want perfect sync,
                            // but allowing it to refine is also fine.
                            // However, for pure optimization, we might accept the AI's re-output.

                            // Optimization 2: If we want to force the 'summary' to be identical to baseTextForLevel to save generation tokens,
                            // we would need a different prompt task like "translate_vocab_only". 
                            // For now, full generation is safer for quality, just skipping the fetch & simplify steps.
                            statusTag = "[Reused]"
                        } else {
                            console.log(`Generating fresh BASE for ${configKey}`)
                            generated = await generateNewsContent(url, sourceLabel, level, item.title, item.teaser)

                            // Capture the generated TARGET summary to reuse as input for others
                            if (Array.isArray(generated.summary)) {
                                baseTextForLevel = generated.summary.join(" ")
                            }
                        }

                        const payload = {
                            id: `news-${Date.now()}-${id}-${sourceCode}-${level}`,
                            ui: {
                                vocab: {
                                    carousel: {
                                        primaryLabel: `${sourceLabel}:`,
                                        secondaryLabel: `${targetLabel}:`
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
                                category: category, // Save category for filtering
                                level: level,
                                ...generated
                            },
                            pool: generated.items.map((it: any, idx: number) => ({
                                ...it,
                                id: `news-${Date.now()}-${id}-${sourceCode}-${level}-${idx}`
                            })),
                            title: `Vocado Diario - ${item.title}`,
                            chunking: { itemsPerGame: 8 },
                            description: Array.isArray(generated.summary) ? generated.summary.join(" ") : "",
                            source_language: sourceLabel,
                            target_language: targetLabel
                        }

                        // Save to Supabase
                        await supabaseAdmin
                            .from("daily_news")
                            .delete()
                            .eq("source_url", url)
                            .eq("date", today)
                            .eq("source_language", sourceLabel)
                            .eq("level", level)

                        const { error: insertError } = await supabaseAdmin
                            .from("daily_news")
                            .insert({
                                id: crypto.randomUUID(),
                                date: today,
                                category: category,
                                level: level,
                                source_language: sourceLabel,
                                target_language: targetLabel,
                                source_url: url,
                                title: item.title,
                                json: JSON.stringify(payload)
                            })

                        if (insertError) throw new Error(insertError.message)

                        results.processed++
                        results.details.push(`Saved ${configKey} ${statusTag}`)

                    } catch (err) {
                        console.error(`Error ${configKey}:`, err)
                        results.errors++
                        results.details.push(`Error ${configKey}: ${(err as Error).message}`)
                    }
                }
            }
        }
    }

    return NextResponse.json(results)
}
