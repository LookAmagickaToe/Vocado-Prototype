import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase/admin"
import WorldsClient from "@/components/newhomescreen/WorldsClient"
import type { World } from "@/types/worlds"

export default async function WorldsPage() {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        {
            cookies: {
                get: (name) => cookieStore.get(name)?.value,
                set: () => { },
                remove: () => { },
            },
        }
    )
    const { data } = await supabase.auth.getSession()

    if (!data.session?.user) {
        redirect("/login")
    }

    const userId = data.session.user.id

    // Fetch profile
    const { data: profileRow } = await supabaseAdmin
        .from("profiles")
        .select("level,source_language,target_language,news_category,seeds")
        .eq("id", userId)
        .maybeSingle()

    // Fetch lists
    const { data: listRows } = await supabaseAdmin
        .from("lists")
        .select("id,name,position")
        .eq("user_id", userId)
        .order("position", { ascending: true })

    // Fetch world files
    const { data: files } = await supabaseAdmin
        .from("world_files")
        .select("world_id,title,storage_path,list_id,position,hidden")
        .eq("user_id", userId)
        .order("position", { ascending: true })

    // Build lists with worldIds
    const lists: Array<{ id: string; name: string; worldIds: string[] }> = []
    const listIdAliases = new Map<string, string>()
    let vocadoListId: string | null = null

    for (const list of listRows ?? []) {
        if (list.name === "Vocado Diario") {
            if (!vocadoListId) {
                vocadoListId = list.id
                lists.push({ id: list.id, name: list.name, worldIds: [] })
            } else {
                listIdAliases.set(list.id, vocadoListId)
            }
            continue
        }
        lists.push({ id: list.id, name: list.name, worldIds: [] })
    }

    const listMap = new Map(lists.map((list) => [list.id, list]))

    // Download and parse worlds
    const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"
    const worlds: World[] = []
    const worldMap = new Map<string, World>()

    for (const file of files ?? []) {
        try {
            const download = await supabaseAdmin.storage.from(BUCKET).download(file.storage_path)
            if (download.error) continue
            const text = await download.data.text()
            const json = JSON.parse(text)

            // Use file.world_id as the id
            json.id = file.world_id
            if (file.title) json.title = file.title

            if (!worldMap.has(file.world_id)) {
                worldMap.set(file.world_id, json as World)
                worlds.push(json as World)
            }

            // Add to list if applicable
            const resolvedListId = file.list_id
                ? listIdAliases.get(file.list_id) ?? file.list_id
                : null
            if (resolvedListId && listMap.has(resolvedListId)) {
                const targetList = listMap.get(resolvedListId)!
                if (!targetList.worldIds.includes(file.world_id)) {
                    targetList.worldIds.push(file.world_id)
                }
            }
        } catch {
            // Skip invalid files
        }
    }

    return (
        <WorldsClient
            profile={{
                level: profileRow?.level ?? "",
                sourceLanguage: profileRow?.source_language ?? "",
                targetLanguage: profileRow?.target_language ?? "",
                newsCategory: profileRow?.news_category ?? "",
                seeds: profileRow?.seeds ?? 0,
            }}
            lists={lists}
            worlds={worlds}
        />
    )
}
