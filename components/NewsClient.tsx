"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import UserMenu from "@/components/UserMenu"
import { getUiSettings } from "@/lib/ui-settings"
import pointsConfig from "@/data/ui/points.json"
import type { VocabWorld } from "@/types/worlds"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"
import { supabase } from "@/lib/supabase/client"

const SEEDS_STORAGE_KEY = "vocado-seeds"
const BEST_SCORE_STORAGE_KEY = "vocado-best-scores"
const NEWS_STORAGE_KEY = "vocado-news-current"
const DAILY_STATE_STORAGE_KEY = "vocado-daily-state"
const WEEKLY_WORDS_STORAGE_KEY = "vocado-words-weekly"
const WEEKLY_START_STORAGE_KEY = "vocado-week-start"
const WEEKLY_SEEDS_STORAGE_KEY = "vocado-seeds-weekly"
const WEEKLY_SEEDS_START_STORAGE_KEY = "vocado-seeds-week-start"
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string) => UUID_REGEX.test(value)

const generateUuid = () => {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    if (typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const toHex = (b: number) => b.toString(16).padStart(2, "0")
      const hex = Array.from(bytes, toHex).join("")
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
        16,
        20
      )}-${hex.slice(20)}`
    }
  }
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`
}

const getWeekStartIso = () => {
  const date = new Date()
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

type ProfileSettings = {
  level: string
  sourceLanguage: string
  targetLanguage: string
  newsCategory?: string
  seeds?: number
  weeklyWords?: number
  weeklyWordsWeekStart?: string
  weeklySeeds?: number
  weeklySeedsWeekStart?: string
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

type NewsPayload = {
  summary: string[]
  sourceUrl?: string
  title?: string
  items?: ReviewItem[]
}
type NewsHeadline = {
  id: string
  title: string
  teaser?: string
  date?: string
  url?: string
  image?: string
}

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const normalizePos = (value: unknown): ReviewItem["pos"] =>
  value === "verb" || value === "noun" || value === "adj" ? value : "other"
const normalizeEmoji = (value: unknown) => {
  if (typeof value !== "string") return "📰"
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : "📰"
}

const buildReviewItemsFromAi = (items: any[]) =>
  items.map((item) => {
    const pos = normalizePos(item?.pos)
    return {
      source: normalizeText(item?.source),
      target: normalizeText(item?.target),
      pos,
      lemma: normalizeText(item?.lemma) || undefined,
      emoji: normalizeEmoji(item?.emoji),
      explanation: normalizeText(item?.explanation) || undefined,
      example: normalizeText(item?.example) || undefined,
      syllables: normalizeText(item?.syllables) || undefined,
    } as ReviewItem
  })

const buildWorldFromItems = (
  items: ReviewItem[],
  sourceLabel: string,
  targetLabel: string
): VocabWorld => {
  const id = `news-${Date.now()}`
  const pool = items.map((item, index) => {
    const explanation =
      item.explanation?.trim() || `Significado de ${item.source}.`
    const example =
      item.example?.trim() || `Ejemplo: ${item.source}.`
    const syllables = item.syllables?.trim()
    const explanationWithSyllables =
      item.pos === "verb" && syllables && item.target
        ? `${explanation}\n${item.target}\n${syllables}`
        : explanation
    return {
      id: `${id}-${index}`,
      es: item.source,
      de: item.target,
      image: { type: "emoji", value: item.emoji?.trim() || "📰" },
      pos: item.pos,
      explanation: explanationWithSyllables,
      example,
    }
  })
  return {
    id,
    title: "Noticias",
    description: "Noticias del día.",
    mode: "vocab",
    pool,
    chunking: { itemsPerGame: Math.max(1, items.length) },
    source_language: sourceLabel,
    target_language: targetLabel,
    ui: {
      vocab: {
        carousel: {
          primaryLabel: `${sourceLabel}:`,
          secondaryLabel: `${targetLabel}:`,
        },
      },
    },
  }
}

export default function NewsClient({ profile }: { profile: ProfileSettings }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profileState, setProfileState] = useState(profile)
  const [seeds, setSeeds] = useState(0)
  const [newsUrl, setNewsUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string[]>([])
  const [items, setItems] = useState<ReviewItem[]>([])
  const [step, setStep] = useState<"input" | "play" | "summary">("input")
  const [headlines, setHeadlines] = useState<NewsHeadline[]>([])
  const [isLoadingHeadlines, setIsLoadingHeadlines] = useState(false)
  const [category, setCategory] = useState(profile.newsCategory || "world")
  const [newsTitle, setNewsTitle] = useState("")
  const [newsDate, setNewsDate] = useState<string>("")
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [world, setWorld] = useState<VocabWorld | null>(null)

  const sourceLabel = profileState.sourceLanguage || "Español"
  const targetLabel = profileState.targetLanguage || "Alemán"

  const localeForLanguage = (value: string) => {
    const lower = value.toLowerCase()
    if (lower.includes("deutsch") || lower.includes("german")) return "de-DE"
    if (lower.includes("english")) return "en-US"
    if (lower.includes("français") || lower.includes("french")) return "fr-FR"
    if (lower.includes("italiano") || lower.includes("italian")) return "it-IT"
    if (lower.includes("portugu")) return "pt-PT"
    return "es-ES"
  }

  const formatNewsDate = (value?: string) => {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) {
      return ""
    }
    return new Intl.DateTimeFormat(localeForLanguage(targetLabel), {
      day: "2-digit",
      month: "long",
    }).format(date)
  }

  const uiSettings = useMemo(
    () => getUiSettings(profileState.sourceLanguage),
    [profileState.sourceLanguage]
  )
  const ui = useMemo(
    () => ({
      title: uiSettings?.news?.title ?? "Noticias",
      linkLabel: uiSettings?.news?.linkLabel ?? "Noticias",
      linkPlaceholder: uiSettings?.news?.linkPlaceholder ?? "Pega el enlace del artículo",
      generateButton: uiSettings?.news?.generateButton ?? "Generar",
      playButton: uiSettings?.news?.playButton ?? "Jugar",
      loading: uiSettings?.news?.loading ?? "Procesando...",
      readButton: uiSettings?.news?.readButton ?? "Leer periódico",
      summaryTitle: uiSettings?.news?.summaryTitle ?? "Resumen",
      vocabTitle: uiSettings?.news?.vocabTitle ?? "Palabras aprendidas",
      sourceLabel: uiSettings?.news?.sourceLabel ?? "Fuente",
      categoryLabel: uiSettings?.news?.categoryLabel ?? "Categoría",
      categoryOptions: uiSettings?.news?.categoryOptions ?? {},
    }),
    [uiSettings]
  )

  const syncStatsToServer = async (
    nextSeeds: number,
    nextWeeklySeeds: number,
    nextWeeklyWords: number,
    weekStart: string,
    dailyState?: { date: string; games: number; upload: boolean; news: boolean }
  ) => {
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      await fetch("/api/auth/profile/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          seeds: nextSeeds,
          weeklySeeds: nextWeeklySeeds,
          weeklySeedsWeekStart: weekStart,
          weeklyWords: nextWeeklyWords,
          weekStart,
          dailyState,
          dailyStateDate: dailyState?.date ?? undefined,
        }),
      })
    } catch {
      // ignore sync errors
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const shouldShowSummary = searchParams.get("summary") === "1"
    if (!shouldShowSummary) return
    const raw = window.localStorage.getItem(NEWS_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed: NewsPayload = JSON.parse(raw)
      if (Array.isArray(parsed.summary) && parsed.summary.length) {
        setSummary(parsed.summary)
        if (parsed.items) {
          setItems(parsed.items)
          setWorld(buildWorldFromItems(parsed.items, sourceLabel, targetLabel))
        }
        setStep("summary")
      }
    } catch {
      // ignore
    }
  }, [sourceLabel, targetLabel, searchParams])

  useEffect(() => {
    if (typeof window === "undefined") return
    const rawSeeds = window.localStorage.getItem(SEEDS_STORAGE_KEY)
    setSeeds(rawSeeds ? Number(rawSeeds) || 0 : 0)
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SEEDS_STORAGE_KEY) {
        const next = event.newValue ? Number(event.newValue) || 0 : 0
        setSeeds(next)
      }
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const weekStart = getWeekStartIso()
    if (typeof profileState.seeds === "number") {
      window.localStorage.setItem(SEEDS_STORAGE_KEY, String(profileState.seeds))
      setSeeds(profileState.seeds)
    }
    if (typeof profileState.weeklyWords === "number") {
      const serverWeekStart = profileState.weeklyWordsWeekStart || ""
      if (serverWeekStart === weekStart) {
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, String(profileState.weeklyWords))
      } else {
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
      }
      window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStart)
    }
    if (typeof profileState.weeklySeeds === "number") {
      const serverWeekStart = profileState.weeklySeedsWeekStart || ""
      if (serverWeekStart === weekStart) {
        window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(profileState.weeklySeeds))
      } else {
        window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
      }
      window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
    }
  }, [
    profileState.seeds,
    profileState.weeklyWords,
    profileState.weeklyWordsWeekStart,
    profileState.weeklySeeds,
    profileState.weeklySeedsWeekStart,
  ])

  useEffect(() => {
    const loadHeadlines = async () => {
      setIsLoadingHeadlines(true)
      const cacheKey = `vocado-news-cache-${category}`
      const cached = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed?.items)) {
            setHeadlines(parsed.items.slice(0, 3))
            setIsLoadingHeadlines(false)
            return
          }
        } catch {
          // ignore
        }
      }
      try {
        const response = await fetch(`/api/news/tagesschau?ressort=${category}`)
        const data = await response.json()
        const items = Array.isArray(data?.items) ? data.items : []
        setHeadlines(items.slice(0, 3))
        if (typeof window !== "undefined") {
          window.localStorage.setItem(cacheKey, JSON.stringify({ items: items.slice(0, 3) }))
        }
      } catch {
        setHeadlines([])
      } finally {
        setIsLoadingHeadlines(false)
      }
    }
    loadHeadlines()
  }, [category])

  const lastProfileCategoryRef = useRef<string | null>(null)
  useEffect(() => {
    const preferred = profile.newsCategory || "world"
    if (lastProfileCategoryRef.current !== preferred) {
      lastProfileCategoryRef.current = preferred
      setCategory(preferred)
    }
  }, [profile.newsCategory])

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
      const detailsMessage =
        data?.details?.error?.message ||
        data?.details?.error?.status ||
        data?.details?.error ||
        data?.details?.message
      throw new Error(detailsMessage || data?.error || "AI request failed")
    }
    return data
  }

  const getAuthToken = async () => {
    const session = await supabase.auth.getSession()
    return session.data.session?.access_token ?? ""
  }

  const ensureNewsListId = async (token: string) => {
    const response = await fetch("/api/storage/worlds/list", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      throw new Error("No se pudo cargar las listas")
    }
    const data = await response.json()
    const lists = Array.isArray(data?.lists) ? data.lists : []
    const existing = lists.find(
      (list: any) => typeof list?.name === "string" && list.name === "Vocado Diario"
    )
    if (existing?.id && isUuid(existing.id)) {
      return existing.id
    }

    const listId = generateUuid()
    const saveList = await fetch("/api/storage/state", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lists: [{ id: listId, name: "Vocado Diario", position: 0 }],
      }),
    })
    if (!saveList.ok) {
      throw new Error("No se pudo crear la lista de noticias")
    }
    return listId
  }

  const saveNewsWorld = async (worldToSave: VocabWorld) => {
    const token = await getAuthToken()
    if (!token) return
    const listId = await ensureNewsListId(token)
    const response = await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: [worldToSave],
        listId,
        positions: { [worldToSave.id]: 0 },
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Save failed")
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("vocado-refresh-worlds", "1")
    }
  }

  const awardExperience = (
    moves: number,
    wordsLearnedCount: number,
    worldId: string,
    pairsCount: number
  ) => {
    if (typeof window === "undefined") return
    const baseScore = Number(pointsConfig?.baseScore ?? 100)
    const minMovesFactor = Number(pointsConfig?.minMovesFactor ?? 1.5)
    const firstMultiplier = Number(pointsConfig?.firstMultiplier ?? 1.2)
    const perfectMultiplier = Number(pointsConfig?.perfectMultiplier ?? 1)
    const exponent = Number(pointsConfig?.exponent ?? 2)
    const pairs = Math.max(1, pairsCount || 1)
    const n = Math.max(1, moves)
    const minMoves = Math.max(1, Math.floor(pairs * minMovesFactor))
    const baseValue = baseScore * Math.pow(pairs / n, exponent)
    const perfectBonus = n <= minMoves ? Math.ceil(pairs * perfectMultiplier) : 0

    const rawBestStore = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY)
    let bestMap: Record<string, number> = {}
    if (rawBestStore) {
      try {
        bestMap = JSON.parse(rawBestStore)
      } catch {
        bestMap = {}
      }
    }
    const key = `${worldId}:0`
    const sBest = typeof bestMap[key] === "number" ? bestMap[key] : 0
    const isNew = sBest === 0
    const scoreBaseRounded = Math.round(baseValue)
    const scoreForBest = scoreBaseRounded + perfectBonus
    const scoreWithMultiplier = Math.round(scoreBaseRounded * (isNew ? firstMultiplier : 1))
    const payout = isNew
      ? scoreWithMultiplier + perfectBonus
      : Math.max(0, scoreForBest - sBest)
    const newBest = Math.max(scoreForBest, sBest)
    bestMap[key] = newBest
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, JSON.stringify(bestMap))

    const currentSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const nextSeeds = currentSeeds + payout
    window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
    setSeeds(nextSeeds)

    const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
    const today = new Date().toISOString().slice(0, 10)
    let dailyState = { date: today, games: 0, upload: false, news: false }
    if (rawDaily) {
      try {
        const parsed = JSON.parse(rawDaily)
        if (parsed?.date === today) {
          dailyState = {
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
    dailyState.games = Math.min(3, dailyState.games + 1)
    if (dailyState.games === 3) {
      const dailyRewardKey = `${today}-games`
      const rewarded = window.localStorage.getItem(dailyRewardKey) === "1"
      if (!rewarded) {
        const bonusSeeds =
          Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
        window.localStorage.setItem(SEEDS_STORAGE_KEY, String(bonusSeeds + 45))
        window.localStorage.setItem(dailyRewardKey, "1")
      }
    }
    window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(dailyState))

    const weekStart = getWeekStartIso()
    const storedWeekStart = window.localStorage.getItem(WEEKLY_START_STORAGE_KEY)
    if (storedWeekStart !== weekStart) {
      window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
    }
    const rawWeekly = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
    let weeklyValue = Number(rawWeekly || "0") || 0
    if (isNew) {
      weeklyValue = weeklyValue + Math.max(0, wordsLearnedCount || 0)
      window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, String(weeklyValue))
    }

    const storedSeedsWeekStart = window.localStorage.getItem(WEEKLY_SEEDS_START_STORAGE_KEY)
    if (storedSeedsWeekStart !== weekStart) {
      window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
    }
    const rawWeeklySeeds = window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY)
    let weeklySeeds = Number(rawWeeklySeeds || "0") || 0
    const finalSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const seedsDelta = Math.max(0, finalSeeds - currentSeeds)
    if (seedsDelta > 0) {
      weeklySeeds += seedsDelta
      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(weeklySeeds))
    }
    setSeeds(finalSeeds)
    syncStatsToServer(finalSeeds, weeklySeeds, weeklyValue, weekStart, dailyState)
    return {
      payout,
      totalBefore: currentSeeds,
      totalAfter: finalSeeds,
    }
  }

  const handleGenerate = async (urlOverride?: string) => {
    setError(null)
    const finalUrl = urlOverride?.trim() || newsUrl.trim()
    if (!finalUrl) {
      setError("Agrega un enlace válido.")
      return
    }
    if (!newsDate) {
      setNewsDate(new Date().toISOString())
    }
    setIsLoading(true)
    try {
      const result = await callAi({
        task: "news",
        url: finalUrl,
        level: profileState.level || undefined,
        sourceLabel,
        targetLabel,
      })
      const nextSummary = Array.isArray(result?.summary) ? result.summary : []
      const nextItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])
      if (!nextItems.length) {
        setError("No se encontraron palabras.")
        return
      }
      setSummary(nextSummary)
      setItems(nextItems)
      const baseDate = newsDate || new Date().toISOString()
      const dateLabel = formatNewsDate(baseDate)
      const dateSuffix = dateLabel ? ` - ${dateLabel}` : ""
      const worldTitle = `Vocado Diario - ${newsTitle || "Noticia"}${dateSuffix}`
      const newsWorld = {
        ...buildWorldFromItems(nextItems, sourceLabel, targetLabel),
        title: worldTitle,
        description: "Noticias del día.",
      }
      setWorld(newsWorld)
      try {
        await saveNewsWorld(newsWorld)
      } catch (saveError) {
        setError((saveError as Error).message)
      }
      setStep("play")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const currentItem = items[carouselIndex]

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
            aria-label="Volver"
          >
            ←
          </button>
          <div className="text-center flex-1">
            <div className="text-2xl font-semibold">{ui.title}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <UserMenu
              level={profileState.level || "B1"}
              sourceLanguage={profileState.sourceLanguage}
              targetLanguage={profileState.targetLanguage}
              onUpdateSettings={setProfileState}
              newsCategory={profileState.newsCategory}
            />
            <div className="text-xs text-neutral-200">
              <span className="font-semibold">{seeds}</span> 🌱
            </div>
          </div>
        </header>

        {step === "input" && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-neutral-300">{ui.categoryLabel}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100"
              >
                <option value="world">{ui.categoryOptions.world ?? "World"}</option>
                <option value="wirtschaft">{ui.categoryOptions.wirtschaft ?? "Economy"}</option>
                <option value="sport">{ui.categoryOptions.sport ?? "Sport"}</option>
              </select>
            </div>
            <label className="text-sm text-neutral-300">{ui.linkLabel}</label>
            {isLoadingHeadlines ? (
              <div className="text-sm text-neutral-400">Cargando noticias...</div>
            ) : (
              <div className="space-y-3">
                {headlines.map((headline) => (
                  <button
                    key={headline.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                      if (isLoading) return
                      if (!headline.url) {
                        setError("No se encontró enlace para esta noticia.")
                        return
                      }
                      setNewsUrl(headline.url)
                      setNewsTitle(headline.title)
                      setNewsDate(headline.date || new Date().toISOString())
                      handleGenerate(headline.url)
                    }}
                    className={[
                      "w-full rounded-xl border p-4 text-left text-sm text-neutral-100",
                      isLoading
                        ? "border-neutral-900 bg-neutral-900/40 cursor-not-allowed"
                        : "border-neutral-800 bg-neutral-900/60 hover:border-neutral-600",
                    ].join(" ")}
                  >
                    <div className="font-semibold">{headline.title}</div>
                    {headline.teaser && (
                      <div className="mt-2 text-xs text-neutral-400">{headline.teaser}</div>
                    )}
                    {headline.date && (
                      <div className="mt-2 text-[11px] text-neutral-500">{headline.date}</div>
                    )}
                  </button>
                ))}
                {headlines.length === 0 && (
                  <div className="text-sm text-neutral-400">
                    No se encontraron noticias.
                  </div>
                )}
              </div>
            )}
            {error && <div className="text-sm text-red-300">{error}</div>}
            {isLoading && (
              <div className="text-sm text-neutral-400">{ui.loading}</div>
            )}
          </div>
        )}

        {step === "play" && world && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
              {newsUrl}
            </div>
            <VocabMemoryGame
              key={world.id}
              world={world}
              levelIndex={0}
              onNextLevel={() => {
                if (typeof window !== "undefined") {
                  const payload: NewsPayload = {
                    summary,
                    sourceUrl: newsUrl.trim(),
                    title: ui.title,
                    items,
                  }
                  window.localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify(payload))

                  const today = new Date().toISOString().slice(0, 10)
                  const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
                  let dailyState = { date: today, games: 0, upload: false, news: false }
                  if (rawDaily) {
                    try {
                      const parsed = JSON.parse(rawDaily)
                      if (parsed?.date === today) {
                        dailyState = {
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
                  if (!dailyState.news) {
                    const rewardKey = `${today}-news`
                    const rewarded = window.localStorage.getItem(rewardKey) === "1"
                    if (!rewarded) {
                      const currentSeeds =
                        Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
                      const nextSeeds = currentSeeds + 30
                      window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
                      window.localStorage.setItem(rewardKey, "1")
                      setSeeds(nextSeeds)
                      const weekStart = getWeekStartIso()
                      const rawWeekly = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
                      const weeklyValue = Number(rawWeekly || "0") || 0
                      const storedSeedsWeekStart =
                        window.localStorage.getItem(WEEKLY_SEEDS_START_STORAGE_KEY)
                      if (storedSeedsWeekStart !== weekStart) {
                        window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
                        window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
                      }
                      const rawWeeklySeeds = window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY)
                      let weeklySeeds = Number(rawWeeklySeeds || "0") || 0
                      weeklySeeds += 30
                      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(weeklySeeds))
                      syncStatsToServer(nextSeeds, weeklySeeds, weeklyValue, weekStart, dailyState)
                    }
                    dailyState.news = true
                    window.localStorage.setItem(
                      DAILY_STATE_STORAGE_KEY,
                      JSON.stringify(dailyState)
                    )
                  }
                }
                setStep("summary")
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href)
                  url.searchParams.set("summary", "1")
                  window.history.replaceState({}, "", url.toString())
                }
              }}
              primaryLabelOverride={`${sourceLabel}:`}
              secondaryLabelOverride={`${targetLabel}:`}
              nextLabelOverride={ui.readButton}
              onWin={(moves, wordsLearnedCount) =>
                awardExperience(moves, wordsLearnedCount, world.id, world.pool.length)
              }
            />
          </div>
        )}

        {step === "summary" && (
          <div className="grid gap-6 md:grid-cols-[1.4fr,1fr]">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
              <div className="text-lg font-semibold">{ui.summaryTitle}</div>
              <div className="mt-3 space-y-2 text-sm text-neutral-200">
                {summary.map((line, index) => (
                  <div key={`${line}-${index}`} className="leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
              {newsUrl && (
                <div className="mt-4 text-xs text-neutral-400">
                  {ui.sourceLabel}: {newsUrl}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
              <div className="text-lg font-semibold">{ui.vocabTitle}</div>
              {currentItem ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                      disabled={carouselIndex === 0}
                      className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm disabled:opacity-50"
                    >
                      ←
                    </button>
                    <div className="text-xs text-neutral-400">
                      {carouselIndex + 1}/{items.length}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCarouselIndex((i) => Math.min(items.length - 1, i + 1))
                      }
                      disabled={carouselIndex >= items.length - 1}
                      className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm disabled:opacity-50"
                    >
                      →
                    </button>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-center">
                    <div className="text-4xl">{currentItem.emoji ?? "📰"}</div>
                    <div className="mt-2 text-sm">
                      <span className="text-neutral-400">{sourceLabel}:</span>{" "}
                      <span className="font-semibold">{currentItem.source}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-neutral-400">{targetLabel}:</span>{" "}
                      <span className="font-semibold">{currentItem.target}</span>
                    </div>
                  </div>
                  {currentItem.explanation && (
                    <div className="text-xs text-neutral-300">{currentItem.explanation}</div>
                  )}
                  {currentItem.example && (
                    <div className="text-xs text-neutral-400">{currentItem.example}</div>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-neutral-400">
                  No hay palabras para mostrar.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
