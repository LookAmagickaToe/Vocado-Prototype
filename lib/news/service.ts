
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildTranslationPrompt, validateTranslation, extractJson } from "@/lib/news-translation"

const DEFAULT_MODEL = "gemini-flash-latest"

export async function translateNewsTemplate(templateId: string, targetLanguage: string, sourceLanguage: string = "Deutsch") {
    const apiKey = process.env.GEMINI_API_KEY_NEWS || process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY_NEWS (or fallback GEMINI_API_KEY)")
    }

    // 1. Check if translation already exists in daily_news
    const { data: existingTranslation } = await supabaseAdmin
        .from("daily_news")
        .select("*")
        .eq("template_id", templateId)
        .eq("target_language", targetLanguage)
        .maybeSingle()

    if (existingTranslation) {
        console.log(`[translate] Cache hit for ${templateId} -> ${targetLanguage}`)

        // Parse the json field if it's a string
        let worldData = existingTranslation.json
        if (typeof worldData === 'string') {
            try {
                worldData = JSON.parse(worldData)
            } catch (e) {
                console.error(`Failed to parse cached JSON for ${templateId}:`, e)
                // Fall through to re-translate
            }
        }

        if (worldData) {
            // Hotfix: Ensure title is always from the source (DB column) and not overwritten by translation
            if (worldData.news && existingTranslation.title) {
                worldData.news.title = existingTranslation.title
                // Also update the wrapper title
                worldData.title = `Vocado Diario - ${existingTranslation.title}`
            }

            console.log(`[translate] Returning cached data with keys: ${Object.keys(worldData).join(', ')}`)
            return {
                success: true,
                cached: true,
                data: worldData
            }
        }
    }

    // 2. Fetch template from daily_news_templates
    const { data: template, error: templateError } = await supabaseAdmin
        .from("daily_news_templates")
        .select("*")
        .eq("id", templateId)
        .single()

    if (templateError || !template) {
        throw new Error("Template not found")
    }

    // 3. Translate template using AI
    console.log(`[translate] Translating ${templateId}: Deutsch -> ${targetLanguage} (native: ${sourceLanguage})`)

    const prompt = buildTranslationPrompt(template.template_json, targetLanguage, sourceLanguage)

    const rawModel = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
    const model = rawModel.startsWith("models/") ? rawModel : `models/${rawModel}`

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
        throw new Error(`Gemini translation failed: ${response.status}`)
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error("Empty Gemini response")

    const translatedJson = extractJson(text)

    // 4. Validate translation
    if (!validateTranslation(template.template_json, translatedJson)) {
        throw new Error("Translation validation failed")
    }

    // 5. Build full world payload for daily_news
    const payload = {
        id: `news-translated-${template.id}-${targetLanguage}`,
        ui: {
            vocab: {
                carousel: {
                    primaryLabel: `${sourceLanguage}:`,
                    secondaryLabel: `${targetLanguage}:`
                }
            }
        },
        mode: "vocab",
        news: {
            ...translatedJson,
            sourceUrl: template.source_url,
            title: template.title,
            teaser: translatedJson.summary?.[0] || "",
            date: template.date,
            generatedAt: new Date().toISOString(),
            index: 0,
            category: template.category,
            level: template.level,
        },
        pool: translatedJson.items.map((it: any, idx: number) => ({
            ...it,
            id: `news-trans-${template.id}-${targetLanguage}-${idx}`,
            // Map for game compatibility
            es: it.target,
            de: it.source,
            image: { type: "emoji", value: it.emoji || "🧩" }
        })),
        title: `Vocado Diario - ${template.title}`,
        chunking: { itemsPerGame: 8 },
        description: Array.isArray(translatedJson.summary) ? translatedJson.summary.join(" ") : "",
        source_language: sourceLanguage,
        target_language: targetLanguage
    }

    // 6. Save to daily_news table
    const { error: insertError } = await supabaseAdmin
        .from("daily_news")
        .insert({
            id: crypto.randomUUID(),
            date: template.date,
            category: template.category,
            level: template.level,
            source_language: sourceLanguage,
            target_language: targetLanguage,
            source_url: template.source_url,
            title: template.title,
            template_id: template.id,
            json: JSON.stringify(payload)
        })

    if (insertError) throw new Error(insertError.message)

    console.log(`[translate] Successfully translated and cached ${templateId} -> ${targetLanguage}`)

    return {
        success: true,
        cached: false,
        data: payload
    }
}
