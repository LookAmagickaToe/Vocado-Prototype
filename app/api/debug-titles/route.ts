
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET() {
    const { data: news, error } = await supabaseAdmin
        .from("daily_news")
        .select("id, title, json")
        .order("created_at", { ascending: false }) // Get latest
        .limit(5)

    if (error) return NextResponse.json({ error })

    const results = news.map(n => {
        let jsonTitle = "N/A"
        try {
            const p = typeof n.json === 'string' ? JSON.parse(n.json) : n.json
            jsonTitle = p.news?.title || "Missing"
        } catch (e) { jsonTitle = "Parse Error" }

        return {
            id: n.id,
            db_column_title: n.title,
            json_blob_title: jsonTitle,
            match: n.title === jsonTitle
        }
    })

    return NextResponse.json(results)
}
