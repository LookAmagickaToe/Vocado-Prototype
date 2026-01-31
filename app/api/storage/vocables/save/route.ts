
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// IMPORTANT: Bypass RLS for now using service key if needed, or use user client.
// User said "added to the new bucket". Assuming a table 'vocables'.
// We check uniqueness before inserting.

export async function POST(req: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

        // Auth check using the token passed
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        const token = authHeader.replace("Bearer ", "")
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { items, sourceLayout, targetLayout } = await req.json()

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ status: "ok", count: 0 })
        }

        // Prepare items for insertion
        // "only if they are unique".
        // We assume uniqueness based on (user_id, es, de).

        const toInsert = items.map((item: any) => ({
            user_id: user.id,
            es: item.es,
            de: item.de,
            image: item.image,
            explanation: item.explanation,
            meta: {
                source: sourceLayout,
                target: targetLayout,
                pos: item.pos,
                example: item.example,
                conjugation: item.conjugation,
                imported_from: "news",
                created_at: new Date().toISOString()
            }
        }))

        // We can use upsert or ignore duplicates.
        // If 'vocables' has a unique constraint on (user_id, es, de), we can use onConflict.
        // Assuming we want to keep existing if present.

        const { error } = await supabaseAdmin
            .from("vocables")
            .upsert(toInsert, { onConflict: "user_id, es, de", ignoreDuplicates: true })

        if (error) {
            console.error("Error saving vocab:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ status: "ok", count: toInsert.length })
    } catch (e) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
