"use client"

import { useEffect, useMemo, useState } from "react"
import type { VocabWorld } from "@/types/worlds"

import MemoryCard from "@/components/games/vocab/MemoryCard"
import ConjugationCard from "@/components/games/vocab/ConjugationCard"
import type { CardModel } from "@/components/games/vocab/types"
import { AnimatePresence } from "framer-motion"
import WinningScreen from "@/components/games/WinningScreen"
import { formatTemplate } from "@/lib/ui"


const WORD_SIDE: "es" | "de" = "es"

function extractVerbLabelFromPair(p: { id: string; es: string }) {
  const m = p.es.match(/\(([^)]+)\)/)
  if (m?.[1]) return m[1].trim()
  return p.id.split("_")[0] || ""
}

function renderModelForSlot(slot: Slot): CardModel {
  if (!slot.assigned) {
    return {
      key: slot.slotKey,
      pairId: slot.slotKey, // unique => never matches
      kind: "word",
      front: { title: "" },
    }
  }
  return { ...slot.assigned, key: slot.slotKey }
}


function buildDeck(pairs: VocabWorld["pool"]): CardModel[] {
  return pairs.flatMap((p) => {
    const word = WORD_SIDE === "es" ? p.es : p.de
    const other = WORD_SIDE === "es" ? p.de : p.es

    const wordCard: CardModel = {
      key: `${p.id}-word`,
      pairId: p.id,
      kind: "word",
      front: { title: word },
    }

    const imageCard: CardModel = {
      key: `${p.id}-image`,
      pairId: p.id,
      kind: "image",
      front: {
        title: p.image.type === "emoji" ? p.image.value : undefined,
        subtitle: other,
      },
      imageSrc: p.image.type === "image" ? p.image.src : undefined,
      imageAlt: p.image.type === "image" ? p.image.alt : undefined,
    }

    return [wordCard, imageCard]
  })
}
type Slot = {
  slotKey: string
  assigned: CardModel | null
}

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5)
}

