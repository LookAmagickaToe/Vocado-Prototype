"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, X } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import {
  LANGUAGE_LABELS,
  isCuratedVariant,
  slugifyVariant,
  variantLabel,
  variantsFor,
} from "@/lib/languages"
import { buildTrack } from "@/lib/track"
import { clearTrackCaches } from "@/lib/cache-keys"
import VoicePicker, { type VoicePickerLabels } from "@/components/newhomescreen/VoicePicker"

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

// Sentinel for the "Other…" entry in the accent dropdown. Not a real slug — it
// only ever lives in component state, never in the DB.
const OTHER = "__other__"

type Track = {
  id: string
  source_language: string
  target_language: string
  variant: string | null
  level: string | null
  tts_voice_id: string | null
  position: number
}

type TrackStats = {
  source: string
  target: string
  total: number
  variants: Record<string, number>
}

type Labels = {
  sourceLabel: string
  targetLabel: string
  levelLabel: string
  voice: VoicePickerLabels
  removeLanguage: string
  removeTitle: string
  removeConfirm: string
  removeKeepsData: string
  cancel: string
  confirmRemove: string
}

/**
 * The language tabs in Profile.
 *
 * One tab per language being learned. Each carries its own CEFR level, its own
 * regional variety, and its own vocabulary — switching tabs is what makes the
 * app behave "as if it were a new user" for that language, while seeds, streak
 * and the leaderboard stay global to the profile.
 */
