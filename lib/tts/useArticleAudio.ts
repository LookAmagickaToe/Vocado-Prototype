"use client"

// Playback for one article's read-aloud audio.
//
// The whole article is a single audio file, so "play this sentence" is a seek
// plus a stop time rather than a separate resource. Everything here — sentence
// playback, word playback, the karaoke highlight — reads off the marks table
// the API returned with the file.

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import type { NewsAudio, TimeRange, TtsMarks } from "./types"

export type AudioStatus = "idle" | "generating" | "playing" | "error"

type Loaded = {
  hash: string
  url: string
  marks: TtsMarks
  voiceId: string
  modelId: string
  language: string
  variant: string | null
}

export type ArticleAudioRequest = {
  /** The paragraphs actually on screen — these determine the cache key. */
  paragraphs: string[]
  /** Language label of those paragraphs, so the right voice is picked. */
  language: string
  variant?: string | null
}

export type ArticleAudio = {
  status: AudioStatus
  error: string | null
  /** Row currently being spoken, or null. */
  activeRow: number | null
  /** Word index within `activeRow` currently being spoken, or null. */
  activeWord: number | null
  /** True once audio exists, so the UI can show play rather than generate. */
  ready: boolean
  /** Metadata to persist on the world when the article is saved. */
  saved: NewsAudio | null
  playAll: () => Promise<void>
  playRow: (rowIndex: number) => Promise<void>
  playWord: (rowIndex: number, wordIndex: number) => Promise<void>
  stop: () => void
  toggleAll: () => Promise<void>
}

function findRange(ranges: TimeRange[] | null, rowIndex: number): TimeRange | null {
  if (!ranges) return null
  return ranges.find((r) => r.rowIndex === rowIndex) ?? null
}

/**
 * Resolve once the element knows its duration, so a subsequent seek lands where
 * it was asked to. Resolves rather than rejects on error — playback will
 * surface the real failure, and a hung promise here would freeze the button.
 */
function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      audio.removeEventListener("loadedmetadata", done)
      audio.removeEventListener("error", done)
      resolve()
    }
    audio.addEventListener("loadedmetadata", done)
    audio.addEventListener("error", done)
  })
}

/**
 * @param request  What to speak. Null disables the hook (no article on screen).
 * @param existing Audio already stored on a saved world. When present the first
 *                 play still round-trips to the API for a fresh signed URL, but
 *                 it is a cache hit — no generation, no charge.
 */