export default function VocabMemoryGame({
  world,
  levelIndex,
  onNextLevel,
  primaryLabelOverride,
  secondaryLabelOverride,
}: {
  world: VocabWorld
  levelIndex: number
  onNextLevel: () => void
  primaryLabelOverride?: string
  secondaryLabelOverride?: string
}) {
    const VOCAB = useMemo(() => {
        const k = world.chunking.itemsPerGame
        const start = levelIndex * k
        return world.pool.slice(start, start + k)
    }, [world, levelIndex])

    const baseDeck = useMemo(() => buildDeck(VOCAB), [VOCAB])

    const [pendingResolution, setPendingResolution] = useState<{
        keys: [string, string]
        pairId: string
        isMatch: boolean
    } | null>(null)

    const [slots, setSlots] = useState<Slot[]>([])
    const [urn, setUrn] = useState<CardModel[]>([])
    const [seenSlots, setSeenSlots] = useState<Set<string>>(new Set())
    const [flippedKeys, setFlippedKeys] = useState<string[]>([])
    const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set())
    const [moves, setMoves] = useState(0)
    const [matchedOrder, setMatchedOrder] = useState<string[]>([])
    const [carouselIndex, setCarouselIndex] = useState(0)
    const [justMatchedKeys, setJustMatchedKeys] = useState<string[]>([])
    const [isWon, setIsWon] = useState(false)
    const [showWinOverlay, setShowWinOverlay] = useState(false)

    const primaryLabel =
      primaryLabelOverride ??
      world.ui?.vocab?.carousel?.primaryLabel ??
      "Español:"
    const secondaryLabel =
      secondaryLabelOverride ??
      world.ui?.vocab?.carousel?.secondaryLabel ??
      "Deutsch:"
    const rightTitle = world.ui?.vocab?.rightPanel?.title ?? "Parejas encontradas"
    const emptyHint = world.ui?.vocab?.rightPanel?.emptyHint ?? "Encuentra una pareja para empezar."

    const progressTemplate =
    world.ui?.vocab?.progressTemplate ??
    "Progreso: {matched}/{total} • Movimientos: {moves}"

    useEffect(() => {
      // create fixed slot positions (nothing assigned yet)
      const initialSlots: Slot[] = baseDeck.map((_, i) => ({
        slotKey: `slot-${i}`,
        assigned: null,
      }))

      setSlots(initialSlots)

      // urn holds the real cards, shuffled
      setUrn(shuffle(baseDeck))

      setSeenSlots(new Set())
      setFlippedKeys([])
      setMatchedPairIds(new Set())
      setMatchedOrder([])
      setCarouselIndex(0)
      setMoves(0)
      setPendingResolution(null)
    }, [baseDeck])


    useEffect(() => {
        if (matchedPairIds.size === VOCAB.length && VOCAB.length > 0) {
            setIsWon(true)
            setShowWinOverlay(true)
        }
    }, [matchedPairIds, VOCAB.length])

    const isCardFaceUp = (slotKey: string) => {
      const s = slots.find((x) => x.slotKey === slotKey)
      if (!s?.assigned) return flippedKeys.includes(slotKey) // face-up only if flipped
      return flippedKeys.includes(slotKey) || matchedPairIds.has(s.assigned.pairId)
    }


    const resolvePending = () => {
        if (!pendingResolution) return
        const { pairId, isMatch } = pendingResolution

        if (isMatch) {
        setMatchedPairIds((prev) => new Set([...prev, pairId]))
        setMatchedOrder((prev) => {
            const updated = [...prev, pairId]
            setCarouselIndex(updated.length - 1)
            return updated
        })
        }

        setFlippedKeys([])
        setPendingResolution(null)
    }

    const handleCardClick = (slotKey: string) => {
      if (pendingResolution) return

      const slot = slots.find((s) => s.slotKey === slotKey)
      if (!slot) return

      // prevent clicking matched cards
      if (slot.assigned && matchedPairIds.has(slot.assigned.pairId)) return

      if (flippedKeys.includes(slotKey)) return
      if (flippedKeys.length === 2) return

      // If this is the SECOND flip in a move, forbid drawing a matching pairId
      let forbidPairId: string | undefined = undefined
      if (flippedKeys.length === 1) {
        const firstSlot = slots.find((s) => s.slotKey === flippedKeys[0])
        forbidPairId = firstSlot?.assigned?.pairId
      }

      // If slot not assigned yet, pull from urn (with forbid rule on 2nd flip)
      if (!slot.assigned) {
        const ok = assignSlotFromUrn(slotKey, forbidPairId)
        if (!ok) return // no valid card in urn that avoids forbidden match
      }

      // track whether THIS slot was seen BEFORE this click
      const wasSeenBefore = seenSlots.has(slotKey)
      if (!wasSeenBefore) {
        setSeenSlots((prev) => new Set([...prev, slotKey]))
      }

      const next = [...flippedKeys, slotKey]
      setFlippedKeys(next)

      if (next.length === 2) {
        setMoves((m) => m + 1)

        const aSlot = slots.find((s) => s.slotKey === next[0])
        const bSlot = slots.find((s) => s.slotKey === next[1])

        // slots might have just been assigned; re-read from state is slightly async,
        // so we compute via "renderModelForSlot" which uses assigned or placeholder
        const a = renderModelForSlot(aSlot!)
        const b = renderModelForSlot(bSlot!)

        const isPairMatch = a.pairId === b.pairId && a.key !== b.key

        // ❗ allow match ONLY if both cards were seen BEFORE this move
        const aSeenBefore = seenSlots.has(next[0])
        const bSeenBefore = seenSlots.has(next[1])
        const allowMatch = VOCAB.length === 1 || (aSeenBefore && bSeenBefore)

        const finalIsMatch = isPairMatch && allowMatch

        setPendingResolution({
          keys: [a.key, b.key],
          pairId: a.pairId,
          isMatch: finalIsMatch,
        })

        if (finalIsMatch) {
          setJustMatchedKeys([a.key, b.key])
          window.setTimeout(() => setJustMatchedKeys([]), 900)
        }
      }
    }


    const carouselPair = useMemo(() => {
        if (matchedOrder.length === 0) return null
        const pairId = matchedOrder[Math.min(carouselIndex, matchedOrder.length - 1)]
        return VOCAB.find((v) => v.id === pairId) ?? null
    }, [matchedOrder, carouselIndex, VOCAB])

    const carouselItem = useMemo(() => {
        if (!carouselPair) return null
        return {
            id: carouselPair.id,
            image: carouselPair.image,
            primaryLabel: carouselPair.es,
            secondaryLabel: carouselPair.de,
            explanation: carouselPair.explanation,
            conjugation: carouselPair.conjugation, // ✅ NEW

        }
    }, [carouselPair])
    const explanationTitle = world.ui?.winning?.explanationTitle ?? "Explicación"
    
    const wui = world.ui?.winning
    const vui = world.ui?.vocab

    const winTitle = wui?.title
    const winMovesLabel = wui?.movesLabel
    const winExplanationTitle = wui?.explanationTitle
    const winConjugationTitle = wui?.conjugationTitle
    const winReviewTitle = wui?.reviewTitle ?? "Revisión"
    const winNextDefault = wui?.nextDefault
    const winCloseDefault = wui?.closeDefault

    const winSubtitle = `Todas las tarjetas reveladas — ${VOCAB.length} parejas encontradas.`
    
    const k = world.chunking.itemsPerGame
    const start = levelIndex * k
    const firstOfLevel = world.pool[start]
    const currentVerb =
      firstOfLevel && typeof (firstOfLevel as any).es === "string"
        ? extractVerbLabelFromPair(firstOfLevel as any)
        : ""

    const conjugationTable =
      world.submode === "conjugation" ? world.conjugations?.[currentVerb] : undefined
    
      const isConjugation = world.submode === "conjugation"

    const summaryItem = useMemo(() => {
      if (!isConjugation) return null

      // pick an icon: use first card’s emoji or fallback
      const img =
        firstOfLevel?.image ?? { type: "emoji" as const, value: "🧩" }

      return {
        id: `verb:${currentVerb}`,
        image: img,
        primaryLabel: conjugationTable?.infinitive ?? currentVerb,      // left label
        secondaryLabel: conjugationTable?.translation ?? "",           // right label
        explanation: `Tabla de conjugación para "${currentVerb}".`,    // optional
      }
    }, [isConjugation, firstOfLevel, currentVerb, conjugationTable])
    
    function assignSlotFromUrn(slotKey: string, forbidPairId?: string): boolean {
      // already assigned
      const slot = slots.find((s) => s.slotKey === slotKey)
      if (!slot || slot.assigned) return true

      // find a card in urn that does NOT create a forbidden match
      const idx = forbidPairId
        ? urn.findIndex((c) => c.pairId !== forbidPairId)
        : 0

      // no valid non-matching card available -> allow match to avoid deadlock
      if (idx < 0) {
        const picked = urn[0]
        if (!picked) return false
        const nextUrn = urn.slice(1)
        setUrn(nextUrn)
        setSlots((prev) =>
          prev.map((s) => (s.slotKey === slotKey ? { ...s, assigned: picked } : s))
        )
        return true
      }

      const picked = urn[idx]
      const nextUrn = [...urn.slice(0, idx), ...urn.slice(idx + 1)]

      setUrn(nextUrn)
      setSlots((prev) =>
        prev.map((s) => (s.slotKey === slotKey ? { ...s, assigned: picked } : s))
      )
      return true
    }

  return (
  <>
    <div className="grid grid-cols-12 gap-4 items-start">
      {/* CENTER BOARD */}
      <div className="col-span-12 md:col-span-7">
        <div
          className="bg-neutral-900/40 backdrop-blur rounded-2xl p-3 sm:p-5 shadow-sm border border-neutral-800"
          onClickCapture={(e) => {
            if (pendingResolution) {
              e.preventDefault()
              e.stopPropagation()
              resolvePending()
            }
          }}
        >
          <div className="max-h-[60vh] overflow-auto pr-1">
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-3">
              {slots.map((slot) => {
                const model = renderModelForSlot(slot)
                return (
                  <MemoryCard
                    key={slot.slotKey}
                    model={model}
                    flipped={isCardFaceUp(slot.slotKey)}
                    cleared={!!slot.assigned && matchedPairIds.has(slot.assigned.pairId)}
                    celebrate={justMatchedKeys.includes(slot.slotKey)}
                    onClick={() => handleCardClick(slot.slotKey)}
                  />
                )
              })}
            </div>
          </div>

        <div className="mt-4 text-xs text-neutral-400">
            {formatTemplate(progressTemplate, {
                matched: matchedPairIds.size,
                total: VOCAB.length,
                moves,
            })}
        </div>

        </div>
      </div>

      {/* RIGHT PANEL */}
      <aside className="col-span-12 md:col-span-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur max-h-[55vh] md:max-h-none overflow-auto">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-100">{rightTitle}</div>
            <div className="text-xs text-neutral-400">
              {matchedOrder.length === 0 ? "0" : carouselIndex + 1}/{matchedOrder.length}
            </div>
          </div>

          {carouselPair ? (
            <>
              {/* CAROUSEL */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm disabled:opacity-40"
                  onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                  disabled={carouselIndex === 0}
                >
                  ←
                </button>

                <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950/30 p-4 text-center">
                  <div className="flex justify-center">
                    {carouselPair.image.type === "emoji" ? (
                      <div className="text-5xl">{carouselPair.image.value}</div>
                    ) : (
                      <img
                        src={carouselPair.image.src}
                        alt={carouselPair.image.alt ?? "vocab image"}
                        className="h-20 w-20 object-contain"
                      />
                    )}
                  </div>

                  <div className="mt-3 text-sm">
                    <span className="text-neutral-400">{primaryLabel}</span>{" "}
                    <span className="font-semibold">{carouselPair.es}</span>
                  </div>

                  <div className="text-sm">
                    <span className="text-neutral-400">{secondaryLabel}</span>{" "}
                    <span className="font-semibold">{carouselPair.de}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm disabled:opacity-40"
                  onClick={() =>
                    setCarouselIndex((i) => Math.min(matchedOrder.length - 1, i + 1))
                  }
                  disabled={carouselIndex >= matchedOrder.length - 1}
                >
                  →
                </button>
              </div>

              {/* EXPLANATION */}
              <div className="mt-4 text-sm font-medium text-neutral-100">{explanationTitle}</div>
              <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/20 p-3">
                <div className="text-xs text-neutral-300 leading-relaxed">
                  {carouselPair.explanation ?? "No explanation added yet."}
                </div>

                {carouselPair.conjugation && (
                  <div className="mt-4">
                    <ConjugationCard conjugation={carouselPair.conjugation} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3 text-xs text-neutral-400">
              {emptyHint}
            </div>
          )}
        </div>
      </aside>
    </div>

    {/* ✅ WIN OVERLAY goes OUTSIDE grid */}
    <AnimatePresence>
        {showWinOverlay && (
        <WinningScreen
          moves={moves}
          subtitle={winSubtitle}
          onClose={() => setShowWinOverlay(false)}
          onRestart={() => {
            setShowWinOverlay(false)
            setIsWon(false)
            setCards(shuffle(baseDeck))
            setFlippedKeys([])
            setMatchedPairIds(new Set())
            setMatchedOrder([])
            setCarouselIndex(0)
            setMoves(0)
            setPendingResolution(null)
          }}
          onNext={() => {
            setShowWinOverlay(false)
            setIsWon(false)
            onNextLevel()
          }}
          nextLabel={world.ui?.winning?.nextDefault ?? "Siguiente"}

          // ✅ UI text
          title={wui?.title}
          movesLabel={wui?.movesLabel}
          explanationTitle={wui?.explanationTitle}
          conjugationTitle={wui?.conjugationTitle}
          reviewTitle={winReviewTitle}
          nextLabelDefault={wui?.nextDefault}
          closeLabelDefault={wui?.closeDefault}
          primaryCaption={vui?.carousel?.primaryLabel}
          secondaryCaption={vui?.carousel?.secondaryLabel}
          summaryItem={isConjugation ? summaryItem : undefined}
          conjugation={isConjugation ? conjugationTable : undefined}
          // ✅ only pass carousel props for NON-conjugation worlds
          {...(!isConjugation
            ? { matchedOrder, carouselIndex, setCarouselIndex, carouselItem }
            : {})}
        />

        )}
        </AnimatePresence>

  </>
)
}
