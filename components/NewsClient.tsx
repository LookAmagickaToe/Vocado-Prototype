"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import UserMenu from "@/components/UserMenu"
import uiSettings from "@/data/ui/settings.json"
import type { VocabWorld } from "@/types/worlds"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"

const SEEDS_STORAGE_KEY = "vocado-seeds"
const NEWS_STORAGE_KEY = "vocado-news-current"
const DAILY_STATE_STORAGE_KEY = "vocado-daily-state"

type ProfileSettings = {
  level: string
  sourceLanguage: string
  targetLanguage: string
  newsCategory?: string
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
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [world, setWorld] = useState<VocabWorld | null>(null)

  const sourceLabel = profileState.sourceLanguage || "Español"
  const targetLabel = profileState.targetLanguage || "Alemán"

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
    []
  )

  useEffect(() => {
    if (typeof window === "undefined") return
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
  }, [sourceLabel, targetLabel])

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

  useEffect(() => {
    if (profile.newsCategory && profile.newsCategory !== category) {
      setCategory(profile.newsCategory)
    }
  }, [profile.newsCategory, category])

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

  const handleGenerate = async () => {
    setError(null)
    if (!newsUrl.trim()) {
      setError("Agrega un enlace válido.")
      return
    }
    setIsLoading(true)
    try {
      const result = await callAi({
        task: "news",
        url: newsUrl.trim(),
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
      setWorld(buildWorldFromItems(nextItems, sourceLabel, targetLabel))
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
                      handleGenerate()
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
                      window.localStorage.setItem(
                        SEEDS_STORAGE_KEY,
                        String(currentSeeds + 30)
                      )
                      window.localStorage.setItem(rewardKey, "1")
                      setSeeds(currentSeeds + 30)
                    }
                    dailyState.news = true
                    window.localStorage.setItem(
                      DAILY_STATE_STORAGE_KEY,
                      JSON.stringify(dailyState)
                    )
                  }
                }
                setStep("summary")
              }}
              primaryLabelOverride={`${sourceLabel}:`}
              secondaryLabelOverride={`${targetLabel}:`}
              nextLabelOverride={ui.readButton}
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
