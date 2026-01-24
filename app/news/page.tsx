import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import uiSettings from "@/data/ui/settings.json"

export default async function NewsPage() {
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

  const title = uiSettings?.home?.newsTitle ?? "Título del artículo destacado"

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="text-2xl font-semibold">Noticias</div>
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="text-lg font-semibold">{title}</div>
          <p className="mt-2 text-sm text-neutral-300">
            Próximamente: resumen del artículo y ejercicios diarios.
          </p>
        </div>
      </div>
    </div>
  )
}