export function useArticleAudio(
  request: ArticleAudioRequest | null,
  existing?: NewsAudio | null
): ArticleAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadedRef = useRef<Loaded | null>(null)
  const [status, setStatus] = useState<AudioStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [activeWord, setActiveWord] = useState<number | null>(null)

  // When set, playback pauses once this time is passed — that is what turns one
  // file into per-sentence and per-word playback.
  const stopAtRef = useRef<number | null>(null)
  // While a single row or word is playing, the highlight is pinned to it rather
  // than tracked continuously.
  const pinnedRowRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)

  // A new article invalidates whatever was loaded.
  const cacheKey = request ? `${request.language}|${request.variant ?? ""}|${request.paragraphs.join("")}` : ""
  const cacheKeyRef = useRef(cacheKey)
  useEffect(() => {
    if (cacheKeyRef.current === cacheKey) return
    cacheKeyRef.current = cacheKey
    audioRef.current?.pause()
    loadedRef.current = null
    stopAtRef.current = null
    pinnedRowRef.current = null
    setReady(false)
    setStatus("idle")
    setActiveRow(null)
    setActiveWord(null)
  }, [cacheKey])

  const clearFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    stopAtRef.current = null
    pinnedRowRef.current = null
    clearFrame()
    setStatus((s) => (s === "playing" ? "idle" : s))
    setActiveRow(null)
    setActiveWord(null)
  }, [clearFrame])

  /**
   * Drive the highlight from the audio clock on animation frames rather than
   * `timeupdate`, which only fires ~4x/second — too coarse for word-level
   * highlighting to look attached to the voice.
   */
  const startTracking = useCallback(() => {
    clearFrame()
    const tick = () => {
      const audio = audioRef.current
      const loaded = loadedRef.current
      if (!audio || !loaded) return

      const t = audio.currentTime

      if (stopAtRef.current !== null && t >= stopAtRef.current) {
        audio.pause()
        stopAtRef.current = null
        pinnedRowRef.current = null
        setStatus("idle")
        setActiveRow(null)
        setActiveWord(null)
        clearFrame()
        return
      }

      const pinned = pinnedRowRef.current
      const row =
        pinned ??
        loaded.marks.segments.find((s) => t >= s.start && t < s.end)?.rowIndex ??
        null
      setActiveRow(row)

      const word =
        row === null || !loaded.marks.words
          ? null
          : loaded.marks.words.find(
              (w) => w.rowIndex === row && t >= w.start && t < w.end
            )?.wordIndex ?? null
      setActiveWord(word)

      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [clearFrame])

  /** Fetch (or generate) the audio, returning the loaded handle. */
  const ensureLoaded = useCallback(async (): Promise<Loaded | null> => {
    if (loadedRef.current) return loadedRef.current
    if (!request || !request.paragraphs.length) return null

    setStatus("generating")
    setError(null)
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token ?? ""
      if (!token) {
        setError("Not signed in")
        setStatus("error")
        return null
      }

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paragraphs: request.paragraphs,
          language: request.language,
          variant: request.variant ?? undefined,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url || !data?.marks) {
        setError(data?.error ?? `Audio failed (${res.status})`)
        setStatus("error")
        return null
      }

      const loaded: Loaded = {
        hash: data.hash,
        url: data.url,
        marks: data.marks,
        voiceId: data.voiceId,
        modelId: data.modelId,
        language: data.language,
        variant: data.variant ?? null,
      }
      loadedRef.current = loaded

      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.preload = "auto"
      }
      audioRef.current.src = loaded.url
      // Seeking before metadata arrives silently lands at 0, which would make
      // the first drag-to-listen on a mid-article sentence play from the top.
      await waitForMetadata(audioRef.current)
      setReady(true)
      return loaded
    } catch (e: any) {
      setError(e?.message ?? "Audio failed")
      setStatus("error")
      return null
    }
  }, [request])

  const playFrom = useCallback(
    async (start: number, stopAt: number | null, pinRow: number | null) => {
      const loaded = await ensureLoaded()
      const audio = audioRef.current
      if (!loaded || !audio) return

      stopAtRef.current = stopAt
      pinnedRowRef.current = pinRow
      audio.currentTime = start
      try {
        await audio.play()
      } catch (e: any) {
        // Autoplay policies reject play() that is not tied to a gesture. Every
        // caller here is gesture-driven, so this is a genuine failure.
        setError(e?.message ?? "Playback blocked")
        setStatus("error")
        return
      }
      setStatus("playing")
      startTracking()
    },
    [ensureLoaded, startTracking]
  )

  const playAll = useCallback(() => playFrom(0, null, null), [playFrom])

  const playRow = useCallback(
    async (rowIndex: number) => {
      const loaded = await ensureLoaded()
      if (!loaded) return
      const seg = findRange(loaded.marks.segments, rowIndex)
      if (!seg) return
      await playFrom(seg.start, seg.end, rowIndex)
    },
    [ensureLoaded, playFrom]
  )

  const playWord = useCallback(
    async (rowIndex: number, wordIndex: number) => {
      const loaded = await ensureLoaded()
      if (!loaded?.marks.words) return
      const word = loaded.marks.words.find(
        (w) => w.rowIndex === rowIndex && w.wordIndex === wordIndex
      )
      if (!word) return
      await playFrom(word.start, word.end, rowIndex)
    },
    [ensureLoaded, playFrom]
  )

  const toggleAll = useCallback(async () => {
    if (status === "playing") {
      stop()
      return
    }
    await playAll()
  }, [status, stop, playAll])

  // Pause and release on unmount so navigating away never leaves audio running.
  useEffect(() => {
    return () => {
      clearFrame()
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.src = ""
      }
    }
  }, [clearFrame])

  // Natural end of the whole article.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => {
      stopAtRef.current = null
      pinnedRowRef.current = null
      clearFrame()
      setStatus("idle")
      setActiveRow(null)
      setActiveWord(null)
    }
    audio.addEventListener("ended", onEnded)
    return () => audio.removeEventListener("ended", onEnded)
  }, [ready, clearFrame])

  const loaded = loadedRef.current
  const saved: NewsAudio | null = loaded
    ? {
        hash: loaded.hash,
        language: loaded.language,
        variant: loaded.variant,
        voiceId: loaded.voiceId,
        modelId: loaded.modelId,
        marks: loaded.marks,
      }
    : existing ?? null

  return {
    status,
    error,
    activeRow,
    activeWord,
    ready: ready || Boolean(existing),
    saved,
    playAll,
    playRow,
    playWord,
    stop,
    toggleAll,
  }
}
