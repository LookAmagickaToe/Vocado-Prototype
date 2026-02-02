import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildTranslationPrompt, validateTranslation } from "@/lib/news-translation"
import { extractJson } from "@/app/api/ai/route"

export const runtime = "nodejs"
export const maxDuration = 60 // 1 minute for translation

const DEFAULT_MODEL = "gemini-flash-latest"

type TranslateNewsRequest = {
    templateId: string
    targetLanguage: string
    sourceLanguage?: string  // Optional, defaults to "Deutsch"
}

export async function POST(req: NextRequest) {
    const apiKey = process.env.GEMINI_API_KEY_NEWS || process.env.GEMINI_API_KEY
    if (!apiKey) {
        return NextResponse.json(
            { error: "Missing GEMINI_API_KEY_NEWS (or fallback GEMINI_API_KEY)" },
            { status: 500 }
        )
    }

    try {
        const body: TranslateNewsRequest = await req.json()
        const { templateId, targetLanguage, sourceLanguage = "Deutsch" } = body

        if (!templateId || !targetLanguage) {
            return NextResponse.json(
                { error: "Missing templateId or targetLanguage" },
                { status: 400 }
            )
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
            return NextResponse.json({
                success: true,
                cached: true,
                data: existingTranslation
            })
        }

        // 2. Fetch template from daily_news_templates
        const { data: template, error: templateError } = await supabaseAdmin
            .from("daily_news_templates")
            .select("*")
            .eq("id", templateId)
            .single()

        if (templateError || !template) {
            return NextResponse.json(
                { error: "Template not found" },
                { status: 404 }
            )
        }

        // 3. Translate template using AI
        console.log(`[translate] Translating ${templateId}: Deutsch -> ${targetLanguage}`)

        const prompt = buildTranslationPrompt(template.template_json, targetLanguage)

        const rawModel = process.env.GEMINI_MODEL ?? DEFAULT_MODEL
        const model = rawModel.startsWith("models/") ? rawModel : `models / ${rawModel} `

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
                sourceUrl: template.source_url,
                title: template.title,
                teaser: translatedJson.summary?.[0] || "",
                date: template.date,
                generatedAt: new Date().toISOString(),
                index: 0,
                category: template.category,
                level: template.level,
                ...translatedJson
            },
            pool: translatedJson.items.map((it: any, idx: number) => ({
                ...it,
                id: `news-trans-${template.id}-${targetLanguage}-${idx}`
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

        return NextResponse.json({
            success: true,
            cached: false,
            data: payload
        })

    } catch (error) {
        console.error("[translate] Error:", error)
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        )
    }
}
