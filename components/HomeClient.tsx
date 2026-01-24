"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import UserMenu from "@/components/UserMenu"
import uiSettings from "@/data/ui/settings.json"
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
  const [dailyGames, setDailyGames] = useState(0)
  const [dailyUploadDone, setDailyUploadDone] = useState(false)
  const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null)
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

    const now = new Date()
    const rawWeekStart = window.localStorage.getItem(WEEKLY_START_STORAGE_KEY)
    const weekStart = rawWeekStart ? new Date(rawWeekStart) : null
    const weekStartNormalized = (() => {
      const date = new Date()
      const day = date.getDay()
      const diff = (day + 6) % 7
      date.setDate(date.getDate() - diff)
      date.setHours(0, 0, 0, 0)
      return date
    })()
    if (!weekStart || weekStart.getTime() !== weekStartNormalized.getTime()) {
      window.localStorage.setItem(WEEKLY_START_STORAGE_KEY, weekStartNormalized.toISOString())
      window.localStorage.setItem(WEEKLY_WORDS_STORAGE_KEY, "0")
    }
    const rawWords = window.localStorage.getItem(WEEKLY_WORDS_STORAGE_KEY)
    setWordsLearned(rawWords ? Number(rawWords) || 0 : 0)

    const rawDaily = window.localStorage.getItem(DAILY_STATE_STORAGE_KEY)
    if (rawDaily) {
      try {
        const parsed = JSON.parse(rawDaily)
        const storedDate = parsed?.date
        const today = now.toISOString().slice(0, 10)
        if (storedDate === today) {
          setDailyGames(parsed?.games ?? 0)
          setDailyUploadDone(!!parsed?.upload)
        } else {
          const reset = { date: today, games: 0, upload: false }
          window.localStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(reset))
        }
      } catch {
        // ignore
      }
    } else {
      const today = now.toISOString().slice(0, 10)
      window.localStorage.setItem(
        DAILY_STATE_STORAGE_KEY,
        JSON.stringify({ date: today, games: 0, upload: false })
      )
    }

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

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    window.localStorage.setItem(
      DAILY_STATE_STORAGE_KEY,
      JSON.stringify({ date: today, games: dailyGames, upload: dailyUploadDone })
    )
  }, [dailyGames, dailyUploadDone])

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
        window.localStorage.setItem(SEEDS_STORAGE_KEY, String(currentSeeds + 5))
        setSeeds(currentSeeds + 5)
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
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-600 text-[10px]">
                  {dailyGames >= 3 ? "✓" : ""}
                </span>
                {ui.goalPlay}
              </span>
              <span className="text-xs text-neutral-400">
                {ui.goalPlayProgress} {Math.min(dailyGames, 3)}/3
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
                {ui.goalUploadProgress} {dailyUploadDone ? 1 : 0}/1
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-neutral-600 text-[10px]" />
                {ui.goalNews}
              </span>
              <span className="text-xs text-neutral-400">0/1</span>
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
          <div className="mt-3 text-sm text-neutral-300">{ui.newsTitle}</div>
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