export default function LanguageTracksPanel({ labels }: { labels: Labels }) {
  const router = useRouter()
  const [tracks, setTracks] = useState<Track[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [stats, setStats] = useState<TrackStats[]>([])
  const [totalWords, setTotalWords] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [newSource, setNewSource] = useState("")
  const [newTarget, setNewTarget] = useState("")
  const [newLevel, setNewLevel] = useState("A2")
  const [customVariant, setCustomVariant] = useState("")
  const [showCustomVariant, setShowCustomVariant] = useState(false)
  const [removeCandidate, setRemoveCandidate] = useState<Track | null>(null)

  useEffect(() => {
    if (!removeCandidate) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) setRemoveCandidate(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [removeCandidate, isBusy])

  // Returns an empty header set rather than null when there is no session, so a
  // missing token surfaces as a 401 the user can see instead of a panel that
  // silently renders empty.
  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const session = await supabase.auth.getSession()
    const token = session.data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  const load = useCallback(async () => {
    const headers = await authHeader()
    try {
      const [trackRes, statsRes] = await Promise.all([
        fetch("/api/tracks", { headers }),
        fetch("/api/storage/words/stats", { headers }),
      ])
      const trackData = await trackRes.json()
      const statsData = await statsRes.json()

      const rows: Track[] = Array.isArray(trackData?.tracks) ? trackData.tracks : []
      setTracks(rows)

      const active = trackData?.active
      const match = rows.find(
        (row) =>
          row.source_language === active?.source && row.target_language === active?.target
      )
      setActiveId(match?.id ?? rows[0]?.id ?? null)

      setStats(Array.isArray(statsData?.tracks) ? statsData.tracks : [])
      setTotalWords(typeof statsData?.total === "number" ? statsData.total : 0)
    } catch {
      setError("Could not load your languages.")
    } finally {
      setIsLoading(false)
    }
  }, [authHeader])

  useEffect(() => {
    load()
  }, [load])

  const active = useMemo(
    () => tracks.find((row) => row.id === activeId) ?? null,
    [tracks, activeId]
  )

  const wordsFor = useCallback(
    (track: Track) =>
      stats.find(
        (row) => row.source === track.source_language && row.target === track.target_language
      )?.total ?? 0,
    [stats]
  )

  /**
   * Every write goes through here. Switching or editing a track changes which
   * content the whole app should show, so the caches keyed to the old track are
   * dropped and the server components re-rendered — the previous behaviour was
   * to save the change and leave the stale worlds on screen.
   */
  const mutate = useCallback(
    async (body: Record<string, unknown>, affected?: Track) => {
      const headers = await authHeader()
      setIsBusy(true)
      setError(null)
      try {
        const response = await fetch("/api/tracks", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await response.json()
        if (!response.ok) {
          setError(data?.error ?? "Something went wrong.")
          return
        }

        if (affected) {
          const session = await supabase.auth.getSession()
          clearTrackCaches(
            buildTrack({
              source: affected.source_language,
              target: affected.target_language,
              variant: affected.variant,
            }),
            session.data.session?.user?.id
          )
        }

        await load()
        router.refresh()
      } catch {
        setError("Something went wrong.")
      } finally {
        setIsBusy(false)
      }
    },
    [authHeader, load, router]
  )

  const switchTo = (track: Track) => {
    if (track.id === activeId) return
    setActiveId(track.id)
    mutate({ action: "switch", trackId: track.id })
  }

  const updateActive = (patch: Record<string, unknown>, clearCaches = true) => {
    if (!active) return
    // The caches belong to the track as it was *before* the edit — a level or
    // accent change re-keys them.
    mutate(
      { action: "update", trackId: active.id, ...patch },
      clearCaches ? active : undefined
    )
  }

  const availableVariants = active ? variantsFor(active.target_language) : []
  const activeVariantIsCustom =
    !!active?.variant && !isCuratedVariant(active.variant, active.target_language)

  if (isLoading) {
    return (
      <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 p-4 shadow-sm">
        <div className="text-[13px] text-[#3A3A3A]/50">Loading languages…</div>
      </div>
    )
  }

  return (
    <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 p-4 shadow-sm space-y-4">
      {/* Total across every language, deliberately outside the tabs. */}
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-[#3A3A3A]/60">All languages</span>
        <span className="text-[13px] font-semibold text-[#3A3A3A]">
          {totalWords.toLocaleString()} words
        </span>
      </div>

      {/* Tab strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tracks.map((track) => {
          const isActive = track.id === activeId
          const variant = variantLabel(track.variant, track.target_language)
          return (
            <button
              key={track.id}
              type="button"
              disabled={isBusy}
              onClick={() => switchTo(track)}
              className={`shrink-0 rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                isActive
                  ? "bg-[rgb(var(--vocado-accent-rgb))] text-white"
                  : "bg-[#F2F0E9] text-[#3A3A3A] hover:bg-[#EAE7DE]"
              }`}
            >
              <div className="text-[13px] font-semibold whitespace-nowrap">
                {track.target_language}
                {variant ? ` · ${variant}` : ""}
              </div>
              <div
                className={`text-[11px] whitespace-nowrap ${
                  isActive ? "text-white/70" : "text-[#3A3A3A]/50"
                }`}
              >
                {wordsFor(track).toLocaleString()} words
              </div>
            </button>
          )
        })}

        <button
          type="button"
          disabled={isBusy}
          onClick={() => setIsAdding((prev) => !prev)}
          className="shrink-0 rounded-xl border border-dashed border-[#3A3A3A]/20 px-3 py-2 text-[13px] text-[#3A3A3A]/60 hover:bg-[#F2F0E9] disabled:opacity-60"
        >
          + Add
        </button>
      </div>

      {error && <div className="text-[12px] text-red-600">{error}</div>}

      {/* Add a language */}
      {isAdding && (
        <div className="rounded-xl border border-[#3A3A3A]/10 bg-[#F2F0E9] p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="text-[11px] font-medium text-[#3A3A3A]/60">
                {labels.sourceLabel}
              </label>
              <select
                value={newSource}
                onChange={(event) => setNewSource(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3A3A3A]/10 bg-white px-2 py-2 text-[13px]"
              >
                <option value="">—</option>
                {LANGUAGE_LABELS.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-[#3A3A3A]/60">
                {labels.targetLabel}
              </label>
              <select
                value={newTarget}
                onChange={(event) => setNewTarget(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3A3A3A]/10 bg-white px-2 py-2 text-[13px]"
              >
                <option value="">—</option>
                {LANGUAGE_LABELS.filter((lang) => lang !== newSource).map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-[#3A3A3A]/60">
                {labels.levelLabel}
              </label>
              <select
                value={newLevel}
                onChange={(event) => setNewLevel(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3A3A3A]/10 bg-white px-2 py-2 text-[13px]"
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy || !newSource || !newTarget}
            onClick={() => {
              mutate({
                action: "create",
                sourceLanguage: newSource,
                targetLanguage: newTarget,
                level: newLevel,
              })
              setIsAdding(false)
              setNewSource("")
              setNewTarget("")
              setNewLevel("A2")
            }}
            className="w-full rounded-lg bg-[rgb(var(--vocado-accent-rgb))] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            Add language
          </button>
        </div>
      )}

      {/* Active tab */}
      {active && (
        <div className="space-y-4">
          <div className="text-[13px] text-[#3A3A3A]/70">
            <span className="font-medium">{active.source_language}</span>
            {" → "}
            <span className="font-medium">{active.target_language}</span>
          </div>

          <div>
            <label className="text-[12px] font-medium text-[#3A3A3A]/60">
              {labels.levelLabel}
            </label>
            <select
              value={active.level ?? "A2"}
              disabled={isBusy}
              onChange={(event) => updateActive({ level: event.target.value })}
              className="mt-2 w-full rounded-xl border border-[#3A3A3A]/10 bg-[#F2F0E9] px-3 py-2 text-[14px] text-[#3A3A3A] disabled:opacity-60"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[12px] font-medium text-[#3A3A3A]/60">Accent</label>
            <select
              value={
                showCustomVariant || activeVariantIsCustom ? OTHER : active.variant ?? ""
              }
              disabled={isBusy}
              onChange={(event) => {
                const value = event.target.value
                if (value === OTHER) {
                  setShowCustomVariant(true)
                  setCustomVariant(activeVariantIsCustom ? active.variant ?? "" : "")
                  return
                }
                setShowCustomVariant(false)
                updateActive({ variant: value || null })
              }}
              className="mt-2 w-full rounded-xl border border-[#3A3A3A]/10 bg-[#F2F0E9] px-3 py-2 text-[14px] text-[#3A3A3A] disabled:opacity-60"
            >
              <option value="">None</option>
              {availableVariants.map((variant) => (
                <option key={variant.slug} value={variant.slug}>
                  {variant.label}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>

            {(showCustomVariant || activeVariantIsCustom) && (
              <div className="mt-2 flex gap-2">
                <input
                  value={customVariant}
                  onChange={(event) => setCustomVariant(event.target.value)}
                  placeholder="e.g. Glaswegian"
                  className="flex-1 rounded-xl border border-[#3A3A3A]/10 bg-[#F2F0E9] px-3 py-2 text-[14px]"
                />
                <button
                  type="button"
                  disabled={isBusy || !slugifyVariant(customVariant)}
                  onClick={() => {
                    updateActive({ variant: customVariant })
                    setShowCustomVariant(false)
                  }}
                  className="rounded-xl bg-[rgb(var(--vocado-accent-rgb))] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  Set
                </button>
              </div>
            )}

            <p className="mt-2 text-[11px] leading-snug text-[#3A3A3A]/45">
              You keep every standard {active.target_language} word you already know.
              Only words specific to the accent are added, and they stay hidden when
              you switch back to None.
            </p>
          </div>

          <VoicePicker
            targetLanguage={active.target_language}
            variant={active.variant}
            selectedVoiceId={active.tts_voice_id}
            disabled={isBusy}
            labels={labels.voice}
            onSelect={(ttsVoiceId) => updateActive({ ttsVoiceId }, false)}
          />

          {tracks.length > 1 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setRemoveCandidate(active)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {labels.removeLanguage}
            </button>
          )}
        </div>
      )}

      {removeCandidate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isBusy) setRemoveCandidate(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-language-title"
            aria-describedby="remove-language-description"
            className="relative w-full max-w-sm rounded-2xl border border-black/5 bg-[#FAF7F2] p-5 shadow-2xl"
          >
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setRemoveCandidate(null)}
              aria-label={labels.cancel}
              className="absolute right-3 top-3 rounded-full p-1.5 text-[#3A3A3A]/45 hover:bg-black/5 hover:text-[#3A3A3A] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-700">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2 id="remove-language-title" className="mt-4 pr-8 text-[18px] font-semibold text-[#3A3A3A]">
              {labels.removeTitle}
            </h2>
            <p id="remove-language-description" className="mt-2 text-[13px] leading-relaxed text-[#3A3A3A]/70">
              {labels.removeConfirm.replace("{language}", removeCandidate.target_language)}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#3A3A3A]/50">
              {labels.removeKeepsData}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                autoFocus
                disabled={isBusy}
                onClick={() => setRemoveCandidate(null)}
                className="rounded-xl border border-[#3A3A3A]/10 bg-white px-3 py-2.5 text-[13px] font-medium text-[#3A3A3A] hover:bg-[#F2F0E9] disabled:opacity-50"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  const track = removeCandidate
                  setRemoveCandidate(null)
                  mutate({ action: "delete", trackId: track.id }, track)
                }}
                className="rounded-xl bg-red-600 px-3 py-2.5 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {labels.confirmRemove}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
