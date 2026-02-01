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

async function generateNewsContent(url: string, sourceLabel: string, targetLabel: string, level: string, title?: string, teaser?: string) {
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

    const LANGUAGES: Record<string, string> = {
        es: "Español",
        en: "English",
        fr: "Français",
        pt: "Português",
        de: "Deutsch"
    }

    // 1. Fetch active user settings to determine what to generate
    // We want to generate for every occurring (Level, SourceLanguage, TargetLanguage) tuple.
    const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("source_language, target_language, level")

    // Map: Level -> Map<SourceLang, Set<TargetLang>>
    //  e.g. "A2" -> Map { "Deutsch" -> Set("Español", "English"), "English" -> Set("Deutsch") }
    const demands = new Map<string, Map<string, Set<string>>>()

    // Helper to register demand
    const addDemand = (level: string, sourceLangCode: string, targetLangCode: string) => {
        const lvl = (level || "A2").toUpperCase()
        if (!["A1", "A2", "B1", "B2", "C1", "C2"].includes(lvl)) return

        let sourceCode = sourceLangCode.toLowerCase()
        let targetCode = targetLangCode.toLowerCase()

        // normalize codes from full name if needed
        const normalizeLang = (code: string) => {
            if (LANGUAGES[code]) return code
            const found = Object.keys(LANGUAGES).find(k => LANGUAGES[k].toLowerCase() === code.toLowerCase())
            if (found) return found
            const foundName = Object.keys(LANGUAGES).find(k => LANGUAGES[k] === code)
            if (foundName) return foundName
            return null
        }

        sourceCode = normalizeLang(sourceCode) || sourceCode
        targetCode = normalizeLang(targetCode) || targetCode

        if (!LANGUAGES[sourceCode] || !LANGUAGES[targetCode]) return // unsupported language

        if (!demands.has(lvl)) {
            demands.set(lvl, new Map())
        }
        const levelMap = demands.get(lvl)!
        if (!levelMap.has(sourceCode)) {
            levelMap.set(sourceCode, new Set())
        }
        levelMap.get(sourceCode)!.add(targetCode)
    }

    // Default Fallbacks (always generate de->es and en->de A2)
    addDemand("A2", "de", "es")
    addDemand("A2", "en", "de")

    if (profiles) {
        for (const p of profiles) {
            if (p.source_language && p.target_language) {
                addDemand(p.level || "A2", p.source_language, p.target_language)
            }
        }
    }

    console.log(`Generation Demands:`, Array.from(demands.entries()).map(([lvl, langMap]) =>
        `${lvl}:[${Array.from(langMap.entries()).map(([src, targets]) => `${src}->${Array.from(targets).join(",")}`).join(";")}]`
    ))

    for (const category of categories) {
        const headlines = await fetchTagesschau(category)

        // LIMIT: 5 stories per category
        for (const item of headlines.slice(0, maxPerCategory)) {
            const url = item.detailsweb || item.details || item.shareurl || item.url
            if (!url) continue

            const id = safeSegment(item.externalId || item.title || url)

            // Iterate Levels -> SourceLangs -> TargetLangs
            for (const [level, langMap] of demands.entries()) {
                const baseTextsForLevel = new Map<string, string>() // targetCode -> summary text

                for (const [sourceCode, targetCodes] of langMap.entries()) {
                    const sourceLabel = LANGUAGES[sourceCode]

                    for (const targetCode of targetCodes) {
                        const targetLabel = LANGUAGES[targetCode]
                        const configKey = `[${category} /${level}/${sourceCode} -> ${targetCode}]`

                        try {
                            let generated: any = null
                            let statusTag = "[Fresh]"

                            // Check if we can reuse a base text for this target language
                            const cachedBase = baseTextsForLevel.get(targetCode)

                            if (cachedBase) {
                                console.log(`Reusing base text for ${configKey}`)
                                generated = await generateNewsContent(
                                    "", // url empty
                                    sourceLabel,
                                    targetLabel,
                                    level,
                                    item.title,
                                    cachedBase // Pass the summary as "teaser/text" override logic
                                )
                                statusTag = "[Reused]"
                            } else {
                                console.log(`Generating fresh BASE for ${configKey}`)
                                generated = await generateNewsContent(url, sourceLabel, targetLabel, level, item.title, item.teaser)

                                // Cache the generated TARGET summary to reuse for other source languages
                                if (Array.isArray(generated.summary)) {
                                    baseTextsForLevel.set(targetCode, generated.summary.join(" "))
                                }
                            }

                            const payload = {
                                id: `news - ${Date.now()} -${id} -${sourceCode} -${level} `,
                                ui: {
                                    vocab: {
                                        carousel: {
                                            primaryLabel: `${sourceLabel}: `,
                                            secondaryLabel: `${targetLabel}: `
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
                                    id: `news - ${Date.now()} -${id} -${sourceCode} -${level} -${idx} `
                                })),
                                title: `Vocado Diario - ${item.title} `,
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
                            results.details.push(`Saved ${configKey} ${statusTag} `)

                        } catch (err) {
                            console.error(`Error ${configKey}: `, err)
                            results.errors++
                            results.details.push(`Error ${configKey}: ${(err as Error).message} `)
                        }
                    }
                }
            }
        }

        return NextResponse.json(results)
    }
