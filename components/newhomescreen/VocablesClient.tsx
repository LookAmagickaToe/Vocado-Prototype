"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import type { VocabPair, VocabWorld } from "@/types/worlds"
import { getUiSettings } from "@/lib/ui-settings"
import { formatTemplate } from "@/lib/ui"
import AutoFitText from "@/components/ui/auto-fit-text"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"
import {
  calculateNextReview,
  countByBucket,
  countDueWords,
  getWordsByBucket,
  initializeSRS,
  selectDueWords,
} from "@/lib/srs"

// --- THEME CONSTANTS ---
const COLORS = {
  bg: "#F6F2EB",
  bgCard: "#FAF7F2",
  accent: "rgb(var(--vocado-accent-rgb))",
  text: "#3A3A3A",
}

const LAST_LOGIN_STORAGE_KEY = "vocado-last-login"
const VOCABLES_CACHE_PREFIX = "vocado-vocables-cache"

type SRSBucket = "new" | "hard" | "medium" | "easy"

type BucketInfo = {
  id: SRSBucket
  label: string
  count: number
  color: string
  emoji: string
}

type ProfileSettings = {
  level: string
  sourceLanguage: string
  targetLanguage: string
  newsCategory?: string
  seeds?: number
}

const SEEDS_STORAGE_KEY = "vocado-seeds"
const WEEKLY_SEEDS_STORAGE_KEY = "vocado-seeds-weekly"
const WEEKLY_SEEDS_START_STORAGE_KEY = "vocado-seeds-week-start"
const WEEKLY_WORDS_STORAGE_KEY = "vocado-words-weekly"

