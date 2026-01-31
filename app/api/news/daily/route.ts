import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const category = (searchParams.get("category") || "world").toLowerCase()
    const sourceParam = (searchParams.get("source_language") || "es").toLowerCase()
    const level = (searchParams.get("level") || "A2").toUpperCase()
    const today = new Date().toISOString().slice(0, 10)

    const LANGUAGES: Record<string, string> = {
        es: "Español",
        en: "English",
        fr: "Français",
        pt: "Português",
        de: "Deutsch"
    }
    // approximate matching for codes like 'en-US'
    const shortCode = sourceParam.split("-")[0]
    const sourceLabel = LANGUAGES[shortCode] || "Español"

    try {
        const { data: rows, error } = await supabaseAdmin
            .from("daily_news")
            .select("json")
            .eq("date", today)
            .eq("category", category)
            .eq("source_language", sourceLabel)
            .eq("level", level)
            .limit(5)

        if (error) throw new Error(error.message)
        if (!rows || rows.length === 0) {
            return NextResponse.json({ items: [] })
        }

        const items = rows.map((row) => {
            if (typeof row.json === "string") {
                return JSON.parse(row.json)
            }
            return row.json
        })

        return NextResponse.json({ items })

    } catch (error) {
        return NextResponse.json(
            { error: "Failed to load daily news", details: (error as Error).message },
            { status: 500 }
        )
    }
}
