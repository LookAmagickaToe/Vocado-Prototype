"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import UserMenu from "@/components/UserMenu"
import uiSettings from "@/data/ui/settings.json"

const LAST_LOGIN_STORAGE_KEY = "vocado-last-login"
const LAST_PLAYED_STORAGE_KEY = "vocado-last-played"
const SEEDS_STORAGE_KEY = "vocado-seeds"

type ProfileSettings = {
  level: string
  sourceLanguage: string
  targetLanguage: string
}

type LastPlayed = {
  id: string
  title: string
  levelIndex?: number
}

export default function HomeClient({
  profile,
}: {
  profile: ProfileSettings
}) {
  const router = useRouter()
  const [profileState, setProfileState] = useState(profile)
  const [isSad, setIsSad] = useState(false)
  const [seeds, setSeeds] = useState(0)
  const [wordsLearned, setWordsLearned] = useState(0)
  const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null)

  const ui = useMemo(
    () => ({
      title: uiSettings?.home?.title ?? "Inicio",
      wordsLearnedLabel:
        uiSettings?.home?.wordsLearnedLabel ?? "Palabras aprendidas esta semana",
      goalsTitle: uiSettings?.home?.goalsTitle ?? "Objetivos diarios",
      goalPlay: uiSettings?.home?.goalPlay ?? "Jugar 3 partidas",
      goalUpload: uiSettings?.home?.goalUpload ?? "Subir nuevas palabras",
      goalNews: uiSettings?.home?.goalNews ?? "Jugar el periódico diario",
      lastPlayedTitle: uiSettings?.home?.lastPlayedTitle ?? "Último mundo jugado",
      lastPlayedAction: uiSettings?.home?.lastPlayedAction ?? "Reanudar",
      uploadAction: uiSettings?.home?.uploadAction ?? "Subir lista",
      worldsAction: uiSettings?.home?.worldsAction ?? "Mundos",
      newsAction: uiSettings?.home?.newsAction ?? "Noticias",
      newsTitle: uiSettings?.home?.newsTitle ?? "Título del artículo destacado",
      seedsLabel: uiSettings?.home?.seedsLabel ?? "Semillas",
    }),
    []
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const rawLogin = window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY)
    if (rawLogin) {
      const last = Number(rawLogin)
      if (!Number.isNaN(last)) {
        const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24)
        if (diffDays >= 3) {
          setIsSad(true)
        }
      }
    }
    window.localStorage.setItem(LAST_LOGIN_STORAGE_KEY, String(Date.now()))

    const rawSeeds = window.localStorage.getItem(SEEDS_STORAGE_KEY)
    setSeeds(rawSeeds ? Number(rawSeeds) || 0 : 0)

    const rawWords = window.localStorage.getItem("vocado-words-week")
    setWordsLearned(rawWords ? Number(rawWords) || 0 : 0)

    const rawLast = window.localStorage.getItem(LAST_PLAYED_STORAGE_KEY)
    if (rawLast) {
      try {
        const parsed = JSON.parse(rawLast)
        if (parsed?.id && parsed?.title) {
          setLastPlayed(parsed)
        }
      } catch {
        // ignore
      }
    }
  }, [])

  const mascotSrc = isSad ? "/mascot/sad_vocado.png" : "/mascot/happy_vocado.png"

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-200">
            <span className="font-semibold">{seeds}</span>
            <span>{ui.seedsLabel}</span>
          </div>
          <UserMenu
            level={profileState.level || "B1"}
            sourceLanguage={profileState.sourceLanguage}
            targetLanguage={profileState.targetLanguage}
            onUpdateSettings={setProfileState}
          />
        </header>

        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-6 text-center shadow-xl">
          <img
            src={mascotSrc}
            alt="Mascot"
            className="mx-auto h-40 w-40 object-contain"
          />
          <div className="mt-4 text-lg font-semibold">{ui.title}</div>
          <div className="mt-2 text-sm text-neutral-300">
            {ui.wordsLearnedLabel}:{" "}
            <span className="font-semibold text-neutral-100">{wordsLearned}</span>
          </div>
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="text-sm font-semibold text-neutral-100">{ui.goalsTitle}</div>
          <ul className="mt-3 space-y-2 text-sm text-neutral-200">
            <li>• {ui.goalPlay}</li>
            <li>• {ui.goalUpload}</li>
            <li>• {ui.goalNews}</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="text-sm font-semibold text-neutral-100">{ui.lastPlayedTitle}</div>
          <div className="mt-2 text-sm text-neutral-300">
            {lastPlayed?.title ?? "—"}
          </div>
          <button
            type="button"
            disabled={!lastPlayed}
            onClick={() =>
              lastPlayed
                ? router.push(`/play?world=${encodeURIComponent(lastPlayed.id)}`)
                : undefined
            }
            className="mt-3 rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
          >
            {ui.lastPlayedAction}
          </button>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/play?open=upload")}
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 hover:text-white"
          >
            {ui.uploadAction}
          </button>
          <button
            type="button"
            onClick={() => router.push("/play?open=worlds")}
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 hover:text-white"
          >
            {ui.worldsAction}
          </button>
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <button
            type="button"
            onClick={() => router.push("/news")}
            className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm text-neutral-100 hover:text-white"
          >
            {ui.newsAction}
          </button>
          <div className="mt-3 text-sm text-neutral-300">{ui.newsTitle}</div>
        </section>
      </div>
    </div>
  )
}
