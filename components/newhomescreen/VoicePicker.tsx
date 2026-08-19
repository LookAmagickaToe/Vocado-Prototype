"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Play, Square } from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import type { VoiceAccentSource, VoiceGender } from "@/lib/tts/voices"

type VoiceOption = {
  id: string
  name: string
  gender: VoiceGender
  accent: string | null
  accentSource: VoiceAccentSource
  previewUrl: string | null
}

export type VoicePickerLabels = {
  title: string
  description: string
  female: string
  male: string
  voice: string
  preview: string
  standard: string
  fallback: string
  fallbackWarning: string
  loadError: string
  permissionError: string
  previewError: string
}

type Props = {
  targetLanguage: string
  variant: string | null
  selectedVoiceId: string | null
  disabled?: boolean
  labels: VoicePickerLabels
  onSelect: (id: string) => void
}

export default function VoicePicker({
  targetLanguage,
  variant,
  selectedVoiceId,
  disabled = false,
  labels,
  onSelect,
}: Props) {
  const [options, setOptions] = useState<VoiceOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let alive = true

    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) throw new Error(labels.loadError)

        const params = new URLSearchParams({ language: targetLanguage })
        if (variant) params.set("variant", variant)
        const response = await fetch(`/api/tts/voices?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(data?.options)) {
          throw new Error(
            data?.code === "ELEVENLABS_VOICES_READ_REQUIRED"
              ? labels.permissionError
              : data?.error ?? labels.loadError
          )
        }
        if (!alive) return
        setOptions(data.options)
      } catch (loadError) {
        if (!alive || controller.signal.aborted) return
        setError((loadError as Error).message || labels.loadError)
      } finally {
        if (alive) setIsLoading(false)
      }
    }

    load()
    return () => {
      alive = false
      controller.abort()
    }
  }, [targetLanguage, variant, labels.loadError, labels.permissionError])

  const stopPreview = () => {
    audioRef.current?.pause()
    audioRef.current = null
    setPreviewing(null)
  }

  useEffect(() => stopPreview, [])

  const playPreview = async (voice: VoiceOption) => {
    if (previewing === voice.id) {
      stopPreview()
      return
    }
    if (!voice.previewUrl) {
      setError(labels.previewError)
      return
    }

    stopPreview()
    setPreviewing(voice.id)
    setError(null)
    try {
      const audio = new Audio(voice.previewUrl)
      audioRef.current = audio
      audio.addEventListener("ended", () => setPreviewing(null), { once: true })
      audio.addEventListener("error", () => {
        setPreviewing(null)
        setError(labels.previewError)
      }, { once: true })
      await audio.play()
    } catch (previewError) {
      setPreviewing(null)
      setError((previewError as Error).message || labels.previewError)
    }
  }

  const labelFor = (voice: VoiceOption) => {
    const gender = voice.gender === "female" ? labels.female : voice.gender === "male" ? labels.male : labels.voice
    const accent = voice.accent ?? (voice.accentSource === "regional" ? variant : labels.standard)
    return { gender, accent }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[12px] font-medium text-[#3A3A3A]/60">{labels.title}</div>
        <p className="mt-1 text-[11px] leading-snug text-[#3A3A3A]/45">{labels.description}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl bg-[#F2F0E9] px-3 py-3 text-[12px] text-[#3A3A3A]/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          {labels.title}
        </div>
      ) : error && options.length === 0 ? (
        <p className="rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-snug text-red-700">
          {error}
        </p>
      ) : options.length ? (
        <div className="grid grid-cols-2 gap-2">
          {options.map((voice) => {
            const selected = selectedVoiceId === voice.id || (!selectedVoiceId && options[0]?.id === voice.id)
            const isPlaying = previewing === voice.id
            const { gender, accent } = labelFor(voice)
            return (
              <div
                key={voice.id}
                className={`relative rounded-xl border p-3 transition-colors ${
                  selected
                    ? "border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb)/0.08)]"
                    : "border-[#3A3A3A]/10 bg-[#F2F0E9]"
                }`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(voice.id)}
                  className="w-full pr-7 text-left disabled:opacity-60"
                >
                  <span className="block truncate text-[13px] font-semibold text-[#3A3A3A]">{voice.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] leading-tight text-[#3A3A3A]/50">
                    {gender} · {accent}
                  </span>
                </button>
                {selected && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-[rgb(var(--vocado-accent-rgb))]" />}
                <button
                  type="button"
                  disabled={disabled || !voice.previewUrl || (previewing !== null && !isPlaying)}
                  onClick={() => playPreview(voice)}
                  aria-label={`${labels.preview}: ${voice.name}`}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#3A3A3A]/10 bg-white/70 px-2 py-1.5 text-[11px] font-medium text-[#3A3A3A]/70 disabled:opacity-45"
                >
                  {isPlaying ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {labels.preview}
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-snug text-amber-800">
          {labels.fallbackWarning}
        </p>
      )}

      {error && options.length > 0 && <div className="text-[11px] text-[#B45353]">{error}</div>}
    </div>
  )
}
