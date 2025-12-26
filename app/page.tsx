"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Shuffle } from "lucide-react"
import { Button } from "@/components/ui/button"

type VocabPair = {
  id: string
  es: string
  de: string
  emoji: string
  explanation?: string
}

type CardModel = {
  key: string // unique per card
  pairId: string
  kind: "word" | "emoji"
  front: {
    // what we show when flipped
    title?: string // big text (word OR emoji)
    subtitle?: string // smaller text under emoji
  }
}

const VOCAB: VocabPair[] = [
  { 
    id: "ir", 
    es: "ir", 
    de: "gehen", 
    emoji: "🚶", 
    explanation: "Indica movimiento hacia un lugar. Es un verbo muy irregular. Ejemplo: 'Voy a la biblioteca para estudiar'." 
  },
  { 
    id: "comer", 
    es: "comer", 
    de: "essen", 
    emoji: "🍕", 
    explanation: "Acción de ingerir alimentos. En España, también significa específicamente almorzar al mediodía. Ejemplo: 'Mañana vamos a comer pizza'." 
  },
  { 
    id: "beber", 
    es: "beber", 
    de: "trinken", 
    emoji: "🥤", 
    explanation: "Ingerir un líquido. En América Latina se usa con más frecuencia el verbo 'tomar'. Ejemplo: 'Es importante beber mucha agua'." 
  },
  { 
    id: "dormir", 
    es: "dormir", 
    de: "schlafen", 
    emoji: "😴", 
    explanation: "Verbo con cambio de raíz (o-ue). Se usa para la acción de descansar durante la noche. Ejemplo: 'Siempre duermo ocho horas'." 
  },
  { 
    id: "leer", 
    es: "leer", 
    de: "lesen", 
    emoji: "📖", 
    explanation: "Pasar la vista por un texto comprendiendo los signos. Ejemplo: 'Me encanta leer antes de irme a dormir'." 
  },
  { 
    id: "hablar", 
    es: "hablar", 
    de: "sprechen", 
    emoji: "🗣️", 
    explanation: "Comunicarse con palabras. Es un verbo regular acabado en -ar. Ejemplo: 'Hablo español con mis amigos de Madrid'." 
  },
  { 
    id: "correr", 
    es: "correr", 
    de: "rennen", 
    emoji: "🏃", 
    explanation: "Desplazarse rápidamente con pasos largos. Se usa tanto para deporte como para urgencias. Ejemplo: 'Tengo que correr para llegar al tren'." 
  },
  { 
    id: "comprar", 
    es: "comprar", 
    de: "kaufen", 
    emoji: "🛒", 
    explanation: "Obtener algo a cambio de dinero. Ejemplo: 'Quiero comprar un regalo para el cumpleaños de mi hermano'." 
  },
]

// If you ever want to swap sides:
// - word card shows German, emoji card shows Spanish (under emoji)
const WORD_SIDE: "es" | "de" = "es"

function buildDeck(pairs: VocabPair[]): CardModel[] {
  return pairs.flatMap((p) => {
    const word = WORD_SIDE === "es" ? p.es : p.de
    const other = WORD_SIDE === "es" ? p.de : p.es

    const wordCard: CardModel = {
      key: `${p.id}-word`,
      pairId: p.id,
      kind: "word",
      front: { title: word },
    }

    const emojiCard: CardModel = {
      key: `${p.id}-emoji`,
      pairId: p.id,
      kind: "emoji",
      front: { title: p.emoji, subtitle: other },
    }

    return [wordCard, emojiCard]
  })
}

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5)
}

