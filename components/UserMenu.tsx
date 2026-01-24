"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function UserMenu() {
  const router = useRouter()
  const [email, setEmail] = useState<string>("")

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
    <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-200">
      <span className="truncate max-w-[140px]">{email}</span>
      <button
        type="button"
        onClick={signOut}
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs hover:text-white"
      >
        Logout
      </button>
    </div>
  )
}
