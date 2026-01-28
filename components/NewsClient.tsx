"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getUiSettings } from "@/lib/ui-settings"
import pointsConfig from "@/data/ui/points.json"
import type { VocabWorld } from "@/types/worlds"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"
import { formatTemplate } from "@/lib/ui"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import { initializeSRS } from "@/lib/srs"

const SEEDS_STORAGE_KEY = "vocado-seeds"
const BEST_SCORE_STORAGE_KEY = "vocado-best-scores"
const NEWS_STORAGE_KEY = "vocado-news-current"
const DAILY_STATE_STORAGE_KEY = "vocado-daily-state"
const WEEKLY_WORDS_STORAGE_KEY = "vocado-words-weekly"
const WEEKLY_START_STORAGE_KEY = "vocado-week-start"
const WEEKLY_SEEDS_STORAGE_KEY = "vocado-seeds-weekly"
const WEEKLY_SEEDS_START_STORAGE_KEY = "vocado-seeds-week-start"
const READ_NEWS_STORAGE_KEY = "vocado-read-news"
const LAST_LOGIN_STORAGE_KEY = "vocado-last-login"
const LOCAL_NEWS_CACHE_PREFIX = "vocado-news-cache"
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
  dailyState?: { date: string; games: number; upload: boolean; news: boolean } | null
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

const buildReviewItemsFromWorld = (world: VocabWorld): ReviewItem[] =>
  (world.pool || []).map((pair) => ({
    source: pair.es,
    target: pair.de,
    pos: pair.pos ?? "other",
    emoji: pair.image?.type === "emoji" ? pair.image.value : "📰",
    explanation: pair.explanation,
    example: pair.example,
  }))

