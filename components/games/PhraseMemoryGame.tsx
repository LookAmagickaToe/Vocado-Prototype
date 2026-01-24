"use client"

import { useEffect, useMemo, useState } from "react"
import type { PhraseWorld, PhraseItem, PhraseToken } from "@/types/worlds"
import MemoryCard from "@/components/games/vocab/MemoryCard" // reuse your MemoryCard UI (we'll pass a compatible model)
import { AnimatePresence } from "framer-motion"
import WinningScreen from "@/components/games/WinningScreen"
import { Button } from "@/components/ui/button"
import { formatTemplate } from "@/lib/ui"


import { motion } from "framer-motion"

type PhraseCardModel = {
  key: string
  kind: "token" | "distraction"
  text: string
  type: "verb" | "noun" | "pronoun" | "adj" | "other"
  correctIndex?: number // only for kind="token"
}

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5)
}
function sample<T>(arr: T[], n: number) {
  return shuffle(arr).slice(0, Math.min(n, arr.length))
}

function buildPhraseDeck(params: {
  phrase: PhraseItem
  distractions: PhraseToken[]
  distractCount: number
}): PhraseCardModel[] {
  const { phrase, distractions, distractCount } = params

  const tokenCards: PhraseCardModel[] = phrase.tokens.map((t, idx) => ({
    key: `token:${phrase.id}:${t.id}:${idx}`,
    kind: "token",
    text: t.text,
    type: t.type,
    correctIndex: idx,
  }))

  const distractCards: PhraseCardModel[] = sample(distractions, distractCount).map((d) => ({
    key: `dist:${phrase.id}:${d.id}`,
    kind: "distraction",
    text: d.text,
    type: d.type,
  }))

  return shuffle([...tokenCards, ...distractCards])
}

function tokenColor(type: PhraseToken["type"]) {
  // tweak as you like (Tailwind classes)
  switch (type) {
    case "verb":
      return "text-sky-300"
    case "noun":
      return "text-red-300"
    case "adj":
      return "text-green-300"
    case "pronoun":
      return "text-neutral-50"
    default:
      return "text-neutral-200"
  }
}

function placeholderColor(type: PhraseToken["type"]) {
  // for the blank slots
  switch (type) {
    case "verb":
      return "border-sky-500/40"
    case "noun":
      return "border-red-500/40"
    case "adj":
      return "border-green-500/40"
    case "pronoun":
      return "border-neutral-500/40"
    default:
      return "border-neutral-700"
  }
}

