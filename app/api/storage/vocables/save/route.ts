
import { NextRequest, NextResponse } from "next/server"
import { saveUserWords } from "@/lib/user-words"
import { getRequestContext } from "@/lib/track-server"

// Explicit "add these words to my vocabulary" action, used by the news reader.
// `user_words` is the canonical queryable vocabulary store. Older versions also
// wrote to a `vocables` table, but that table is not part of this Supabase schema
// and no reader in the app uses it.

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

        const normalizedItems = items.map((item: any) => ({
            ...item,
            es: item?.es ?? item?.source,
            de: item?.de ?? item?.target,
        }))
        const indexed = await saveUserWords(userId, normalizedItems, "news", null, track)

        return NextResponse.json({ status: "ok", count: indexed, indexed })
    } catch (e) {
        console.error("Unexpected error saving vocabulary:", e)
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Internal Server Error" },
            { status: 500 }
        )
    }
}
