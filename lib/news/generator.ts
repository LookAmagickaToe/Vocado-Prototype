
import { buildNewsPrompt, extractJson, stripHtml } from "@/app/api/ai/route"

const TAGESSCHAU_BASE = "https://www.tagesschau.de/api2u/news/"
const DEFAULT_MODEL = "gemini-flash-latest"

export async function fetchTagesschau(category: string) {
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

export async function generateNewsContent(url: string, sourceLabel: string, targetLabel: string, level: string, title?: string, teaser?: string) {
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
        targetLabel: targetLabel,
        level: level,
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
                // 429 = quota exceeded
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({}))
                    throw new Error(`QUOTA_EXCEEDED: ${errorData.error?.message || 'API quota limit reached'}`)
                }
                // 500+ server errors
                if (response.status >= 500) {
                    throw new Error(`Gemini status ${response.status}`)
                }
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
                    conjugation: item.conjugation || null
                }))
            }

            return parsed
        } catch (err) {
            const errorMsg = (err as Error).message
            if (errorMsg.includes('QUOTA_EXCEEDED')) {
                throw err
            }
            if (attempt === 3) throw err
            console.warn(`Retry ${attempt}/3 for ${url} (Level: ${level}). Error: ${errorMsg}`)
            await new Promise(resolve => setTimeout(resolve, attempt * 1000))
        }
    }
    throw new Error("Failed after 3 attempts")
}
