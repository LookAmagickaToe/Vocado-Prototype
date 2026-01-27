"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import type { VocabPair, VocabWorld } from "@/types/worlds"
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
  accent: "#9FB58E",
  text: "#3A3A3A",
}

type SRSBucket = "hard" | "medium" | "easy"

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
  const [worlds, setWorlds] = useState<StoredWorld[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [reviewQueue, setReviewQueue] = useState<ReviewEntry[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [activeReviewLabel, setActiveReviewLabel] = useState<string | null>(null)

  const sourceLabel = profile.sourceLanguage || "Español"
  const targetLabel = profile.targetLanguage || "Alemán"

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) {
          setLoadError("Missing session.")
          setIsLoading(false)
          return
        }

        const response = await fetch("/api/storage/worlds/list", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.error ?? "Load failed")
        }
        const data = await response.json()
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
      } catch (err) {
        setLoadError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const allPairs = useMemo(() => {
    const entries: ReviewEntry[] = []
    for (const stored of worlds) {
      const world = stored.json
      world.pool.forEach((pair, index) => {
        entries.push({
          worldId: stored.worldId,
          listId: stored.listId,
          position: stored.position,
          pairIndex: index,
          pair,
          world,
        })
      })
    }
    return entries
  }, [worlds])

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
    { id: "hard", label: "Schwer", count: bucketCounts.hard ?? 0, color: "#E57373", emoji: "🔴" },
    { id: "medium", label: "Mittel", count: bucketCounts.medium ?? 0, color: "#FFB74D", emoji: "🟡" },
    { id: "easy", label: "Leicht", count: bucketCounts.easy ?? 0, color: "#81C784", emoji: "🟢" },
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
    setReviewQueue(entries)
    setReviewIndex(0)
    setShowBack(false)
    setActiveReviewLabel(label)
  }

  const handleBucketClick = (bucketId: SRSBucket) => {
    const words = allPairs
      .filter((entry) => (entry.pair.srs?.bucket ?? "medium") === bucketId)
      .map((entry) => entry.pair)
    const sorted = getWordsByBucket(words, bucketId)
    const queue = sorted
      .map((pair) => entryByPair.get(pair))
      .filter((entry): entry is ReviewEntry => Boolean(entry))
    startReview(queue, buckets.find((b) => b.id === bucketId)?.label ?? "")
  }

  const handleReviewAll = () => {
    const words = allPairs.map((entry) => entry.pair)
    const due = selectDueWords(words, 50)
    const queue = due
      .map((pair) => entryByPair.get(pair))
      .filter((entry): entry is ReviewEntry => Boolean(entry))
    startReview(queue, "Fällig")
  }

  const currentEntry = reviewQueue[reviewIndex]

  const persistWorld = async (entry: ReviewEntry) => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) return
    const response = await fetch("/api/storage/worlds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        worlds: [entry.world],
        listId: entry.listId ?? null,
        positions: { [entry.worldId]: entry.position ?? 0 },
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? "Save failed")
    }
  }

  const rateCurrent = async (rating: "easy" | "medium" | "difficult") => {
    if (!currentEntry) return
    const nextSrs = calculateNextReview(currentEntry.pair.srs, rating)

    const updatedWorld: VocabWorld = {
      ...currentEntry.world,
      pool: currentEntry.world.pool.map((pair, index) =>
        index === currentEntry.pairIndex ? { ...pair, srs: nextSrs } : pair
      ),
    }

    setWorlds((prev) =>
      prev.map((world) =>
        world.worldId === currentEntry.worldId ? { ...world, json: updatedWorld } : world
      )
    )

    try {
      await persistWorld({ ...currentEntry, world: updatedWorld })
    } catch {
      // ignore save failures for now
    }

    const nextIndex = reviewIndex + 1
    if (nextIndex >= reviewQueue.length) {
      setReviewQueue([])
      setActiveReviewLabel(null)
      setReviewIndex(0)
      setShowBack(false)
      return
    }
    setReviewIndex(nextIndex)
    setShowBack(false)
  }

  return (
    <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
      {/* Header */}
      <header className="px-5 py-4 sticky top-0 bg-[#FAF7F2]/95 backdrop-blur-sm z-40 border-b border-[#3A3A3A]/5">
        <h1 className="text-[18px] font-semibold text-center">Vokabeln</h1>
      </header>

      {isLoading ? (
        <div className="px-4 pt-8 text-[13px] text-[#3A3A3A]/60">Lädt...</div>
      ) : loadError ? (
        <div className="px-4 pt-8 text-[12px] text-[#B45353]">{loadError}</div>
      ) : reviewQueue.length > 0 && currentEntry ? (
        <div className="px-4 pt-6 pb-6 space-y-4">
          <div className="text-[12px] text-[#3A3A3A]/50 text-center">
            {activeReviewLabel ? `${activeReviewLabel} • ` : ""}{reviewIndex + 1}/{reviewQueue.length}
          </div>

          <button
            type="button"
            onClick={() => setShowBack((prev) => !prev)}
            className="w-full rounded-2xl border border-[#3A3A3A]/10 bg-[#FAF7F2] p-6 shadow-sm text-left"
          >
            {!showBack ? (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-[#3A3A3A]/40">{sourceLabel}</div>
                <div className="text-[24px] font-semibold text-[#3A3A3A]">
                  {currentEntry.pair.es}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#3A3A3A]/40">{sourceLabel}</div>
                  <div className="text-[18px] font-semibold text-[#3A3A3A]">
                    {currentEntry.pair.es}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[#3A3A3A]/40">{targetLabel}</div>
                  <div className="text-[18px] font-semibold text-[#3A3A3A]">
                    {currentEntry.pair.de}
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
          </button>

          <div className="fixed bottom-[72px] left-0 right-0 px-4">
            <div className="mx-auto max-w-md grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => rateCurrent("difficult")}
                className="rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] py-2 text-[12px] font-medium text-[#3A3A3A]"
              >
                Schwer
              </button>
              <button
                type="button"
                onClick={() => rateCurrent("medium")}
                className="rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] py-2 text-[12px] font-medium text-[#3A3A3A]"
              >
                Mittel
              </button>
              <button
                type="button"
                onClick={() => rateCurrent("easy")}
                className="rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] py-2 text-[12px] font-medium text-[#3A3A3A]"
              >
                Leicht
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
                  <div className="text-[12px] text-[#3A3A3A]/50">Wörter zur Wiederholung</div>
                </div>
                <button
                  onClick={handleReviewAll}
                  disabled={dueCount === 0}
                  className="px-5 py-2.5 rounded-xl bg-[#9FB58E] text-white text-[14px] font-medium disabled:opacity-50 hover:bg-[#8CA77D] transition-colors"
                >
                  Jetzt lernen
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-[#3A3A3A]/5 flex items-center justify-between text-[12px] text-[#3A3A3A]/50">
                <span>Gesamt: {totalWords} Wörter</span>
                <span>3 Kategorien</span>
              </div>
            </div>
          </div>

          {/* SRS Buckets */}
          <div className="px-4 pt-6">
            <h2 className="text-[13px] font-medium text-[#3A3A3A]/60 mb-3 px-1">Nach Schwierigkeit</h2>
            <div className="space-y-3">
              {buckets.map((bucket) => (
                <motion.button
                  key={bucket.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleBucketClick(bucket.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#FAF7F2] border border-[#3A3A3A]/5 shadow-sm text-left hover:bg-[#F6F2EB] transition-colors"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${bucket.color}20` }}
                  >
                    {bucket.emoji}
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-medium text-[#3A3A3A]">{bucket.label}</div>
                    <div className="text-[12px] text-[#3A3A3A]/50">{bucket.count} Wörter</div>
                  </div>
                  <div className="w-2 h-8 rounded-full" style={{ backgroundColor: bucket.color }} />
                </motion.button>
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="px-4 pt-6">
            <div className="bg-[#E3EBC5]/30 rounded-2xl border border-[#9FB58E]/20 p-4">
              <div className="text-[13px] font-medium text-[#3A3A3A] mb-1">💡 Tipp</div>
              <div className="text-[12px] text-[#3A3A3A]/70 leading-relaxed">
                Wiederhole schwere Wörter öfter. Das System passt die Intervalle automatisch an deinen Lernfortschritt an.
              </div>
            </div>
          </div>
        </>
      )}

      {/* Navigation Footer */}
      <NavFooter />
    </div>
  )
}