export default function PhraseMemoryGame({
    world,
    levelIndex,
    onNextLevel,
}: {
      world: PhraseWorld
    levelIndex: number
    onNextLevel:()=>void
}) {
    const [phraseIdx, setPhraseIdx] = useState(0)

    // reset phrase index when level changes
    useEffect(() => {
        setPhraseIdx(0)
    }, [levelIndex, world.id])

    // pick a chunk of phrases (levels)
    const PHRASES = useMemo(() => {
        const k = world.chunking.itemsPerGame
        const start = levelIndex * k
        return world.pool.slice(start, start + k)
    }, [world, levelIndex])

    // for now: play ONE phrase at a time (first in chunk)
    // later you can make a "next phrase" flow within the level
    const phrase: PhraseItem | null = PHRASES[phraseIdx] ?? null




    const [cards, setCards] = useState<PhraseCardModel[]>([])
    const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
    const [tempFlippedKey, setTempFlippedKey] = useState<string | null>(null)
    const [expectedIndex, setExpectedIndex] = useState(0)
    const [moves, setMoves] = useState(0)
    const [won, setWon] = useState(false)
    const [showWinOverlay, setShowWinOverlay] = useState(false)
    const [runSeed, setRunSeed] = useState(0)
    type Phase = "intro" | "preview" | "play"
    const [phase, setPhase] = useState<Phase>("intro")


    const deck = useMemo(() => {
    if (!phrase) return []
    const availableDistractions = world.distractions ?? []
    const distractCount = Math.min(availableDistractions.length, phrase.tokens.length)

    return buildPhraseDeck({
        phrase,
        distractions: availableDistractions,
        distractCount,
    })
    }, [phrase, world.distractions, runSeed]) // ✅ add runSeed

    //Game Setup (visible for 4 seconds then flip)
    useEffect(() => {
        // reset board state
        setCards(deck)
        setRevealedKeys(new Set())
        setTempFlippedKey(null)
        setExpectedIndex(0)
        setMoves(0)
        setWon(false)
        setShowWinOverlay(false)
        setPhase("intro")
    }, [deck, levelIndex, world.id, phraseIdx])
    useEffect(() => {
        if (phase !== "preview") return

        const t = window.setTimeout(() => {
            setPhase("play")
        }, 4000)

        return () => window.clearTimeout(t)
    }, [phase])

    //Win condition
    useEffect(() => {
    if (!phrase) return
    if (expectedIndex >= phrase.tokens.length && phrase.tokens.length > 0) {
        setWon(true)
        setShowWinOverlay(true)
    }
    }, [expectedIndex, phrase])

    const isFaceUp = (key: string) => phase === "preview" || revealedKeys.has(key) || tempFlippedKey === key

    const handleClick = (key: string) => {
        if (phase !== "play") return
        if (!phrase) return
        if (won) return
        if (tempFlippedKey) return
        if (revealedKeys.has(key)) return

        const clicked = cards.find((c) => c.key === key)
        if (!clicked) return

        setMoves((m) => m + 1)

        // ✅ distraction is always wrong
        if (clicked.kind === "distraction") {
            setTempFlippedKey(key)
            window.setTimeout(() => setTempFlippedKey(null), 1500)
            return
        }

        // ✅ token must match the next required index
        const correct = clicked.correctIndex === expectedIndex

        if (correct) {
            setRevealedKeys((prev) => new Set(prev).add(key))
            setExpectedIndex((i) => i + 1)
            return
    }

    // wrong: flip briefly then hide
    setTempFlippedKey(key)
    window.setTimeout(() => setTempFlippedKey(null), 1500)
    }


  const revealedTextsByIndex = phrase.tokens.map((t, idx) => {
    // if expectedIndex > idx -> token is already unlocked
    const isUnlocked = expectedIndex > idx
    return { ...t, isUnlocked }
  })

  
  const advance = () => {
    setShowWinOverlay(false)
    setWon(false)

    // next phrase inside the chunk
    if (phraseIdx < PHRASES.length - 1) {
        setPhraseIdx((i) => i + 1)
        return
    }

    // finished chunk -> next level
    onNextLevel()
    }

    const ui = world.ui?.phrase
    const wui = world.ui?.winning

    const promptTitle = ui?.promptTitle ?? "La Phrase"
    const promptSubtitle = ui?.promptSubtitle ?? "La Phrase en Aleman"

    const howTitle = ui?.howItWorksTitle ?? "Cómo funciona"
    const howText =
    ui?.howItWorksText ??
    "Gira las tarjetas en el orden correcto para formar la frase en español. Las tarjetas correctas se quedan abiertas. Las incorrectas se cierran después de 1,5 s."

    const legendTitle = ui?.legendTitle ?? "Leyenda"

    const progressTemplate =
    ui?.progressTemplate ?? "Progreso: {i}/{n} • Movimientos: {moves}"

    const winSubtitleTemplate =
    ui?.winSubtitleTemplate ?? "Has completado la frase ({n} tokens)."

    const nextPhraseLabel = ui?.nextPhraseLabel ?? "Siguiente frase"
    const nextLevelLabel = ui?.nextLevelLabel ?? "Siguiente nivel"

    const introKicker = ui?.introKicker ?? "Nueva frase"
    const introButton = ui?.introButton ?? "Empezar"

    const isLastPhraseInLevel = phraseIdx >= PHRASES.length - 1
    const nextLabel = isLastPhraseInLevel ? nextLevelLabel : nextPhraseLabel

    const winSubtitle = phrase
    ? formatTemplate(winSubtitleTemplate, { n: phrase.tokens.length })
    : ""

  return (
    <>
        <div className="grid grid-cols-12 gap-4 items-start">
        {/* LEFT / CENTER */}
        <div className="col-span-12 md:col-span-7">
            {/* Prompt */}
            <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-xs text-neutral-400">{promptTitle}</div>
            <div className="text-lg font-semibold text-neutral-50">
                {phrase.motherTongue}
            </div>

            <div className="mt-3 text-xs text-neutral-400">{promptSubtitle}</div>
            <div className="mt-2 flex flex-wrap gap-2">
                {revealedTextsByIndex.map((t, idx) => (
                <span
                    key={`${t.id}:${idx}`}
                    className={[
                    "inline-flex items-center rounded-lg border px-2 py-1 text-sm",
                    t.isUnlocked ? "bg-neutral-950/30" : "bg-neutral-950/10",
                    t.isUnlocked
                        ? "border-neutral-700"
                        : placeholderColor(t.type),
                    tokenColor(t.type),
                    ].join(" ")}
                >
                    {t.isUnlocked ? t.text : "____"}
                </span>
                ))}
            </div>

            <div className="mt-3 text-xs text-neutral-400">
                {formatTemplate(progressTemplate, {
                    i: Math.min(expectedIndex, phrase.tokens.length),
                    n: phrase.tokens.length,
                    moves,
                })}
            </div>
            </div>

            {/* Board */}
            <div className="bg-neutral-900/40 backdrop-blur rounded-2xl p-3 sm:p-5 shadow-sm border border-neutral-800">
              <div className="max-h-[60vh] overflow-auto pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {cards.map((c) => {
                    const isRevealed = revealedKeys.has(c.key)

                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => handleClick(c.key)}
                        disabled={isRevealed || won}
                        className={[
                          "relative aspect-square rounded-xl border border-neutral-800 bg-neutral-950/40 shadow-sm overflow-hidden",
                          "focus:outline-none focus:ring-2 focus:ring-neutral-400/40",
                          "disabled:opacity-40 disabled:cursor-default touch-manipulation",
                          !!tempFlippedKey ? "pointer-events-none" : "",
                        ].join(" ")}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          {isFaceUp(c.key) ? (
                            <div
                              className={`text-[clamp(0.7rem,3.2vw,1rem)] sm:text-[clamp(0.85rem,2.2vw,1.1rem)] font-semibold leading-tight break-words ${tokenColor(
                                c.type
                              )}`}
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {c.text}
                            </div>
                          ) : (
                            <img
                              src="/card/card-back.png"
                              alt="card back"
                              className="max-w-[70%] max-h-[70%] object-contain opacity-80"
                            />
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
        </div>

        {/* RIGHT PANEL */}
        <aside className="col-span-12 md:col-span-5">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur max-h-[55vh] md:max-h-none overflow-auto">
            <div className="text-sm font-medium text-neutral-100">{howTitle}</div>
            <div className="mt-2 text-xs text-neutral-300 leading-relaxed">{howText}</div>

            <div className="my-4 border-t border-neutral-800" />

            <div className="text-sm font-medium text-neutral-100">{legendTitle}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-neutral-50">
                Pronombre
                </span>
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-sky-300">
                Verbo
                </span>
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-red-300">
                Sustantivo
                </span>
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-green-300">
                Adj.
                </span>
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-neutral-200">
                Otro
                </span>
            </div>
            </div>
        </aside>
        </div>

        {/* ✅ WIN OVERLAY — SAME PATTERN AS VOCAB */}
        <AnimatePresence>
            {showWinOverlay && phrase && (
                <WinningScreen
                    subtitle={winSubtitle}
                    moves={moves}
                    explanation={phrase.explanation}
                    onClose={() => setShowWinOverlay(false)}
                    onRestart={() => {
                        setShowWinOverlay(false)
                        setWon(false)
                        setCards(deck)
                        setRevealedKeys(new Set())
                        setTempFlippedKey(null)
                        setExpectedIndex(0)
                        setMoves(0)
                        setPhase("intro")
                    }}
                    onNext={advance}
                    nextLabel={nextLabel}

                    // Optional: if you want world-configurable titles in the win modal
                    title={wui?.title}
                    movesLabel={wui?.movesLabel}
                    explanationTitle={wui?.explanationTitle}
                    conjugationTitle={wui?.conjugationTitle}
                    reviewTitle={wui?.reviewTitle}
                    />
            )}
        </AnimatePresence>
        <AnimatePresence>
            {phase === "intro" && phrase && (
                <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6"
                >
                <motion.div
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.96, opacity: 0 }}
                    className="w-full max-w-lg rounded-2xl bg-neutral-950 border border-neutral-800 p-6 text-center"
                >
                    <div className="text-xs text-neutral-400 mb-2">{introKicker}</div>
                    <div className="text-2xl font-semibold text-neutral-50 mb-4">
                    {phrase.motherTongue}
                    </div>

                <Button onClick={() => setPhase("preview")}>{introButton}</Button>
                </motion.div>
                </motion.div>
            )}
            </AnimatePresence>
        </>
    )
}