const getWeekStartIso = () => {
  const date = new Date()
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

type StoredWorld = {
  worldId: string
  title?: string
  listId?: string | null
  position?: number
  hidden?: boolean
  json: VocabWorld
}

type ReviewEntry = {
  worldId: string
  listId?: string | null
  position?: number
  pairIndex: number
  pair: VocabPair
  world: VocabWorld
}

export default function VocablesClient({ profile }: { profile: ProfileSettings }) {
  const searchParams = useSearchParams()
  const [worlds, setWorlds] = useState<StoredWorld[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [reviewQueue, setReviewQueue] = useState<ReviewEntry[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [activeReviewLabel, setActiveReviewLabel] = useState<string | null>(null)
  const [reviewMode, setReviewMode] = useState<"srs" | "memory">("srs")
  const [seedsValue, setSeedsValue] = useState(profile.seeds ?? 0)
  const [reviewSeedsEarned, setReviewSeedsEarned] = useState(0)
  const [memorySeedsEarned, setMemorySeedsEarned] = useState(0)
  const [memoryWorld, setMemoryWorld] = useState<VocabWorld | null>(null)
  const [memoryEntries, setMemoryEntries] = useState<ReviewEntry[]>([])
  const [memoryPairMap, setMemoryPairMap] = useState<Map<string, ReviewEntry>>(new Map())
  const [memoryAssigned, setMemoryAssigned] = useState<Set<string>>(new Set())

  const sourceLabel = profile.sourceLanguage || "Español"
  const targetLabel = profile.targetLanguage || "Alemán"

  const uiSettings = useMemo(
    () => getUiSettings(profile.sourceLanguage),
    [profile.sourceLanguage]
  )
  const ui = useMemo(
    () => ({
      title: uiSettings?.vocables?.title ?? "Vocables",
      backLabel: uiSettings?.vocables?.backLabel ?? "Back",
      loading: uiSettings?.vocables?.loading ?? "Loading...",
      difficultyHard: uiSettings?.vocables?.difficultyHard ?? "Hard",
      difficultyMedium: uiSettings?.vocables?.difficultyMedium ?? "Medium",
      difficultyEasy: uiSettings?.vocables?.difficultyEasy ?? "Easy",
      newWordsLabel: uiSettings?.vocables?.newWordsLabel ?? "New words",
      dueLabel: uiSettings?.vocables?.dueLabel ?? "Due",
      dueTitle: uiSettings?.vocables?.dueTitle ?? "Words to review",
      startReview: uiSettings?.vocables?.startReview ?? "Start review",
      totalLabel: uiSettings?.vocables?.totalLabel ?? "Total: {count} words",
      categoriesLabel: uiSettings?.vocables?.categoriesLabel ?? "{count} categories",
      bucketSectionTitle: uiSettings?.vocables?.bucketSectionTitle ?? "By difficulty",
      bucketCountLabel: uiSettings?.vocables?.bucketCountLabel ?? "{count} words",
      tipTitle: uiSettings?.vocables?.tipTitle ?? "Tip",
      tipBody: uiSettings?.vocables?.tipBody ??
        "Review hard words more often. The system adapts intervals automatically to your progress.",
      reviewModeLabel: uiSettings?.vocables?.reviewModeLabel ?? "Review mode",
      reviewModeSrs: uiSettings?.vocables?.reviewModeSrs ?? "Review",
      reviewModeMemory: uiSettings?.vocables?.reviewModeMemory ?? "Memory",
      menuLabel: uiSettings?.vocables?.menuLabel ?? "Menu",
      continueLabel: uiSettings?.vocables?.continueLabel ?? "Continue",
      nav: uiSettings?.nav ?? {},
    }),
    [uiSettings]
  )

  const cacheKey = useMemo(
    () => `${VOCABLES_CACHE_PREFIX}:${sourceLabel}:${targetLabel}`,
    [sourceLabel, targetLabel]
  )

  useEffect(() => {
    const load = async () => {
      const perfEnabled =
        typeof window !== "undefined" &&
        window.localStorage.getItem("vocado-debug-perf") === "1"
      const perfStart = perfEnabled ? performance.now() : 0
      const logPerf = (label: string, extra?: Record<string, unknown>) => {
        if (!perfEnabled) return
        const elapsed = Math.round(performance.now() - perfStart)
        console.log(`[perf][vocables] ${label} (${elapsed}ms)`, extra || "")
      }
      setIsLoading(true)
      setLoadError(null)
      if (typeof window !== "undefined") {
        try {
          const rawCache = window.localStorage.getItem(cacheKey)
          if (rawCache) {
            const parsed = JSON.parse(rawCache)
            const cachedWorlds = Array.isArray(parsed?.worlds) ? parsed.worlds : []
            const lastLogin = Number(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY) || "0")
            if (cachedWorlds.length && (!lastLogin || parsed?.lastLogin === lastLogin)) {
              setWorlds(cachedWorlds)
              setIsLoading(false)
              logPerf("cache hit", { worlds: cachedWorlds.length })
              return
            }
          }
        } catch {
          // ignore cache errors
        }
      }
      try {
        const sessionStart = perfEnabled ? performance.now() : 0
        const session = await supabase.auth.getSession()
        if (perfEnabled) {
          console.log("[perf][vocables] session", Math.round(performance.now() - sessionStart) + "ms")
        }
        const token = session.data.session?.access_token
        if (!token) {
          setLoadError("Missing session.")
          setIsLoading(false)
          return
        }

        const fetchStart = perfEnabled ? performance.now() : 0
        const response = await fetch("/api/storage/worlds/list", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        })
        if (perfEnabled) {
          console.log("[perf][vocables] fetch /worlds/list", Math.round(performance.now() - fetchStart) + "ms")
        }
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error ?? "Load failed")
        }
        const parseStart = perfEnabled ? performance.now() : 0
        const data = await response.json()
        if (perfEnabled) {
          console.log("[perf][vocables] parse json", Math.round(performance.now() - parseStart) + "ms")
        }
        const loaded: StoredWorld[] = (data?.worlds || [])
          .map((item: any) => {
            const json = item?.json
            if (!json || json.mode !== "vocab") return null
            if (json.submode === "conjugation") return null
            const normalized = { ...json, id: item.worldId } as VocabWorld
            if (item.title) normalized.title = item.title
            const pool = Array.isArray(normalized.pool) ? normalized.pool : []
            normalized.pool = pool.map((pair) => ({
              ...pair,
              srs: pair.srs ?? initializeSRS(),
            }))
            return {
              worldId: item.worldId,
              title: item.title,
              listId: item.listId ?? null,
              position: item.position ?? 0,
              hidden: item.hidden ?? false,
              json: normalized,
            }
          })
          .filter(Boolean)
        setWorlds(loaded)
        logPerf("loaded", { worlds: loaded.length })
        if (typeof window !== "undefined") {
          try {
            const lastLogin = Number(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY) || "0") || Date.now()
            window.localStorage.setItem(
              cacheKey,
              JSON.stringify({ lastLogin, worlds: loaded })
            )
          } catch {
            // ignore cache failures
          }
        }
      } catch (err) {
        setLoadError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [cacheKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isLoading) return
    try {
      const lastLogin = Number(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY) || "0") || Date.now()
      window.localStorage.setItem(cacheKey, JSON.stringify({ lastLogin, worlds }))
    } catch {
      // ignore cache failures
    }
  }, [cacheKey, isLoading, worlds])

  useEffect(() => {
    if (typeof window === "undefined") return
    const storedSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    setSeedsValue(Math.max(profile.seeds ?? 0, storedSeeds))
  }, [profile.seeds])

  const allPairs = useMemo(() => {
    const entries: ReviewEntry[] = []
    const seen = new Map<string, ReviewEntry>()
    const getBucketScore = (bucket: SRSBucket) => {
      if (bucket === "easy") return 3
      if (bucket === "medium") return 2
      if (bucket === "hard") return 1
      return 0
    }
    for (const stored of worlds) {
      const world = stored.json
      world.pool.forEach((pair, index) => {
        const source = pair.es?.trim().toLowerCase()
        const target = pair.de?.trim().toLowerCase()
        const key = `${source}::${target}`
        const bucket = (pair.srs?.bucket ?? "new") as SRSBucket
        const entry: ReviewEntry = {
          worldId: stored.worldId,
          listId: stored.listId,
          position: stored.position,
          pairIndex: index,
          pair,
          world,
        }
        if (!seen.has(key)) {
          seen.set(key, entry)
        } else {
          const existing = seen.get(key)!
          const existingBucket = (existing.pair.srs?.bucket ?? "new") as SRSBucket
          if (getBucketScore(bucket) > getBucketScore(existingBucket)) {
            seen.set(key, entry)
          }
        }
      })
    }
    seen.forEach((entry) => entries.push(entry))
    return entries
  }, [worlds])

  useEffect(() => {
    if (!searchParams) return
    const bucket = searchParams.get("bucket") as SRSBucket | null
    if (bucket === "hard" || bucket === "new" || bucket === "medium" || bucket === "easy") {
      handleBucketClick(bucket)
    }
  }, [searchParams, allPairs])

  const entryByPair = useMemo(() => {
    return new Map(allPairs.map((entry) => [entry.pair, entry]))
  }, [allPairs])

  const bucketCounts = useMemo(() => {
    const words = allPairs.map((entry) => entry.pair)
    return countByBucket(words)
  }, [allPairs])

  const dueCount = useMemo(() => {
    const words = allPairs.map((entry) => entry.pair)
    return countDueWords(words)
  }, [allPairs])

  const buckets: BucketInfo[] = [
    { id: "new", label: ui.newWordsLabel, count: bucketCounts.new ?? 0, color: "#EFE9DF", emoji: "" },
    { id: "hard", label: ui.difficultyHard, count: bucketCounts.hard ?? 0, color: "#F4E6E3", emoji: "" },
    { id: "medium", label: ui.difficultyMedium, count: bucketCounts.medium ?? 0, color: "#F6F0E1", emoji: "" },
    { id: "easy", label: ui.difficultyEasy, count: bucketCounts.easy ?? 0, color: "#E9F2E7", emoji: "" },
  ]

  const totalWords = buckets.reduce((sum, b) => sum + b.count, 0)

  const startReview = (entries: ReviewEntry[], label: string) => {
    if (!entries.length) {
      setReviewQueue([])
      setReviewIndex(0)
      setShowBack(false)
      setActiveReviewLabel(null)
      return
    }
    setMemoryWorld(null)
    setMemoryEntries([])
    setMemoryPairMap(new Map())
    setMemoryAssigned(new Set())
    setReviewSeedsEarned(0)
    setReviewQueue(entries)
    setReviewIndex(0)
    setShowBack(false)
    setActiveReviewLabel(label)
  }

  const startMemoryReview = (entries: ReviewEntry[], label: string) => {
    if (!entries.length) {
      setMemoryWorld(null)
      setMemoryEntries([])
      setMemoryPairMap(new Map())
      setMemoryAssigned(new Set())
      setActiveReviewLabel(null)
      return
    }
    const worldId = `review-memory-${Date.now()}`
    const pool = entries.map((entry, index) => ({
      id: `${worldId}-${index}`,
      es: entry.pair.es,
      de: entry.pair.de,
      image: entry.pair.image ?? { type: "emoji", value: "🃏" },
      pos: entry.pair.pos ?? "other",
      explanation: entry.pair.explanation,
      example: entry.pair.example,
    }))
    setMemoryWorld({
      id: worldId,
      title: ui.reviewModeMemory,
      description: ui.reviewModeMemory,
      mode: "vocab",
      pool,
      chunking: { itemsPerGame: 8 },
      source_language: sourceLabel,
      target_language: targetLabel,
    })
    setMemoryEntries(entries)
    const map = new Map<string, ReviewEntry>()
    entries.forEach((entry, index) => {
      map.set(`${worldId}-${index}`, entry)
    })
    setMemoryPairMap(map)
    setMemoryAssigned(new Set())
    setMemorySeedsEarned(0)
    setActiveReviewLabel(label)
  }

  const persistWorldByMeta = async (
    world: VocabWorld,
    listId?: string | null,
    position?: number
  ) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return
    const response = await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: [world],
        listId: listId ?? null,
        positions: { [world.id]: position ?? 0 },
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Save failed")
    }
  }

  const handleBucketClick = (bucketId: SRSBucket) => {
    const words = allPairs
      .filter((entry) => (entry.pair.srs?.bucket ?? "new") === bucketId)
      .map((entry) => entry.pair)
    const sorted = getWordsByBucket(words, bucketId)
    const queue = sorted
      .map((pair) => entryByPair.get(pair))
      .filter((entry): entry is ReviewEntry => Boolean(entry))
    const label = buckets.find((b) => b.id === bucketId)?.label ?? ""
    if (reviewMode === "memory") {
      startMemoryReview(queue, label)
    } else {
      startReview(queue, label)
    }
  }

  const handleReviewAll = () => {
    const words = allPairs.map((entry) => entry.pair)
    const due = selectDueWords(words, 50)
    const queue = due
      .map((pair) => entryByPair.get(pair))
      .filter((entry): entry is ReviewEntry => Boolean(entry))
    if (reviewMode === "memory") {
      startMemoryReview(queue, ui.dueLabel)
    } else {
      startReview(queue, ui.dueLabel)
    }
  }

  const currentEntry = reviewQueue[reviewIndex]

  const syncStatsToServer = async (
    nextSeeds: number,
    nextWeeklySeeds: number,
    nextWeeklyWords: number,
    weekStart: string
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
        }),
      })
    } catch {
      // ignore sync errors
    }
  }

  const awardReviewSeed = (earned: number, setEarned: React.Dispatch<React.SetStateAction<number>>) => {
    if (typeof window === "undefined") return
    // if (earned >= 15) return // Limit removed per request
    const storedSeeds = Number(window.localStorage.getItem(SEEDS_STORAGE_KEY) || "0") || 0
    const currentSeeds = Math.max(storedSeeds, profile.seeds ?? 0)
    const nextSeeds = currentSeeds + 1
    window.localStorage.setItem(SEEDS_STORAGE_KEY, String(nextSeeds))
    setSeedsValue(nextSeeds)

    const weekStart = getWeekStartIso()
    const storedSeedsWeekStart = window.localStorage.getItem(WEEKLY_SEEDS_START_STORAGE_KEY)
    if (storedSeedsWeekStart !== weekStart) {
      window.localStorage.setItem(WEEKLY_SEEDS_START_STORAGE_KEY, weekStart)
      window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, "0")
    }
    const rawWeeklySeeds = window.localStorage.getItem(WEEKLY_SEEDS_STORAGE_KEY)
    let weeklySeeds = Number(rawWeeklySeeds || "0") || 0
    weeklySeeds += 1
    window.localStorage.setItem(WEEKLY_SEEDS_STORAGE_KEY, String(weeklySeeds))
    const weeklyWords = Number(window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY) || "0") || 0
    void syncStatsToServer(nextSeeds, weeklySeeds, weeklyWords, weekStart)
    setEarned((prev) => prev + 1)
  }

  /* 
   * Queue for sequential persistence to avoid race conditions.
   * stored as a ref to persist across renders
   */
  const saveQueue = useMemo(() => {
    let p = Promise.resolve()
    return {
      add: (fn: () => Promise<void>) => {
        p = p.then(fn).catch(err => console.error("Save queue error:", err))
      }
    }
  }, [])

  const persistWorld = async (entry: ReviewEntry, worldToSave: VocabWorld) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return
    const response = await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: [worldToSave],
        listId: entry.listId ?? null,
        positions: { [entry.worldId]: entry.position ?? 0 },
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Save failed")
    }
  }

  const rateCurrent = (rating: "easy" | "medium" | "difficult") => {
    if (!currentEntry) return

    // BUG FIX: Retrieve the LATEST version of the world from state, 
    // because currentEntry.world is a stale snapshot from when review started.
    const latestStored = worlds.find(w => w.worldId === currentEntry.worldId)
    const baseWorld = latestStored?.json ?? currentEntry.world

    const nextSrs = calculateNextReview(currentEntry.pair.srs, rating)

    const updatedWorld: VocabWorld = {
      ...baseWorld,
      pool: baseWorld.pool.map((pair, index) =>
        index === currentEntry.pairIndex ? { ...pair, srs: nextSrs } : pair
      ),
    }

    setWorlds((prev) =>
      prev.map((world) =>
        world.worldId === currentEntry.worldId ? { ...world, json: updatedWorld } : world
      )
    )
    awardReviewSeed(reviewSeedsEarned, setReviewSeedsEarned)

    const nextIndex = reviewIndex + 1
    if (nextIndex >= reviewQueue.length) {
      setReviewQueue([])
      setActiveReviewLabel(null)
      setReviewIndex(0)
      setShowBack(false)
      saveQueue.add(() => persistWorld({ ...currentEntry }, updatedWorld))
      return
    }
    setReviewIndex(nextIndex)
    setShowBack(false)
    saveQueue.add(() => persistWorld({ ...currentEntry }, updatedWorld))
  }

  return (
    <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
      <div className="sticky top-0 z-40 bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-sm border-b border-[rgb(var(--vocado-divider-rgb)/0.2)] h-[56px] flex items-center justify-between px-5">
        {reviewQueue.length > 0 || memoryWorld ? (
          <button
            type="button"
            onClick={() => {
              setMemoryWorld(null)
              setMemoryEntries([])
              setReviewQueue([])
              setReviewIndex(0)
              setShowBack(false)
              setActiveReviewLabel(null)
            }}
            className="h-9 w-9 rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] text-[#3A3A3A] flex items-center justify-center"
            aria-label={ui.backLabel}
          >
            ←
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
        <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">
          {seedsValue} 🌱
        </span>
      </div>

      {isLoading ? (
        <div className="px-4 pt-16 flex flex-col items-center text-[#3A3A3A]/70">
          <img
            src="/mascot/happy_vocado.png"
            alt="Vocado"
            className="h-24 w-24 object-contain"
          />
          <div className="mt-3 text-sm">{ui.loading}</div>
        </div>
      ) : loadError ? (
        <div className="px-4 pt-8 text-[12px] text-[#B45353]">{loadError}</div>
      ) : memoryWorld ? (
        <div className="px-4 pt-6 pb-24">
          <div className="mb-3 text-[12px] text-[#3A3A3A]/50 text-center">
            {activeReviewLabel ? `${activeReviewLabel} • ` : ""}
            {formatTemplate(ui.bucketCountLabel, { count: String(memoryEntries.length) })}
          </div>
          <VocabMemoryGame
            key={memoryWorld.id}
            world={memoryWorld}
            levelIndex={0}
            onWin={() => { }}
            onNextLevel={() => {
              if (!memoryEntries.length) {
                setMemoryWorld(null)
                setMemoryEntries([])
                setMemoryPairMap(new Map())
                setMemoryAssigned(new Set())
                return
              }
              const label = activeReviewLabel ?? ui.reviewModeMemory
              const queue = [...memoryEntries]
              setMemoryWorld(null)
              setMemoryEntries([])
              setMemoryPairMap(new Map())
              setMemoryAssigned(new Set())
              startReview(queue, label)
            }}
            nextLabelOverride={ui.reviewModeSrs}
            renderWinActions={({ matchedOrder, carouselIndex, setCarouselIndex, carouselItem, closeWin }) => {
              if (!matchedOrder.length || !carouselItem) return null
              const isAssigned = memoryAssigned.has(carouselItem.id)
              const allAssigned = memoryAssigned.size >= matchedOrder.length
              const handleAssign = (rating: "easy" | "medium" | "difficult") => {
                const entry = memoryPairMap.get(carouselItem.id)
                if (!entry) return
                const nextSrs = calculateNextReview(entry.pair.srs, rating)
                const updatedWorld: VocabWorld = {
                  ...entry.world,
                  pool: entry.world.pool.map((pair, index) =>
                    index === entry.pairIndex ? { ...pair, srs: nextSrs } : pair
                  ),
                }
                setWorlds((prev) =>
                  prev.map((stored) =>
                    stored.worldId === entry.worldId ? { ...stored, json: updatedWorld } : stored
                  )
                )
                awardReviewSeed(memorySeedsEarned, setMemorySeedsEarned)
                const nextAssigned = new Set(memoryAssigned)
                nextAssigned.add(carouselItem.id)
                setMemoryAssigned(nextAssigned)
                const handleAssign = (rating: "easy" | "medium" | "difficult") => {
                  const entry = memoryPairMap.get(carouselItem.id)
                  if (!entry) return

                  // BUG FIX: Use latest world state
                  const latestStored = worlds.find(w => w.worldId === entry.worldId)
                  const baseWorld = latestStored?.json ?? entry.world

                  const nextSrs = calculateNextReview(entry.pair.srs, rating)
                  const updatedWorld: VocabWorld = {
                    ...baseWorld,
                    pool: baseWorld.pool.map((pair, index) =>
                      index === entry.pairIndex ? { ...pair, srs: nextSrs } : pair
                    ),
                  }
                  setWorlds((prev) =>
                    prev.map((stored) =>
                      stored.worldId === entry.worldId ? { ...stored, json: updatedWorld } : stored
                    )
                  )
                  awardReviewSeed(memorySeedsEarned, setMemorySeedsEarned)
                  const nextAssigned = new Set(memoryAssigned)
                  nextAssigned.add(carouselItem.id)
                  setMemoryAssigned(nextAssigned)
                  // Use saveQueue or direct call? Since handleAssign is user interaction, queue is safer.
                  // But we didn't expose saveQueue to this scope. We should probably move saveQueue up or duplicate.
                  // For now, let's keep it simple and just use local atomic save, relying on the fact that memory game 
                  // might not be as rapid-fire as SRS, but ideally we use the queue.
                  // Re-using persistWorld defined above which now takes (entry, world).
                  saveQueue.add(() => persistWorld({ ...entry }, updatedWorld))

                  if (matchedOrder.length > 1) {
                    let nextIndex = carouselIndex
                    for (let i = 1; i <= matchedOrder.length; i += 1) {
                      const idx = (carouselIndex + i) % matchedOrder.length
                      if (!nextAssigned.has(matchedOrder[idx])) {
                        nextIndex = idx
                        break
                      }
                    }
                    setCarouselIndex(nextIndex)
                  }
                }
              }

              if (allAssigned) {
                const hasRemaining = dueCount > 0
                return (
                  <div className="grid grid-cols-3 items-center gap-3">
                    <div />
                    <button
                      type="button"
                      onClick={() => {
                        closeWin()
                        setMemoryWorld(null)
                        setMemoryEntries([])
                        setMemoryPairMap(new Map())
                        setMemoryAssigned(new Set())
                        setActiveReviewLabel(null)
                      }}
                      className="justify-self-center rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] px-4 py-2 text-sm text-[#3A3A3A]"
                    >
                      {ui.menuLabel}
                    </button>
                    {hasRemaining ? (
                      <button
                        type="button"
                        onClick={() => {
                          closeWin()
                          const words = allPairs.map((entry) => entry.pair)
                          const due = selectDueWords(words, 50)
                          const queue = due
                            .map((pair) => entryByPair.get(pair))
                            .filter((entry): entry is ReviewEntry => Boolean(entry))
                          startMemoryReview(queue, ui.dueLabel)
                        }}
                        className="justify-self-end rounded-full bg-[rgb(var(--vocado-accent-rgb))] px-4 py-2 text-sm font-medium text-white"
                      >
                        {ui.continueLabel}
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                )
              }

              return (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleAssign("difficult")}
                    className="flex-1 rounded-full border border-[#3A3A3A]/10 bg-[#F4E6E3] px-3 py-2 text-xs text-[#3A3A3A]"
                  >
                    {ui.difficultyHard}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAssign("medium")}
                    className="flex-1 rounded-full border border-[#3A3A3A]/10 bg-[#F6F0E1] px-3 py-2 text-xs text-[#3A3A3A]"
                  >
                    {ui.difficultyMedium}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAssign("easy")}
                    className="flex-1 rounded-full border border-[#3A3A3A]/10 bg-[#E9F2E7] px-3 py-2 text-xs text-[#3A3A3A]"
                  >
                    {ui.difficultyEasy}
                  </button>
                </div>
              )
            }}
          />
        </div>
      ) : reviewQueue.length > 0 && currentEntry ? (
        <div
          className="px-4 pt-6 pb-6 space-y-4 min-h-[calc(100vh-60px)] outline-none"
          onClick={() => setShowBack((prev) => !prev)}
        >
          <div className="text-[12px] text-[#3A3A3A]/50 text-center">
            {activeReviewLabel ? `${activeReviewLabel} • ` : ""}{reviewIndex + 1}/{reviewQueue.length}
          </div>

          <div
            className="w-full rounded-2xl border border-[#3A3A3A]/10 bg-[#FAF7F2] p-6 shadow-sm text-left select-none pointer-events-none"
          >
            {!showBack ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-[#3A3A3A]/40">{sourceLabel}</div>
                <div className="h-[64px]">
                  <AutoFitText
                    text={currentEntry.pair.es}
                    maxPx={24}
                    minPx={9}
                    lineHeight={1.05}
                    className="h-full w-full font-semibold text-[#3A3A3A] whitespace-nowrap"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#3A3A3A]/40">{sourceLabel}</div>
                  <div className="h-[48px]">
                    <AutoFitText
                      text={currentEntry.pair.es}
                      maxPx={18}
                      minPx={9}
                      lineHeight={1.05}
                      className="h-full w-full font-semibold text-[#3A3A3A] whitespace-nowrap"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#3A3A3A]/40">{targetLabel}</div>
                  <div className="h-[48px]">
                    <AutoFitText
                      text={currentEntry.pair.de}
                      maxPx={18}
                      minPx={9}
                      lineHeight={1.05}
                      className="h-full w-full font-semibold text-[#3A3A3A] whitespace-nowrap"
                    />
                  </div>
                </div>
                {currentEntry.pair.explanation && (
                  <div className="text-[12px] text-[#3A3A3A]/70">{currentEntry.pair.explanation}</div>
                )}
                {currentEntry.pair.example && (
                  <div className="text-[12px] text-[#3A3A3A]/60">{currentEntry.pair.example}</div>
                )}
                {currentEntry.pair.conjugation?.sections?.length ? (
                  <div className="space-y-2">
                    {currentEntry.pair.conjugation.translation && (
                      <div className="text-[11px] text-[#3A3A3A]/60">
                        {currentEntry.pair.conjugation.translation}
                      </div>
                    )}
                    {currentEntry.pair.conjugation.sections.map((section) => (
                      <div key={section.title} className="text-[11px] text-[#3A3A3A]/70">
                        <div className="font-medium text-[#3A3A3A]/80">{section.title}</div>
                        <div className="mt-1 space-y-1">
                          {section.rows.map((row, idx) => (
                            <div key={`${section.title}-${idx}`} className="flex justify-between gap-4">
                              <span>{row[0]}</span>
                              <span>{row[1]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="fixed bottom-[72px] left-0 right-0 px-4">
            <div className="mx-auto max-w-md grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); rateCurrent("difficult") }}
                className="rounded-xl border border-[#3A3A3A]/10 bg-[#F4E6E3] py-2 text-[12px] font-medium text-[#3A3A3A]"
              >
                {ui.difficultyHard}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); rateCurrent("medium") }}
                className="rounded-xl border border-[#3A3A3A]/10 bg-[#F6F0E1] py-2 text-[12px] font-medium text-[#3A3A3A]"
              >
                {ui.difficultyMedium}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); rateCurrent("easy") }}
                className="rounded-xl border border-[#3A3A3A]/10 bg-[#E9F2E7] py-2 text-[12px] font-medium text-[#3A3A3A]"
              >
                {ui.difficultyEasy}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Overview */}
          <div className="px-4 pt-6">
            <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[24px] font-bold text-[#3A3A3A]">{dueCount}</div>
                  <div className="text-[12px] text-[#3A3A3A]/50">{ui.dueTitle}</div>
                </div>
                <button
                  onClick={handleReviewAll}
                  disabled={dueCount === 0}
                  className="px-5 py-2.5 rounded-xl bg-[rgb(var(--vocado-accent-rgb))] text-white text-[14px] font-medium disabled:opacity-50 hover:bg-[rgb(var(--vocado-accent-dark-rgb))] transition-colors"
                >
                  {ui.startReview}
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-[#3A3A3A]/5 flex items-center justify-between text-[12px] text-[#3A3A3A]/50">
                <span>{formatTemplate(ui.totalLabel, { count: String(totalWords) })}</span>
                <span>{formatTemplate(ui.categoriesLabel, { count: "3" })}</span>
              </div>
            </div>
          </div>

          {/* SRS Buckets */}
          <div className="px-4 pt-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-[13px] font-medium text-[#3A3A3A]/60">{ui.bucketSectionTitle}</h2>
              <button
                type="button"
                onClick={() => setReviewMode((prev) => (prev === "srs" ? "memory" : "srs"))}
                className="flex items-center gap-2 rounded-full border border-[#3A3A3A]/10 bg-[#FAF7F2] px-2 py-1 text-[10px] text-[#3A3A3A]/70"
              >
                <span>{ui.reviewModeLabel}</span>
                <span className="rounded-full bg-[#EAE8E0] px-2 py-0.5 text-[10px] text-[#3A3A3A]">
                  {reviewMode === "srs" ? ui.reviewModeSrs : ui.reviewModeMemory}
                </span>
              </button>
            </div>
            <div className="space-y-3">
              {buckets.map((bucket) => (
                <motion.button
                  key={bucket.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleBucketClick(bucket.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-[#3A3A3A]/5 shadow-sm text-left transition-colors"
                  style={{ backgroundColor: bucket.color }}
                >
                  <div className="flex-1">
                    <div className="text-[15px] font-medium text-[#3A3A3A]">{bucket.label}</div>
                    <div className="text-[12px] text-[#3A3A3A]/50">
                      {formatTemplate(ui.bucketCountLabel, { count: String(bucket.count) })}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="px-4 pt-6">
            <div className="bg-[#E3EBC5]/30 rounded-2xl border border-[rgb(var(--vocado-accent-rgb)/0.2)] p-4">
              <div className="text-[13px] font-medium text-[#3A3A3A] mb-1">💡 {ui.tipTitle}</div>
              <div className="text-[12px] text-[#3A3A3A]/70 leading-relaxed">
                {ui.tipBody}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Navigation Footer */}
      <NavFooter labels={ui.nav} />
    </div>
  )
}
