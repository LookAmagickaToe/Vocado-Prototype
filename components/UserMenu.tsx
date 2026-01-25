"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { getUiSettings } from "@/lib/ui-settings"

const LANGUAGES = ["Español", "Deutsch", "English", "Français"]

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

export default function UserMenu({
  level,
  sourceLanguage,
  targetLanguage,
  newsCategory,
  onUpdateSettings,
}: {
  level: string
  sourceLanguage: string
  targetLanguage: string
  newsCategory?: string
  onUpdateSettings: (next: {
    level: string
    sourceLanguage: string
    targetLanguage: string
    newsCategory?: string
  }) => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState<string>("")
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [draftLevel, setDraftLevel] = useState(level)
  const [draftSource, setDraftSource] = useState(sourceLanguage)
  const [draftTarget, setDraftTarget] = useState(targetLanguage)
  const [draftNewsCategory, setDraftNewsCategory] = useState(
    newsCategory || "world"
  )
  const uiSettings = useMemo(
    () => getUiSettings(sourceLanguage),
    [sourceLanguage]
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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

  useEffect(() => {
    setDraftLevel(level)
    setDraftSource(sourceLanguage)
    setDraftTarget(targetLanguage)
    setDraftNewsCategory(newsCategory || "world")
  }, [level, sourceLanguage, targetLanguage, newsCategory])

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (wrapperRef.current.contains(event.target as Node)) return
      setOpen(false)
    }
    window.addEventListener("mousedown", handler)
    return () => window.removeEventListener("mousedown", handler)
  }, [open])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const updateProfile = async () => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return
    setIsSaving(true)
    setSaveError(null)
    await fetch("/api/auth/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        level: draftLevel,
        sourceLanguage: draftSource,
        targetLanguage: draftTarget,
        newsCategory: draftNewsCategory,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? "Save failed")
        }
        onUpdateSettings({
          level: draftLevel,
          sourceLanguage: draftSource,
          targetLanguage: draftTarget,
          newsCategory: draftNewsCategory,
        })
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "vocado-profile-settings",
            JSON.stringify({
              level: draftLevel,
              sourceLanguage: draftSource,
              targetLanguage: draftTarget,
              newsCategory: draftNewsCategory,
            })
          )
        }
        setOpen(false)
      })
      .catch((err) => {
        setSaveError((err as Error).message)
      })
      .finally(() => {
        setIsSaving(false)
      })
  }

  if (!email) return null

  return (
    <div ref={wrapperRef} className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-10 w-10 rounded-full border border-neutral-700 bg-neutral-900/70 text-sm font-semibold text-neutral-100"
        aria-label="Perfil"
      >
        {email.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-neutral-800 bg-neutral-950/95 p-3 text-xs text-neutral-200 shadow-xl z-50">
          <div className="truncate text-sm font-medium">{email}</div>
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">
                Source
              </label>
              <select
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
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
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
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
                value={draftLevel}
                onChange={(e) => setDraftLevel(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
              >
                {LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-neutral-400">
                News
              </label>
              <select
                value={draftNewsCategory}
                onChange={(e) => setDraftNewsCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="world">
                  {uiSettings?.news?.categoryOptions?.world ?? "World"}
                </option>
                <option value="wirtschaft">
                  {uiSettings?.news?.categoryOptions?.wirtschaft ?? "Economy"}
                </option>
                <option value="sport">
                  {uiSettings?.news?.categoryOptions?.sport ?? "Sport"}
                </option>
              </select>
            </div>
            {saveError && <div className="text-[11px] text-red-400">{saveError}</div>}
            <button
              type="button"
              onClick={updateProfile}
              disabled={isSaving}
              className="mt-2 w-full rounded-lg border border-green-500/40 bg-green-600/20 px-3 py-2 text-xs text-green-100 hover:bg-green-600/30 disabled:opacity-50"
            >
              {uiSettings?.profile?.save ?? "Guardar"}
            </button>
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