export default function VocabMemory() {
  const baseDeck = useMemo(() => buildDeck(VOCAB), [])
  const [cards, setCards] = useState<CardModel[]>([])
  const [flippedKeys, setFlippedKeys] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set())
  const [moves, setMoves] = useState(0)
  const [isWon, setIsWon] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activePairId, setActivePairId] = useState<string | null>(null)
  const [matchedOrder, setMatchedOrder] = useState<string[]>([]) // pairIds in the order they were found
  const [carouselIndex, setCarouselIndex] = useState(0)



  useEffect(() => {
    restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (matchedPairIds.size === VOCAB.length && VOCAB.length > 0) setIsWon(true)
  }, [matchedPairIds])

  const restart = () => {
    setCards(shuffle(baseDeck))
    setFlippedKeys([])
    setMatchedPairIds(new Set())
    setMatchedOrder([])
    setCarouselIndex(0)
    setMoves(0)
    setIsWon(false)
  }


  const isCardFaceUp = (cardKey: string) => {
    const c = cards.find(x => x.key === cardKey)
    if (!c) return false
    return flippedKeys.includes(cardKey) || matchedPairIds.has(c.pairId)
  }


  const handleCardClick = (cardKey: string) => {
    const c = cards.find(x => x.key === cardKey)
    if (!c) return
    if (isWon) return
    if (matchedPairIds.has(c.pairId)) return
    if (flippedKeys.includes(cardKey)) return
    if (flippedKeys.length === 2) return

    const next = [...flippedKeys, cardKey]
    setFlippedKeys(next)

    if (next.length === 2) {
      setMoves((m) => m + 1)

      const a = cards.find(x => x.key === next[0])!
      const b = cards.find(x => x.key === next[1])!
      const isMatch = a.pairId === b.pairId && a.key !== b.key

      if (isMatch) {
        const pairId = a.pairId

        setMatchedPairIds((prev) => new Set([...prev, pairId]))
        setMatchedOrder((prev) => {
          const updated = [...prev, pairId]
          // jump carousel to the newest found pair
          setCarouselIndex(updated.length - 1)
          return updated
        })

        setFlippedKeys([])
      } else {
        window.setTimeout(() => setFlippedKeys([]), 900)
      }
    }
  }

  const activePair = useMemo(() => {
  if (!activePairId) return null
  return VOCAB.find((v) => v.id === activePairId) ?? null
  }, [activePairId])

  const carouselPair = useMemo(() => {
    if (matchedOrder.length === 0) return null
    const pairId = matchedOrder[Math.min(carouselIndex, matchedOrder.length - 1)]
    return VOCAB.find(v => v.id === pairId) ?? null
  }, [matchedOrder, carouselIndex])

  const visibleCards = useMemo(
    () => cards.filter(c => !matchedPairIds.has(c.pairId)),
    [cards, matchedPairIds]
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="grid grid-cols-12 gap-4 items-start md:grid-rows-[auto,1fr]">
          {/* LEFT: hamburger/menu */}
          <aside className="col-span-12 md:col-span-2 md:row-span-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur">
              <button
                type="button"
                onClick={() => setIsMenuOpen((v) => !v)}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm"
              >
                ☰ Menu
              </button>

              {isMenuOpen && (
                <div className="mt-3 space-y-2 text-sm text-neutral-200">
                  <button className="block w-full text-left hover:text-white">Gestion</button>
                  <button className="block w-full text-left hover:text-white">Import</button>
                  <button className="block w-full text-left hover:text-white">Mundos</button>
                </div>
              )}
            </div>
          </aside>

          {/* CENTER: your current memory game */}
          {/* CENTER HEADER (row 1) */}
          <div className="col-span-12 md:col-span-7 md:col-start-3 md:row-start-1">
            <div className="w-full max-w-3xl">
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">vocado</h1>
                  <p className="text-sm text-neutral-300 mt-1">
                    Empareja las palabras en{" "}
                    <span className="font-medium text-neutral-100">español</span> con las palabras en{" "}
                    <span className="font-medium text-neutral-100">alemán</span>.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm text-neutral-300">Moves</div>
                    <div className="text-xl font-semibold">{moves}</div>
                  </div>
                  <Button onClick={restart} className="flex items-center gap-2">
                    <Shuffle className="w-4 h-4" />
                    Shuffle
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER BOARD (row 2) */}
          <div className="col-span-12 md:col-span-7 md:col-start-3 md:row-start-2">
            <div className="w-full max-w-3xl">
              <div className="bg-neutral-900/40 backdrop-blur rounded-2xl p-5 shadow-sm border border-neutral-800">
                {/* IMPORTANT: put the grid back */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {cards.map((card) => (
                    <MemoryCard
                      key={card.key}
                      model={card}
                      flipped={isCardFaceUp(card.key)}
                      cleared={matchedPairIds.has(card.pairId)}
                      onClick={() => handleCardClick(card.key)}
                    />
                  ))}
                </div>
                <div className="mt-4 text-xs text-neutral-400">
                  Progress: {matchedPairIds.size}/{VOCAB.length} pairs matched
                </div>
              </div>
            </div>
          </div>


          {/* RIGHT: matched-pairs carousel */}
          <aside className="col-span-12 md:col-span-3 md:row-start-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-100">Found pairs</div>
                <div className="text-xs text-neutral-400">
                  {matchedOrder.length === 0 ? "0" : carouselIndex + 1}/{matchedOrder.length}
                </div>
              </div>

              {carouselPair ? (
                <>
                  {/* Carousel */}
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
                      <div className="text-5xl">{carouselPair.emoji}</div>

                      <div className="mt-3 text-sm">
                        <span className="text-neutral-400">Spanish:</span>{" "}
                        <span className="font-semibold">{carouselPair.es}</span>
                      </div>

                      <div className="text-sm">
                        <span className="text-neutral-400">German:</span>{" "}
                        <span className="font-semibold">{carouselPair.de}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm disabled:opacity-40"
                      onClick={() =>
                        setCarouselIndex((i) =>
                          Math.min(matchedOrder.length - 1, i + 1)
                        )
                      }
                      disabled={carouselIndex >= matchedOrder.length - 1}
                    >
                      →
                    </button>
                  </div>

                  {/* Separator */}
                  <div className="my-4 border-t border-neutral-800" />

                  {/* Explanation */}
                  <div className="text-sm font-medium text-neutral-100">Explanation</div>
                  <div className="mt-2 text-xs text-neutral-300 leading-relaxed">
                    {carouselPair.explanation ?? "No explanation added yet."}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-xs text-neutral-400">
                  Match a pair to start the carousel.
                </div>
              )}
            </div>
          </aside>

        </div>
      </div>

      <AnimatePresence>
        {isWon && (
          <WinningScreen
            moves={moves}
            onRestart={restart}
            subtitle={`All cards revealed — ${VOCAB.length} pairs matched.`}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function MemoryCard({
  model,
  flipped,
  cleared,
  onClick,
}: {
  model: CardModel
  flipped: boolean
  cleared: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cleared}
      className="relative aspect-square rounded-xl border border-neutral-800 bg-neutral-950/40 shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-neutral-400/40 disabled:opacity-40 disabled:cursor-default"
    >
      {cleared ? (
        // EMPTY TILE (keeps layout, doesn't show vocab)
        <div className="absolute inset-0 flex items-center justify-center">
          {/* choose one: blank, faint icon, or check */}
          <div className="text-neutral-700 text-2xl">✓</div>
        </div>
      ) : (
        <motion.div
          className="absolute inset-0"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Back */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backfaceVisibility: "hidden" as any }}
          >
            {/* your image back here */}
            <img
              src="/card-back.png"
              alt="card back"
              className="w-16 h-16 opacity-80"
            />
          </div>

          {/* Front */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden" as any,
            }}
          >
            {model.kind === "word" ? (
              <div className="px-2 text-center">
                <div className="text-lg sm:text-xl font-semibold tracking-tight">
                  {model.front.title}
                </div>
              </div>
            ) : (
              <div className="px-2 text-center flex flex-col items-center">
                <div className="text-4xl leading-none">{model.front.title}</div>
                <div className="mt-2 text-sm font-medium">{model.front.subtitle}</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </button>
  )
}
function WinningScreen({
  moves,
  onRestart,
  subtitle,
}: {
  moves: number
  onRestart: () => void
  subtitle: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-md rounded-2xl bg-neutral-950 border border-neutral-800 p-6 text-center shadow-xl"
      >
        <h2 className="text-2xl font-semibold">Done 🎉</h2>
        <p className="text-sm text-neutral-300 mt-2">{subtitle}</p>

        <p className="text-sm text-neutral-400 mt-3">
          Moves: <span className="text-neutral-100 font-medium">{moves}</span>
        </p>

        <div className="mt-5 flex justify-center">
          <Button onClick={onRestart}>Play again</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