const buildWorldFromItems = (
  items: ReviewItem[],
  sourceLabel: string,
  targetLabel: string,
  ui: any
): VocabWorld => {
  const id = `news-${Date.now()}`
  const pool = items.map((item, index) => {
    const baseSrs = initializeSRS()
    const hardSrs = { ...baseSrs, bucket: "hard" as const, nextReviewAt: new Date().toISOString() }
    const explanation =
      item.explanation?.trim() || formatTemplate(ui.generation.meaningOf, { source: item.source })
    const example =
      item.example?.trim() || formatTemplate(ui.generation.exampleOf, { source: item.source })
    const syllables = item.syllables?.trim()
    const explanationWithSyllables =
      item.pos === "verb" && syllables && item.target
        ? `${explanation}\n${item.target}\n${syllables}`
        : explanation
    return {
      id: `${id}-${index}`,
      es: item.source,
      de: item.target,
      image: { type: "emoji", value: item.emoji?.trim() || "📰" } as any,
      pos: item.pos,
      explanation: explanationWithSyllables,
      example,
      srs: hardSrs,
    }
  })
  return {
    id,
    title: "Noticias",
    description: "Noticias del día.",
    mode: "vocab",
    pool,
    chunking: { itemsPerGame: 8 },
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
  const searchParams = useSearchParams()
  const autoPlay = searchParams.get("auto") === "1"
  const autoCategory = searchParams.get("category")
  const autoIndexParam = searchParams.get("index")
  const autoStartedRef = useRef(false)
  const autoIndexRef = useRef<number | null>(null)
  const [profileState, setProfileState] = useState(profile)
  const [seeds, setSeeds] = useState(0)
  const [newsUrl, setNewsUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string[]>([])
  const [items, setItems] = useState<ReviewItem[]>([])
  const [step, setStep] = useState<"input" | "loading" | "play" | "summary">("input")
  const [newsWorlds, setNewsWorlds] = useState<VocabWorld[]>([])
  const [isLoadingHeadlines, setIsLoadingHeadlines] = useState(false)
  const [category, setCategory] = useState(profile.newsCategory || "world")
  const [newsTitle, setNewsTitle] = useState("")
  const [newsDate, setNewsDate] = useState<string>("")
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [world, setWorld] = useState<VocabWorld | null>(null)
  const [readNewsUrls, setReadNewsUrls] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(READ_NEWS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setReadNewsUrls(new Set(parsed))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!autoPlay || !autoCategory) return
    if (autoCategory !== "world" && autoCategory !== "wirtschaft" && autoCategory !== "sport") return
    setCategory(autoCategory)
    if (autoIndexParam) {
      const parsed = Number(autoIndexParam)
      if (Number.isFinite(parsed) && parsed >= 0) {
        autoIndexRef.current = Math.floor(parsed)
      }
    }
  }, [autoPlay, autoCategory])


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

  const formatNewsDateFull = (value?: string) => {
    const date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) {
      return ""
    }
    return new Intl.DateTimeFormat(localeForLanguage(targetLabel), {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(date)
  }

  const todayKey = new Date().toISOString().slice(0, 10)
  const isSameDay = (value?: string) => (value || "").slice(0, 10) === todayKey

  const newsCacheKey = useMemo(() => {
    const levelKey = profileState.level || "A2"
    return [
      LOCAL_NEWS_CACHE_PREFIX,
      todayKey,
      category,
      sourceLabel || "src",
      targetLabel || "tgt",
      levelKey,
    ].join(":")
  }, [category, profileState.level, sourceLabel, targetLabel, todayKey])

  const loadLocalNewsCache = () => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(newsCacheKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const worlds = Array.isArray(parsed?.worlds) ? parsed.worlds : []
      if (!worlds.length) return null
      const loginStamp = Number(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY) || "0")
      if (loginStamp && parsed?.lastLogin && parsed.lastLogin !== loginStamp) {
        return null
      }
      return worlds as VocabWorld[]
    } catch {
      return null
    }
  }

  const saveLocalNewsCache = (worlds: VocabWorld[]) => {
    if (typeof window === "undefined") return
    try {
      const loginStamp = Number(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY) || "0") || Date.now()
      window.localStorage.setItem(
        newsCacheKey,
        JSON.stringify({
          lastLogin: loginStamp,
          date: todayKey,
          worlds,
        })
      )
    } catch {
      // ignore cache failures
    }
  }

  const loadCachedDailyNewsList = async (categoryValue: string) => {
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return null
      const response = await fetch("/api/storage/worlds/list", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return null
      const data = await response.json()
      const worlds = Array.isArray(data?.worlds) ? data.worlds : []
      const matched: VocabWorld[] = []
      for (const entry of worlds) {
        const json = entry?.json
        if (!json || json.mode !== "vocab") continue
        const news = json.news
        if (!news?.summary?.length) continue
        if (news?.category !== categoryValue) continue
        if (!isSameDay(news?.date)) continue
        matched.push(json as VocabWorld)
      }
      if (!matched.length) return null
      matched.sort((a, b) => (a.news?.index ?? 0) - (b.news?.index ?? 0))
      return matched
    } catch {
      return null
    }
  }

  const saveNewsWorlds = async (worldsToSave: VocabWorld[]) => {
    if (!worldsToSave.length) return
    const token = await getAuthToken()
    if (!token) return
    const listId = await ensureNewsListId(token)
    await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: worldsToSave,
        listId,
        positions: worldsToSave.reduce<Record<string, number>>((acc, world, index) => {
          acc[world.id] = index
          return acc
        }, {}),
      }),
    })
  }

  const findExistingNewsWorldByUrl = async (url: string): Promise<VocabWorld | null> => {
    const normalized = url.trim()
    if (!normalized) return null
    const fromState = newsWorlds.find((world) => world.news?.sourceUrl === normalized)
    if (fromState) return fromState
    const localCached = loadLocalNewsCache()
    const fromLocal = localCached?.find((world) => world.news?.sourceUrl === normalized)
    if (fromLocal) return fromLocal
    const token = await getAuthToken()
    if (!token) return null
    const response = await fetch("/api/storage/worlds/list", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const data = await response.json()
    const entries = Array.isArray(data?.worlds) ? data.worlds : []
    for (const entry of entries) {
      const json = entry?.json
      if (!json?.news?.sourceUrl) continue
      if (json.news.sourceUrl !== normalized) continue
      const id = entry?.worldId || json.id
      if (id) json.id = id
      if (entry?.title) json.title = entry.title
      return json as VocabWorld
    }
    return null
  }

  const startPlayFromWorld = (newsWorld: VocabWorld) => {
    let needsSave = false
    const normalizedPool = (newsWorld.pool ?? []).map((pair) => {
      if (pair.srs) return pair
      needsSave = true
      return { ...pair, srs: { ...initializeSRS(), bucket: "hard" as const } }
    })
    const patchedWorld = needsSave ? { ...newsWorld, pool: normalizedPool } : newsWorld
    setWorld(patchedWorld)
    setSummary(Array.isArray(patchedWorld.news?.summary) ? patchedWorld.news!.summary : [])
    setNewsUrl(patchedWorld.news?.sourceUrl ?? "")
    setNewsTitle(patchedWorld.news?.title ?? patchedWorld.title)
    setNewsDate(patchedWorld.news?.date ?? todayKey)
    setItems(buildReviewItemsFromWorld(patchedWorld))
    setStep("play")
    if (needsSave) {
      void saveNewsWorld(patchedWorld).catch(() => {})
    }
  }

  const ensureDailyNewsList = async (categoryValue: string) => {
    const localCached = loadLocalNewsCache()
    if (localCached && localCached.length >= 5) {
      const finalLocal = localCached.slice(0, 5)
      setNewsWorlds(finalLocal)
      return finalLocal
    }

    const cachedList =
      (localCached && localCached.length ? localCached : await loadCachedDailyNewsList(categoryValue)) ?? []
    if (cachedList.length >= 5) {
      const finalCached = cachedList.slice(0, 5)
      setNewsWorlds(finalCached)
      saveLocalNewsCache(finalCached)
      return finalCached
    }

    const response = await fetch(`/api/news/tagesschau?ressort=${categoryValue}`)
    const data = await response.json()
    const itemsList = Array.isArray(data?.items) ? data.items : []
    if (!itemsList.length) {
      setNewsWorlds([])
      setError(ui.noNews)
      return []
    }
    try {
      setIsLoading(true)
      const worldsToSave: VocabWorld[] = []
      const existing = new Set(
        cachedList
          .map((world) => world.news?.sourceUrl)
          .filter((value): value is string => Boolean(value))
      )
      for (let i = 0; i < itemsList.length; i += 1) {
        if (cachedList.length + worldsToSave.length >= 5) break
        const headline = itemsList[i]
        if (!headline?.url || existing.has(headline.url)) continue
        const baseDate = headline.date || new Date().toISOString()
        const dateLabel = formatNewsDate(baseDate)
        const dateSuffix = dateLabel ? ` - ${dateLabel}` : ""
        const worldTitle = `Vocado Diario - ${headline.title || "Noticia"}${dateSuffix}`
        let nextSummary: string[] = []
        let nextItems: ReviewItem[] = []
        try {
          const result = await callAi({
            task: "news",
            url: headline.url,
            level: profileState.level || undefined,
            sourceLabel,
            targetLabel,
          })
          nextSummary = Array.isArray(result?.summary) ? result.summary : []
          nextItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])
        } catch {
          const fallbackText = [headline.title, headline.teaser].filter(Boolean).join(". ")
          if (fallbackText) {
            try {
              const result = await callAi({
                task: "news",
                text: fallbackText,
                level: profileState.level || undefined,
                sourceLabel,
                targetLabel,
              })
              nextSummary = Array.isArray(result?.summary) ? result.summary : [fallbackText]
              nextItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])
            } catch {
              nextSummary = fallbackText ? [fallbackText] : []
              nextItems = []
            }
          }
        }
        if (!nextItems.length) continue
        const newsWorld = {
          ...buildWorldFromItems(nextItems, sourceLabel, targetLabel, ui),
          title: worldTitle,
          description: "Noticias del día.",
          news: {
            summary: nextSummary.length ? nextSummary : [headline.teaser || headline.title || ""].filter(Boolean),
            sourceUrl: headline.url,
            title: headline.title || "Noticia",
            category: categoryValue,
            date: baseDate,
            index: cachedList.length + worldsToSave.length,
          },
        }
        worldsToSave.push(newsWorld)
        existing.add(headline.url)
      }
      if (worldsToSave.length) {
        await saveNewsWorlds(worldsToSave)
      }
      const merged = [...cachedList, ...worldsToSave].slice(0, 5)
      setNewsWorlds(merged)
      saveLocalNewsCache(merged)
      if (!merged.length) {
        setError(ui.noNews)
      }
      return merged
    } finally {
      setIsLoading(false)
    }
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
      readNow: uiSettings?.news?.readNow ?? "Leer ahora",
      loadingDaily: uiSettings?.news?.loadingDaily ?? "Cargando el diario...",
      noNews: uiSettings?.news?.noNews ?? "No se encontraron noticias.",
      backLabel: uiSettings?.news?.backLabel ?? "Back",
      summaryTitle: uiSettings?.news?.summaryTitle ?? "Resumen",
      vocabTitle: uiSettings?.news?.vocabTitle ?? "Palabras aprendidas",
      sourceLabel: uiSettings?.news?.sourceLabel ?? "Fuente",
      categoryLabel: uiSettings?.news?.categoryLabel ?? "Categoría",
      categoryOptions: uiSettings?.news?.categoryOptions ?? {},
      nav: uiSettings?.nav ?? {},
      tutorial: {
        letsPlay: uiSettings?.tutorial?.letsPlay ?? "Let's Play",
      },
      generation: {
        meaningOf: uiSettings?.generation?.meaningOf ?? "Meaning of {source}.",
        exampleOf: uiSettings?.generation?.exampleOf ?? "Example: {source}.",
      },
      errors: {
        newsNoLink: uiSettings?.errors?.newsNoLink ?? "No link found.",
        newsNoWords: uiSettings?.errors?.newsNoWords ?? "No words found.",
        saveFailed: uiSettings?.errors?.saveFailed ?? "Save failed.",
      }
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
          setWorld(buildWorldFromItems(parsed.items, sourceLabel, targetLabel, ui))
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

    // 1. Total Seeds Sync
    if (typeof profileState.seeds === "number") {
      const storedSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
      const nextSeeds = Math.max(storedSeeds, profileState.seeds)
      window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
      setSeeds(nextSeeds)
    }

    // Always get fresh values for sync calls
    const currentSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const currentWeeklySeeds = Number(window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY) || "0") || 0

    // 2. Weekly Words Sync
    const serverWeekStart = profileState.weeklyWordsWeekStart || ""
    const localWeekStart = window.localStorage.getItem(WEEKLY_START_STORAGE_KEY)
    const localWords = Number(window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY) || "0") || 0

    if (serverWeekStart === weekStart && typeof profileState.weeklyWords === "number") {
      const nextWeeklyWords = Math.max(profileState.weeklyWords, localWords)
      window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, String(nextWeeklyWords))
      // NewsClient doesn't have setWordsLearned state

      if (nextWeeklyWords > profileState.weeklyWords) {
        syncStatsToServer(currentSeeds, currentWeeklySeeds, nextWeeklyWords, weekStart)
      }
    } else {
      if (localWeekStart !== weekStart) {
        window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStart)
        window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
        syncStatsToServer(currentSeeds, currentWeeklySeeds, 0, weekStart)
      } else {
        // Keep local
      }
    }

    // 3. Weekly Seeds Sync
    const serverSeedsWeekStart = profileState.weeklySeedsWeekStart || ""
    const localSeedsWeekStart = window.localStorage.getItem(WEEKLY_SEEDS_START_STORAGE_KEY)
    const localWeeklySeeds = Number(window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY) || "0") || 0
    const currentWeeklyWords = Number(window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY) || "0") || 0

    if (serverSeedsWeekStart === weekStart && typeof profileState.weeklySeeds === "number") {
      const nextWeeklySeeds = Math.max(profileState.weeklySeeds, localWeeklySeeds)
      window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(nextWeeklySeeds))

      if (nextWeeklySeeds > profileState.weeklySeeds) {
        syncStatsToServer(currentSeeds, nextWeeklySeeds, currentWeeklyWords, weekStart)
      }
    } else {
      if (localSeedsWeekStart !== weekStart) {
        window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
        window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
        syncStatsToServer(currentSeeds, 0, currentWeeklyWords, weekStart)
      }
    }
  }, [
    profileState.seeds,
    profileState.weeklyWords,
    profileState.weeklyWordsWeekStart,
    profileState.weeklySeeds,
    profileState.weeklySeedsWeekStart,
  ])

  useEffect(() => {
    const loadNewsWorlds = async () => {
      setIsLoadingHeadlines(true)
      setError(null)
      setNewsWorlds([])
      try {
        const list = await ensureDailyNewsList(category)
        if (list?.[0]?.news?.date) {
          setNewsDate(list[0].news!.date)
        }
      } catch {
        setNewsWorlds([])
      } finally {
        setIsLoadingHeadlines(false)
      }
    }
    loadNewsWorlds()
  }, [category])

  useEffect(() => {
    if (!autoPlay || autoStartedRef.current) return
    if (isLoadingHeadlines) return
    autoStartedRef.current = true
    setStep("loading")
    ensureDailyNewsList(category).then((list) => {
      const index = autoIndexRef.current ?? 0
      const clampedIndex = Math.min(Math.max(index, 0), Math.max(list.length - 1, 0))
      const selected = list[clampedIndex]
      if (selected) {
        startPlayFromWorld(selected)
      } else {
        setStep("input")
      }
    })
  }, [autoPlay, category, isLoadingHeadlines])

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
    const minMovesFactor = Number(pointsConfig?.minMovesFactor ?? 1.5)
    const firstMultiplier = 1.1
    const greatMultiplier = 1.3
    const pairs = Math.max(1, pairsCount || 1)
    const n = Math.max(1, moves)
    const minMoves = Math.max(1, Math.floor(pairs * minMovesFactor))
    const baseValue = Math.round(15 * (minMoves / n))
    const baseScore = Math.min(15, Math.max(1, baseValue))
    const greatScore = n <= minMoves

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
    const multiplier = (isNew ? firstMultiplier : 1) * (greatScore ? greatMultiplier : 1)
    const payout = Math.round(baseScore * multiplier)
    const newBest = Math.max(baseScore, sBest)
    bestMap[key] = newBest
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, JSON.stringify(bestMap))

    const storedSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const serverSeeds = profile.seeds || 0
    const currentSeeds = Math.max(storedSeeds, serverSeeds)
    const nextSeeds = currentSeeds + payout
    window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
    setSeeds(nextSeeds)

    const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
    const today = new Date().toISOString().slice(0, 10)

    let localDaily: { date: string; games: number; upload: boolean; news: boolean } | null = null
    if (rawDaily) {
      try {
        const parsed = JSON.parse(rawDaily)
        if (parsed?.date === today) {
          localDaily = parsed
        }
      } catch {
        // ignore
      }
    }

    const serverDaily = profile.dailyState && profile.dailyState.date === today ? profile.dailyState : null

    let dailyState = { date: today, games: 0, upload: false, news: false }
    if (localDaily || serverDaily) {
      dailyState = {
        date: today,
        games: Math.max(localDaily?.games ?? 0, serverDaily?.games ?? 0),
        upload: !!(localDaily?.upload || serverDaily?.upload),
        news: !!(localDaily?.news || serverDaily?.news),
      }
    }
    dailyState.games = Math.min(3, dailyState.games + 1)
    dailyState.news = true
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
    const existingWorld = await findExistingNewsWorldByUrl(finalUrl)
    if (existingWorld) {
      let needsSave = false
      const normalizedPool = (existingWorld.pool ?? []).map((pair) => {
        if (pair.srs) return pair
        needsSave = true
        return { ...pair, srs: { ...initializeSRS(), bucket: "hard" as const } }
      })
      const patchedWorld = { ...existingWorld, pool: normalizedPool }
      setWorld(patchedWorld)
      setSummary(Array.isArray(patchedWorld.news?.summary) ? patchedWorld.news!.summary : [])
      setItems(buildReviewItemsFromWorld(patchedWorld))
      setNewsTitle(patchedWorld.news?.title ?? patchedWorld.title ?? "")
      setNewsDate(patchedWorld.news?.date ?? newsDate)
      setStep("play")
      if (needsSave) {
        void saveNewsWorld(patchedWorld).catch(() => {})
      }
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
        ...buildWorldFromItems(nextItems, sourceLabel, targetLabel, ui),
        title: worldTitle,
        description: "Noticias del día.",
        news: {
          summary: nextSummary,
          sourceUrl: finalUrl,
          title: newsTitle || worldTitle,
          category,
          date: baseDate,
        },
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

  const cardWorlds = useMemo(() => {
    const base = newsWorlds.slice(0, 5)
    if (base.length >= 5) return base
    const placeholders = Array.from({ length: Math.max(0, 5 - base.length) }, (_, i) => ({
      id: `placeholder-${i}`,
      title: "",
      news: {
        summary: [],
        sourceUrl: "",
        title: "",
      },
    })) as VocabWorld[]
    return [...base, ...placeholders]
  }, [newsWorlds])

  return (
    <div className="min-h-screen bg-[#F6F2EB] text-[#3A3A3A] pb-24">
      <div className="sticky top-0 z-40">
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-[56px] bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-sm border-b border-[rgb(var(--vocado-divider-rgb)/0.2)]" />
          <div className="relative mx-auto w-full max-w-5xl px-4 sm:px-6 h-[56px] flex items-center justify-between">
            <div className="h-9 w-9" />
            <div className="text-center flex-1 leading-tight">
              <div className="text-xl font-semibold font-serif italic">{ui.title}</div>
              <div className="mt-0.5 text-[11px] text-[#3A3A3A]/60 font-serif italic">
                {formatNewsDateFull(newsDate || new Date().toISOString())}
              </div>
            </div>
            <div className="text-xs text-[#3A3A3A]/70">
              <span className="font-semibold">{seeds}</span> 🌱
            </div>
          </div>
        </div>
        <div className="h-3 bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)]" />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 space-y-6">
        {step === "loading" && (
          <div className="mt-8 flex items-center justify-center">
            <div className="rounded-2xl border border-[#3A3A3A]/5 bg-[#FAF7F2] px-6 py-4 text-sm text-[#3A3A3A]/60">
              {ui.loadingDaily}
            </div>
          </div>
        )}

        {step === "input" && (
          <div className="mt-2 space-y-4">
            <div className="flex items-center justify-center gap-2">
              {([
                { id: "world", label: ui.categoryOptions.world ?? "World" },
                { id: "wirtschaft", label: ui.categoryOptions.wirtschaft ?? "Economy" },
                { id: "sport", label: ui.categoryOptions.sport ?? "Sport" },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={[
                    "rounded-full px-4 py-1 text-[11px] font-medium border transition-colors",
                    category === item.id
                      ? "border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb)/0.2)] text-[#3A3A3A]"
                      : "border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/70",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {isLoadingHeadlines ? (
              <div className="text-sm text-[#3A3A3A]/60 text-center">{ui.loadingDaily}</div>
            ) : (
              <div className="space-y-4">
                {cardWorlds.map((headline) => {
                  const title = headline.news?.title || headline.title || ""
                  const teaser = Array.isArray(headline.news?.summary)
                    ? headline.news?.summary[0] ?? ""
                    : ""
                  const url = headline.news?.sourceUrl || ""
                  return (
                    <div
                      key={headline.id}
                      className="bg-[#FAF7F2] rounded-[24px] p-1 shadow-[0_4px_20px_-8px_rgba(58,58,58,0.03)] border border-[#3A3A3A]/5 overflow-hidden"
                    >
                      <div className="p-2.5 pt-2 flex flex-col h-[180px]">
                        <h3 className="font-serif text-[16px] leading-[1.2] text-[#3A3A3A] mb-4 text-center px-1 line-clamp-2 h-[40px] flex items-center justify-center">
                          {title}
                        </h3>
                        <div className="relative flex-1 overflow-hidden bg-[#EBE7DF] rounded-[12px] px-3 py-2 mb-2">
                          <p className="text-[11px] leading-relaxed text-[#5A5A5A] font-serif">
                            {teaser || title}
                          </p>
                          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#EBE7DF] to-transparent" />
                        </div>
                        <div className="relative flex items-center justify-center text-[#3A3A3A]/40 mt-auto h-8">
                          <button
                            type="button"
                            disabled={isLoading || !url}
                            onClick={() => {
                              if (isLoading) return
                              if (!url) return
                              startPlayFromWorld(headline)
                            }}
                            className="flex items-center gap-2 bg-[rgb(var(--vocado-accent-rgb))] hover:bg-[rgb(var(--vocado-accent-dark-rgb))] text-white px-4 py-[2px] rounded-full shadow-sm transition-all text-[12px] font-semibold disabled:opacity-50"
                          >
                            {ui.readNow}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {newsWorlds.length === 0 && (
                  <div className="text-sm text-[#3A3A3A]/60 text-center">
                    {ui.noNews}
                  </div>
                )}
              </div>
            )}
            {error && <div className="text-sm text-[#B45353] text-center">{error}</div>}
            {isLoading && (
              <div className="text-sm text-[#3A3A3A]/60 text-center">{ui.loading}</div>
            )}
          </div>
        )}

        {step === "play" && world && (
          <div className="space-y-4 mt-4">
            <div className="rounded-2xl border border-[#3A3A3A]/5 bg-[#FAF7F2] p-4 text-sm text-[#3A3A3A]/60">
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
                    dailyState.news = true
                    window.localStorage.setItem(
                      DAILY_STATE_STORAGE_KEY,
                      JSON.stringify(dailyState)
                    )
                  }

                  // 3. Mark specific news URL as read
                  if (newsUrl) {
                    const nextRead = new Set(readNewsUrls)
                    nextRead.add(newsUrl)
                    setReadNewsUrls(nextRead)
                    window.localStorage.setItem(
                      READ_NEWS_STORAGE_KEY,
                      JSON.stringify(Array.from(nextRead))
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
          <div className="grid gap-6 md:grid-cols-[1.4fr,1fr] mt-4">
            <div className="rounded-2xl border border-[#3A3A3A]/5 bg-[#FAF7F2] p-5">
              <div className="text-lg font-semibold">{ui.summaryTitle}</div>
              <div className="mt-3 space-y-2 text-sm text-[#3A3A3A]/70">
                {summary.map((line, index) => (
                  <div key={`${line}-${index}`} className="leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
              {newsUrl && (
                <div className="mt-4 text-xs text-[#3A3A3A]/50">
                  {ui.sourceLabel}: {newsUrl}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#3A3A3A]/5 bg-[#FAF7F2] p-5">
              <div className="text-lg font-semibold">{ui.vocabTitle}</div>
              {currentItem ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                      disabled={carouselIndex === 0}
                      className="rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-sm disabled:opacity-50"
                    >
                      ←
                    </button>
                    <div className="text-xs text-[#3A3A3A]/50">
                      {carouselIndex + 1}/{items.length}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCarouselIndex((i) => Math.min(items.length - 1, i + 1))
                      }
                      disabled={carouselIndex >= items.length - 1}
                      className="rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-sm disabled:opacity-50"
                    >
                      →
                    </button>
                  </div>
                  <div className="rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] p-4 text-center">
                    <div className="text-4xl">{currentItem.emoji ?? "📰"}</div>
                    <div className="mt-2 text-sm">
                      <span className="text-[#3A3A3A]/50">{sourceLabel}:</span>{" "}
                      <span className="font-semibold">{currentItem.source}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-[#3A3A3A]/50">{targetLabel}:</span>{" "}
                      <span className="font-semibold">{currentItem.target}</span>
                    </div>
                  </div>
                  {currentItem.explanation && (
                    <div className="text-xs text-[#3A3A3A]/70">{currentItem.explanation}</div>
                  )}
                  {currentItem.example && (
                    <div className="text-xs text-[#3A3A3A]/60">{currentItem.example}</div>
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
      <NavFooter labels={ui.nav} />
    </div>
  )
}
