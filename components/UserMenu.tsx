"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function UserMenu() {
  const router = useRouter()
  const [email, setEmail] = useState<string>("")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      setEmail(data.user?.email ?? "")
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? "")
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!email) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-10 w-10 rounded-full border border-neutral-700 bg-neutral-900/70 text-sm font-semibold text-neutral-100"
        aria-label="Perfil"
      >
        {email.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-neutral-800 bg-neutral-950/95 p-3 text-xs text-neutral-200 shadow-xl">
          <div className="truncate text-sm font-medium">{email}</div>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-left text-xs hover:text-white"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
