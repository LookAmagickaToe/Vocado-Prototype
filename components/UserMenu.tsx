"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

const LANGUAGES = [
  "Español",
  "Deutsch",
  "English",
  "Français",
  "Italiano",
  "Português",
]

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

export default function UserMenu({
  language,
  level,
  sourceLanguage,
  targetLanguage,
  onUpdateSettings,
}: {
  language: string
  level: string
  sourceLanguage: string
  targetLanguage: string
  onUpdateSettings: (next: {
    language: string
    level: string
    sourceLanguage: string
    targetLanguage: string
  }) => void
}) {
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

  const updateProfile = async (
    nextLanguage: string,
    nextLevel: string,
    nextSource: string,
    nextTarget: string
  ) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return

    await fetch("/api/auth/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        language: nextLanguage,
        level: nextLevel,
        sourceLanguage: nextSource,
        targetLanguage: nextTarget,
      }),
    })
    onUpdateSettings({
      language: nextLanguage,
      level: nextLevel,
      sourceLanguage: nextSource,
      targetLanguage: nextTarget,
    })
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
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => updateProfile(e.target.value, level, sourceLanguage, targetLanguage)}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="">Auto</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">
                Source
              </label>
              <select
                value={sourceLanguage}
                onChange={(e) => updateProfile(language, level, e.target.value, targetLanguage)}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="">Auto</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">
                Target
              </label>
              <select
                value={targetLanguage}
                onChange={(e) => updateProfile(language, level, sourceLanguage, e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="">Auto</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">
                Level
              </label>
              <select
                value={level}
                onChange={(e) =>
                  updateProfile(language, e.target.value, sourceLanguage, targetLanguage)
                }
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
              >
                {LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
