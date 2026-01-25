"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import UserMenu from "@/components/UserMenu"
import { getUiSettings } from "@/lib/ui-settings"
import { supabase } from "@/lib/supabase/client"

const LAST_LOGIN_STORAGE_KEY = "vocado-last-login"
const LAST_PLAYED_STORAGE_KEY = "vocado-last-played"
const SEEDS_STORAGE_KEY = "vocado-seeds"
const WEEKLY_WORDS_STORAGE_KEY = "vocado-words-weekly"
const WEEKLY_START_STORAGE_KEY = "vocado-week-start"
const DAILY_STATE_STORAGE_KEY = "vocado-daily-state"

type ProfileSettings = {
  level: string
  sourceLanguage: string
  targetLanguage: string
  newsCategory?: string
  seeds?: number
  weeklyWords?: number
  weeklyWordsWeekStart?: string
  dailyState?: { date: string; games: number; upload: boolean; news: boolean } | null
  dailyStateDate?: string
}

const getWeekStartIso = () => {
  const date = new Date()
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

const getLastPlayedKey = (source?: string, target?: string) => {
  const src = source?.trim() || "auto"
  const tgt = target?.trim() || "auto"
  return `${LAST_PLAYED_STORAGE_KEY}:${src}:${tgt}`
}

type LastPlayed = {
  id: string
  title: string
  levelIndex?: number
}

type ReviewItem = {
  source: string
  target: string
  pos: "verb" | "noun" | "adj" | "other"
  lemma?: string
  emoji?: string
  explanation?: string
  example?: string
  syllables?: string
}

type StoredWorld = {
  worldId: string
  title: string
  json: any
}

type StoredList = {
  id: string
  name: string
}

export default function HomeClient({ profile }: { profile: ProfileSettings }) {
  const router = useRouter()
  const [profileState, setProfileState] = useState(profile)
  const [isSad, setIsSad] = useState(false)
  const [seeds, setSeeds] = useState(0)
  const [wordsLearned, setWordsLearned] = useState(0)
  const [dailyGames, setDailyGames] = useState(0)
  const [dailyUploadDone, setDailyUploadDone] = useState(false)
  const [dailyNewsDone, setDailyNewsDone] = useState(false)
  const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null)
  const [topNewsTitle, setTopNewsTitle] = useState("")
  const [translateInput, setTranslateInput] = useState("")
  const [translateResult, setTranslateResult] = useState<ReviewItem | null>(null)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [addMode, setAddMode] = useState<"world" | "list">("world")
  const [availableWorlds, setAvailableWorlds] = useState<StoredWorld[]>([])
  const [availableLists, setAvailableLists] = useState<StoredList[]>([])
  const [selectedWorldId, setSelectedWorldId] = useState("")
  const [newWorldName, setNewWorldName] = useState("")
  const [selectedListId, setSelectedListId] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)

  const uiSettings = useMemo(
    () => getUiSettings(profileState.sourceLanguage),
    [profileState.sourceLanguage]
  )
  const ui = useMemo(
    () => ({
      title: uiSettings?.home?.title ?? "Inicio",
      wordsLearnedLabel:
        uiSettings?.home?.wordsLearnedLabel ?? "Palabras aprendidas esta semana",
      goalsTitle: uiSettings?.home?.goalsTitle ?? "Objetivos diarios",
      goalPlay: uiSettings?.home?.goalPlay ?? "Jugar 3 partidas",
      goalUpload: uiSettings?.home?.goalUpload ?? "Subir nuevas palabras",
      goalNews: uiSettings?.home?.goalNews ?? "Jugar el periódico diario",
      goalPlayProgress: uiSettings?.home?.goalPlayProgress ?? "Partidas",
      goalUploadProgress: uiSettings?.home?.goalUploadProgress ?? "Listas nuevas",
      lastPlayedTitle: uiSettings?.home?.lastPlayedTitle ?? "Último mundo jugado",
      lastPlayedAction: uiSettings?.home?.lastPlayedAction ?? "Reanudar",
      uploadAction: uiSettings?.home?.uploadAction ?? "Subir lista",
      worldsAction: uiSettings?.home?.worldsAction ?? "Mundos",
      newsAction: uiSettings?.home?.newsAction ?? "Noticias",
      newsTitle: uiSettings?.home?.newsTitle ?? "Título del artículo destacado",
      seedsLabel: uiSettings?.home?.seedsLabel ?? "🌱Semillas",
      translateTitle: uiSettings?.home?.translateTitle ?? "Traducir",
      translatePlaceholder: uiSettings?.home?.translatePlaceholder ?? "Escribe una palabra...",
      translateAction: uiSettings?.home?.translateAction ?? "Traducir",
      addToWorldLabel: uiSettings?.home?.addToWorldLabel ?? "Agregar a mundo",
      addToListLabel: uiSettings?.home?.addToListLabel ?? "Crear nuevo mundo",
      worldSelectLabel: uiSettings?.home?.worldSelectLabel ?? "Mundo",
      listSelectLabel: uiSettings?.home?.listSelectLabel ?? "Lista",
      worldNameLabel: uiSettings?.home?.worldNameLabel ?? "Nombre del mundo",
      confirmAdd: uiSettings?.home?.confirmAdd ?? "Guardar",
    }),
    [uiSettings]
  )

  const syncStatsToServer = async (
    nextSeeds: number,
    nextWeeklyWords: number,
    weekStart: string,
    dailyState?: { date: string; games: number; upload: boolean; news: boolean }
  ) => {
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      const res = await fetch("/api/auth/profile/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          seeds: nextSeeds,
          weeklyWords: nextWeeklyWords,
          weekStart,
          dailyState,
          dailyStateDate: dailyState?.date ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.warn("[stats] sync failed", data?.details || data?.error || res.status)
      }
    } catch {
      // ignore sync errors
    }
  }

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

    const syncSeedsFromStorage = () => {
      const rawSeeds = window.localStorage.getItem(SEEDS_STORAGE_KEY)
      const localSeeds = rawSeeds ? Number(rawSeeds) || 0 : 0
      if (typeof profileState.seeds === "number") {
        const seedValue = Math.max(profileState.seeds, localSeeds)
        window.localStorage.setItem(SEEDS_STORAGE_KEY, String(seedValue))
        setSeeds(seedValue)
        if (seedValue > profileState.seeds) {
          syncStatsToServer(seedValue, wordsLearned, getWeekStartIso())
        }
      } else {
        setSeeds(localSeeds)
      }
    }

    const syncWeeklyFromStorage = () => {
      const weekStartNormalized = getWeekStartIso()
      const serverWeekStart = profileState.weeklyWordsWeekStart || ""
      const rawLocal = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
      const localWeekly = rawLocal ? Number(rawLocal) || 0 : 0
      if (serverWeekStart === weekStartNormalized && typeof profileState.weeklyWords === "number") {
        const weeklyValue = Math.max(profileState.weeklyWords, localWeekly)
        window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStartNormalized)
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, String(weeklyValue))
        setWordsLearned(weeklyValue)
        if (weeklyValue > profileState.weeklyWords) {
          syncStatsToServer(seeds, weeklyValue, weekStartNormalized)
        }
      } else {
        const rawWeekStart = window.localStorage.getItem(WEEKLY_START_STORAGE_KEY)
      if (rawWeekStart !== weekStartNormalized) {
        window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStartNormalized)
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
        setWordsLearned(0)
        syncStatsToServer(seeds, 0, weekStartNormalized)
      } else {
        setWordsLearned(localWeekly)
      }
      }
    }

    const syncDailyFromStorage = () => {
      const today = new Date().toISOString().slice(0, 10)
      let local: { date: string; games: number; upload: boolean; news: boolean } | null = null
      const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
      if (rawDaily) {
        try {
          const parsed = JSON.parse(rawDaily)
          if (parsed?.date === today) {
            local = {
              date: today,
              games: parsed?.games ?? 0,
              upload: !!parsed?.upload,
              news: !!parsed?.news,
            }
          }
        } catch {
          // ignore
        }
      }

      const server =
        profileState.dailyState && profileState.dailyState.date === today
          ? {
              date: today,
              games: profileState.dailyState.games ?? 0,
              upload: !!profileState.dailyState.upload,
              news: !!profileState.dailyState.news,
            }
          : null

      if (local || server) {
        const merged = {
          date: today,
          games: Math.max(local?.games ?? 0, server?.games ?? 0),
          upload: !!(local?.upload || server?.upload),
          news: !!(local?.news || server?.news),
        }
        window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(merged))
        setDailyGames(merged.games)
        setDailyUploadDone(merged.upload)
        setDailyNewsDone(merged.news)
        if (
          !server ||
          server.games !== merged.games ||
          server.upload !== merged.upload ||
          server.news !== merged.news
        ) {
          syncStatsToServer(seeds, wordsLearned, getWeekStartIso(), merged)
        }
        return
      }

      const reset = { date: today, games: 0, upload: false, news: false }
      window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(reset))
      setDailyGames(0)
      setDailyUploadDone(false)
      setDailyNewsDone(false)
      syncStatsToServer(seeds, wordsLearned, getWeekStartIso(), reset)
    }

    syncSeedsFromStorage()
    syncWeeklyFromStorage()
    syncDailyFromStorage()

    const lastKey = getLastPlayedKey(
      profileState.sourceLanguage,
      profileState.targetLanguage
    )
    const rawLast = window.localStorage.getItem(lastKey)
    if (rawLast) {
      try {
        const parsed = JSON.parse(rawLast)
        if (parsed?.id && parsed?.title) {
          setLastPlayed(parsed)
        }
      } catch {
        // ignore
      }
    } else {
      setLastPlayed(null)
    }

    const loadTopNews = async () => {
      try {
        const preferred = profileState.newsCategory || "world"
        const cacheKey = `vocado-news-cache-${preferred}`
        const cached = window.localStorage.getItem(cacheKey)
        if (cached) {
          try {
            const parsed = JSON.parse(cached)
            const first = Array.isArray(parsed?.items) ? parsed.items[0] : null
            if (first?.title) {
              setTopNewsTitle(first.title)
              return
            }
          } catch {
            // ignore
          }
        }
        const response = await fetch(`/api/news/tagesschau?ressort=${preferred}`)
        const data = await response.json()
        const items = Array.isArray(data?.items) ? data.items : []
        const limited = items.slice(0, 3)
        const first = limited[0]
        setTopNewsTitle(first?.title ?? "")
        window.localStorage.setItem(cacheKey, JSON.stringify({ items: limited }))
      } catch {
        setTopNewsTitle("")
      }
    }
    loadTopNews()

    const handleFocus = () => {
      syncSeedsFromStorage()
      syncWeeklyFromStorage()
      syncDailyFromStorage()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [profileState])

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const nextDaily = { date: today, games: dailyGames, upload: dailyUploadDone, news: dailyNewsDone }
    window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(nextDaily))
    syncStatsToServer(seeds, wordsLearned, getWeekStartIso(), nextDaily)
  }, [dailyGames, dailyUploadDone, dailyNewsDone, seeds, wordsLearned])

  useEffect(() => {
      const loadListsAndWorlds = async () => {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      const response = await fetch("/api/storage/worlds/list", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return
      const data = await response.json()
      const worlds = Array.isArray(data?.worlds) ? data.worlds : []
      const lists = Array.isArray(data?.lists) ? data.lists : []
      const filteredWorlds = worlds
        .map((entry: any) => ({
          worldId: entry.worldId,
          title: entry.title ?? entry?.json?.title ?? entry.worldId,
          json: entry.json,
        }))
        .filter((entry: StoredWorld) => entry.json?.mode === "vocab" && entry.json?.submode !== "conjugation")
      setAvailableWorlds(filteredWorlds)
      setAvailableLists(
        lists.map((list: any) => ({ id: list.id, name: list.name })) as StoredList[]
      )
      if (filteredWorlds.length > 0) {
        setSelectedWorldId(filteredWorlds[0].worldId)
      }
    }
    loadListsAndWorlds()
  }, [profileState.sourceLanguage, profileState.targetLanguage])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SEEDS_STORAGE_KEY) {
        const next = event.newValue ? Number(event.newValue) || 0 : 0
        setSeeds(next)
      }
      if (event.key === WEEKLY_WORDS_STORAGE_KEY) {
        const next = event.newValue ? Number(event.newValue) || 0 : 0
        setWordsLearned(next)
      }
      if (event.key === DAILY_STATE_STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue)
          const today = new Date().toISOString().slice(0, 10)
          if (parsed?.date === today) {
            setDailyGames(parsed?.games ?? 0)
            setDailyUploadDone(!!parsed?.upload)
            setDailyNewsDone(!!parsed?.news)
          }
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  useEffect(() => {
    const syncProfileFromStorage = () => {
      if (typeof window === "undefined") return
      const raw = window.localStorage.getItem("vocado-profile-settings")
      if (!raw) return
      try {
        const parsed = JSON.parse(raw)
        if (
          parsed &&
          (parsed.level || parsed.sourceLanguage || parsed.targetLanguage || parsed.newsCategory)
        ) {
          setProfileState((prev) => ({ ...prev, ...parsed }))
        }
      } catch {
        // ignore
      }
    }
    syncProfileFromStorage()
  }, [])

  const mascotSrc = isSad ? "/mascot/sad_vocado.png" : "/mascot/happy_vocado.png"

  const normalizeText = (value: unknown) =>
    typeof value === "string" ? value.trim() : ""

  const normalizePos = (value: unknown): ReviewItem["pos"] =>
    value === "verb" || value === "noun" || value === "adj" ? value : "other"

  const normalizeEmoji = (value: unknown) => {
    if (typeof value !== "string") return "📝"
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : "📝"
  }

  const sourceLabel = profileState.sourceLanguage || "Español"
  const targetLabel = profileState.targetLanguage || "Alemán"

  const callAi = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    let data: any = null
    try {
      data = await response.json()
    } catch {
      const text = await response.text().catch(() => "")
      data = { error: text }
    }
    if (!response.ok) {
      throw new Error(data?.error || "AI request failed")
    }
    return data
  }

  const handleTranslate = async () => {
    setTranslateError(null)
    setSaveError(null)
    setIsTranslating(true)
    try {
      const result = await callAi({
        task: "parse_text",
        text: translateInput,
        sourceLabel,
        targetLabel,
        level: profileState.level || undefined,
      })
      const items = Array.isArray(result?.items) ? result.items : []
      if (items.length === 0) {
        setTranslateError("No se pudo traducir.")
        return
      }
      const item = items[0]
      setTranslateResult({
        source: normalizeText(item?.source),
        target: normalizeText(item?.target),
        pos: normalizePos(item?.pos),
        lemma: normalizeText(item?.lemma) || undefined,
        emoji: normalizeEmoji(item?.emoji),
        explanation: normalizeText(item?.explanation) || undefined,
        example: normalizeText(item?.example) || undefined,
        syllables: normalizeText(item?.syllables) || undefined,
      })
    } catch (err) {
      setTranslateError((err as Error).message)
    } finally {
      setIsTranslating(false)
    }
  }

  const ensureConjugation = async (item: ReviewItem) => {
    if (item.pos !== "verb") return undefined
    const lemma = item.lemma || item.target
    if (!lemma) return undefined
    const result = await callAi({
      task: "conjugate",
      verbs: [{ lemma, translation: item.source }],
      sourceLabel,
      targetLabel,
    })
    const conjugations = Array.isArray(result?.conjugations) ? result.conjugations : []
    const entry = conjugations[0]
    if (!entry?.verb) return undefined
    return {
      infinitive: entry.verb,
      translation: entry.translation ?? "",
      sections: Array.isArray(entry.sections) ? entry.sections : [],
    }
  }

  const saveWorlds = async (worlds: any[], listId?: string) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) throw new Error("Missing auth token")
    const response = await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds,
        listId: listId || null,
        positions: worlds.reduce<Record<string, number>>((acc, world, index) => {
          acc[world.id] = index
          return acc
        }, {}),
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Save failed")
    }
  }

  const handleAdd = async () => {
    if (!translateResult) return
    setSaveError(null)
    try {
      const conjugation = await ensureConjugation(translateResult)
      const explanation = translateResult.explanation?.trim() || `Significado de ${translateResult.source}.`
      const example = translateResult.example?.trim() || `Ejemplo: ${translateResult.source}.`
      const syllables = translateResult.syllables?.trim()
      const explanationWithSyllables =
        translateResult.pos === "verb" && syllables && translateResult.target
          ? `${explanation}\n${translateResult.target}\n${syllables}`
          : explanation

      const newItem = {
        id: `item-${Date.now()}`,
        es: translateResult.source,
        de: translateResult.target,
        image: { type: "emoji", value: translateResult.emoji ?? "📝" },
        pos: translateResult.pos,
        explanation: explanationWithSyllables,
        example,
        conjugation,
      }

      if (addMode === "world") {
        const target = availableWorlds.find((w) => w.worldId === selectedWorldId)
        if (!target?.json) {
          setSaveError("Selecciona un mundo válido.")
          return
        }
        const updatedWorld = {
          ...target.json,
          pool: [...(target.json.pool ?? []), newItem],
        }
        await saveWorlds([updatedWorld], undefined)
      } else {
        if (!newWorldName.trim()) {
          setSaveError("Ingresa un nombre de mundo.")
          return
        }
        const newWorld = {
          id: `upload-${Date.now()}`,
          title: newWorldName.trim(),
          description: `Lista personalizada: ${newWorldName.trim()}`,
          mode: "vocab",
          source_language: sourceLabel,
          target_language: targetLabel,
          pool: [newItem],
          chunking: { mode: "sequential", itemsPerGame: 8 },
        }
        await saveWorlds([newWorld], selectedListId || null)
      }
      if (!dailyUploadDone) {
        setDailyUploadDone(true)
        const currentSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
        const nextSeeds = currentSeeds + 10
        window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
        setSeeds(nextSeeds)
        const weekStart = getWeekStartIso()
        const rawWeekly = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
        const weeklyValue = Number(rawWeekly || "0") || 0
        syncStatsToServer(nextSeeds, weeklyValue, weekStart)
      }
      setTranslateInput("")
      setTranslateResult(null)
      setNewWorldName("")
    } catch (err) {
      setSaveError((err as Error).message)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-xs text-neutral-200">
            <span className="font-semibold">{seeds}</span>
            <span>🌱</span>
          </div>
          <UserMenu
            level={profileState.level || "B1"}
            sourceLanguage={profileState.sourceLanguage}
            targetLanguage={profileState.targetLanguage}
            newsCategory={profileState.newsCategory}
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
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-600 text-[10px]">
                  {dailyGames >= 3 ? "✓" : ""}
                </span>
                {ui.goalPlay}
              </span>
              <span className="text-xs text-neutral-400">
                {ui.goalPlayProgress} {Math.min(dailyGames, 3)}/3 · 45🌱
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-600 text-[10px]">
                  {dailyUploadDone ? "✓" : ""}
                </span>
                {ui.goalUpload}
              </span>
              <span className="text-xs text-neutral-400">
                {ui.goalUploadProgress} {dailyUploadDone ? 1 : 0}/1 · 10🌱
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-600 text-[10px]">
                  {dailyNewsDone ? "✓" : ""}
                </span>
                {ui.goalNews}
              </span>
              <span className="text-xs text-neutral-400">
                {dailyNewsDone ? 1 : 0}/1 · 30🌱
              </span>
            </li>
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
          <div className="mt-3 text-sm text-neutral-300">
            {topNewsTitle || ui.newsTitle}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="text-sm font-semibold text-neutral-100">{ui.translateTitle}</div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={translateInput}
              onChange={(e) => setTranslateInput(e.target.value)}
              placeholder={ui.translatePlaceholder}
              className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
            />
            <button
              type="button"
              onClick={handleTranslate}
              disabled={isTranslating}
              className="rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30 disabled:opacity-50"
            >
              {isTranslating ? "..." : ui.translateAction}
            </button>
          </div>

          {translateResult && (
            <div className="mt-4 space-y-3 text-sm text-neutral-200">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="font-semibold">
                  {translateResult.source} → {translateResult.target}
                </div>
                <div className="text-xs text-neutral-400 mt-1">
                  {translateResult.explanation}
                </div>
                <div className="text-xs text-neutral-400 mt-1">
                  {translateResult.example}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAddMode("world")}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-xs",
                    addMode === "world"
                      ? "border-neutral-200 text-white"
                      : "border-neutral-800 text-neutral-300",
                  ].join(" ")}
                >
                  {ui.addToWorldLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("list")}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-xs",
                    addMode === "list"
                      ? "border-neutral-200 text-white"
                      : "border-neutral-800 text-neutral-300",
                  ].join(" ")}
                >
                  {ui.addToListLabel}
                </button>
              </div>

              {addMode === "world" ? (
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">{ui.worldSelectLabel}</label>
                  <select
                    value={selectedWorldId}
                    onChange={(e) => setSelectedWorldId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                  >
                    {availableWorlds.map((world) => (
                      <option key={world.worldId} value={world.worldId}>
                        {world.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs text-neutral-400">{ui.worldNameLabel}</label>
                  <input
                    type="text"
                    value={newWorldName}
                    onChange={(e) => setNewWorldName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                  />
                  <label className="text-xs text-neutral-400">{ui.listSelectLabel}</label>
                  <select
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
                  >
                    <option value="">—</option>
                    {availableLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {saveError && <div className="text-xs text-red-400">{saveError}</div>}

              <button
                type="button"
                onClick={handleAdd}
                className="rounded-lg border border-green-500/40 bg-green-600/20 px-4 py-2 text-sm text-green-100 hover:bg-green-600/30"
              >
                {ui.confirmAdd}
              </button>
            </div>
          )}

          {translateError && <div className="mt-3 text-xs text-red-400">{translateError}</div>}
        </section>
      </div>
    </div>
  )
}
