
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { indexUserWords } from "@/lib/user-words"
import { getRequestContext } from "@/lib/track-server"

// Explicit "add these words to my vocabulary" action, used by the news reader.
// Writes both the legacy `vocables` rows and the queryable `user_words` index.

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { items, sourceLayout, targetLayout } = body

        // sourceLayout / targetLayout are the language labels the news reader was
        // showing, so they identify the track these words belong to.
        const context = await getRequestContext(req, {
            source: sourceLayout,
            target: targetLayout,
            variant: body?.variant,
        })
        if (!context) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const { userId, track } = context

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ status: "ok", count: 0 })
        }

        const toInsert = items.map((item: any) => ({
            user_id: userId,
            es: item.es,
            de: item.de,
            image: item.image,
            explanation: item.explanation,
            meta: {
                source: sourceLayout,
                target: targetLayout,
                variant: track.variant,
                pos: item.pos,
                example: item.example,
                conjugation: item.conjugation,
                imported_from: "news",
                created_at: new Date().toISOString()
            }
        }))

        // onConflict must not contain spaces — PostgREST rejects them with 42P10.
        const { error } = await supabaseAdmin
            .from("vocables")
            .upsert(toInsert, { onConflict: "user_id,es,de", ignoreDuplicates: true })

        if (error) {
            console.error("Error saving vocab:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const indexed = await indexUserWords(userId, items, "news", null, track)

        return NextResponse.json({ status: "ok", count: toInsert.length, indexed })
    } catch (e) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
