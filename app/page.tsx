import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { supabaseAdmin } from "@/lib/supabase/admin"
import AppClient from "@/components/AppClient"

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
  const { data } = await supabase.auth.getSession()

  if (!data.session?.user) {
    redirect("/login")
  }

  const userId = data.session.user.id

  const { data: files } = await supabaseAdmin
    .from("world_files")
    .select("world_id,title,storage_path,list_id,position,hidden")
    .eq("user_id", userId)
    .order("position", { ascending: true })

  const { data: listRows } = await supabaseAdmin
    .from("lists")
    .select("id,name,position")
    .eq("user_id", userId)
    .order("position", { ascending: true })

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("language,level,source_language,target_language")
    .eq("id", userId)
    .maybeSingle()

  const lists = (listRows ?? []).map((list) => ({ id: list.id, name: list.name, worldIds: [] }))
  const listMap = new Map(lists.map((list) => [list.id, list]))

  const worlds: any[] = []
  const hiddenWorldIds: string[] = []
  const titleOverrides: Record<string, string> = {}

  const BUCKET = process.env.SUPABASE_WORLDS_BUCKET ?? "worlds"

  for (const file of files ?? []) {
    const download = await supabaseAdmin.storage.from(BUCKET).download(file.storage_path)
    if (download.error) continue
    const text = await download.data.text()
    const json = JSON.parse(text)
    worlds.push(json)

    if (file.list_id && listMap.has(file.list_id)) {
      listMap.get(file.list_id)!.worldIds.push(file.world_id)
    }
    if (file.hidden) {
      hiddenWorldIds.push(file.world_id)
    }
    if (file.title && json?.title && file.title !== json.title) {
      titleOverrides[file.world_id] = file.title
    }
  }

  return (
    <AppClient
      initialUploadedWorlds={worlds}
      initialLists={lists}
      initialHiddenWorldIds={hiddenWorldIds}
      initialWorldTitleOverrides={titleOverrides}
      initialSupabaseLoaded={true}
      initialProfile={
        profileError
          ? undefined
          : {
              language: profileRow?.language ?? "",
              level: profileRow?.level ?? "",
              sourceLanguage: profileRow?.source_language ?? "",
              targetLanguage: profileRow?.target_language ?? "",
            }
      }
    />
  )
}
