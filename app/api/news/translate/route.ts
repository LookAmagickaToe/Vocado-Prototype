import { NextRequest, NextResponse } from "next/server"
import { translateNewsTemplate } from "@/lib/news/service"
import { slugifyVariant } from "@/lib/languages"

export const runtime = "nodejs"
export const maxDuration = 60 // 1 minute for translation

const DEFAULT_MODEL = "gemini-flash-lite-latest"

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
        const variant = slugifyVariant((body as any).variant)

        if (!templateId || !targetLanguage) {
            return NextResponse.json(
                { error: "Missing templateId or targetLanguage" },
                { status: 400 }
            )
        }

        // 3. Delegate to service
        const result = await translateNewsTemplate(templateId, targetLanguage, sourceLanguage, variant)

        return NextResponse.json(result)

    } catch (error) {
        console.error("[translate] Error:", error)
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        )
    }
}
