"use client"

import { useEffect, useMemo, useState } from "react"
import type { VocabWorld } from "@/types/worlds"

import MemoryCard from "@/components/games/vocab/MemoryCard"
import ConjugationCard from "@/components/games/vocab/ConjugationCard"
import type { CardModel } from "@/components/games/vocab/types"
import { AnimatePresence } from "framer-motion"
import WinningScreen from "@/components/games/WinningScreen"


const WORD_SIDE: "es" | "de" = "es"

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

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5)
}

export default function VocabMemoryGame({
  world,
  levelIndex,
}: {
  world: VocabWorld
  levelIndex: number
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

  const [cards, setCards] = useState<CardModel[]>([])
  const [flippedKeys, setFlippedKeys] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set())
  const [moves, setMoves] = useState(0)
  const [matchedOrder, setMatchedOrder] = useState<string[]>([])
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [justMatchedKeys, setJustMatchedKeys] = useState<string[]>([])
  const [isWon, setIsWon] = useState(false)
  const [showWinOverlay, setShowWinOverlay] = useState(false)


  useEffect(() => {
    setCards(shuffle(baseDeck))
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

  const isCardFaceUp = (cardKey: string) => {
    const c = cards.find((x) => x.key === cardKey)
    if (!c) return false
    return flippedKeys.includes(cardKey) || matchedPairIds.has(c.pairId)
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

  const handleCardClick = (cardKey: string) => {
    if (pendingResolution) return

    const c = cards.find((x) => x.key === cardKey)
    if (!c) return
    if (matchedPairIds.has(c.pairId)) return
    if (flippedKeys.includes(cardKey)) return
    if (flippedKeys.length === 2) return

    const next = [...flippedKeys, cardKey]
    setFlippedKeys(next)

    if (next.length === 2) {
      setMoves((m) => m + 1)

      const a = cards.find((x) => x.key === next[0])!
      const b = cards.find((x) => x.key === next[1])!
      const isMatch = a.pairId === b.pairId && a.key !== b.key

      setPendingResolution({ keys: [a.key, b.key], pairId: a.pairId, isMatch })

      if (isMatch) {
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

  return (
  <>
    <div className="grid grid-cols-12 gap-4 items-start">
      {/* CENTER BOARD */}
      <div className="col-span-12 md:col-span-7">
        <div
          className="bg-neutral-900/40 backdrop-blur rounded-2xl p-5 shadow-sm border border-neutral-800"
          onClickCapture={(e) => {
            if (pendingResolution) {
              e.preventDefault()
              e.stopPropagation()
              resolvePending()
            }
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map((card) => (
              <MemoryCard
                key={card.key}
                model={card}
                flipped={isCardFaceUp(card.key)}
                cleared={matchedPairIds.has(card.pairId)}
                celebrate={justMatchedKeys.includes(card.key)}
                onClick={() => handleCardClick(card.key)}
              />
            ))}
          </div>

          <div className="mt-4 text-xs text-neutral-400">
            Progreso: {matchedPairIds.size}/{VOCAB.length} parejas encontradas • Movimientos: {moves}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <aside className="col-span-12 md:col-span-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-100">Parejas encontradas</div>
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
                    <span className="text-neutral-400">Español:</span>{" "}
                    <span className="font-semibold">{carouselPair.es}</span>
                  </div>

                  <div className="text-sm">
                    <span className="text-neutral-400">Deutsch:</span>{" "}
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
              <div className="mt-4 text-sm font-medium text-neutral-100">Explicación</div>
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
              Encuentra una pareja para empezar.
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
            subtitle={`Todas las tarjetas reveladas — ${VOCAB.length} parejas encontradas.`}
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
            matchedOrder={matchedOrder}
            carouselIndex={carouselIndex}
            setCarouselIndex={setCarouselIndex}
            carouselItem={carouselItem}
            reviewTitle="Revisión"
            />
        )}
        </AnimatePresence>

  </>
)
}
