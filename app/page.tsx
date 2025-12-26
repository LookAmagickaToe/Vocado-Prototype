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
  { id: "ir", es: "ir", de: "gehen", emoji: "🚶" },
  { id: "comer", es: "comer", de: "essen", emoji: "🍕" },
  { id: "beber", es: "beber", de: "trinken", emoji: "🥤" },
  { id: "dormir", es: "dormir", de: "schlafen", emoji: "😴" },
  { id: "leer", es: "leer", de: "lesen", emoji: "📖" },
  { id: "hablar", es: "hablar", de: "sprechen", emoji: "🗣️" },
  { id: "correr", es: "correr", de: "rennen", emoji: "🏃" },
  { id: "comprar", es: "comprar", de: "kaufen", emoji: "🛒" },
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
  const [flipped, setFlipped] = useState<number[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set())
  const [moves, setMoves] = useState(0)
  const [isWon, setIsWon] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activePairId, setActivePairId] = useState<string | null>(null)


  useEffect(() => {
    restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (matchedPairIds.size === VOCAB.length && VOCAB.length > 0) setIsWon(true)
  }, [matchedPairIds])

  const restart = () => {
    setCards(shuffle(baseDeck))
    setFlipped([])
    setMatchedPairIds(new Set())
    setMoves(0)
    setIsWon(false)
  }

  const isCardFaceUp = (index: number) => {
    const c = cards[index]
    return flipped.includes(index) || (c ? matchedPairIds.has(c.pairId) : false)
  }

  const handleCardClick = (index: number) => {
    const c = cards[index]
    setActivePairId(c.pairId)
    if (!c) return
    if (isWon) return
    if (matchedPairIds.has(c.pairId)) return
    if (flipped.includes(index)) return
    if (flipped.length === 2) return

    const next = [...flipped, index]
    setFlipped(next)

    if (next.length === 2) {
      setMoves((m) => m + 1)

      const a = cards[next[0]]
      const b = cards[next[1]]
      const isMatch = a.pairId === b.pairId && a.key !== b.key

      if (isMatch) {
        setMatchedPairIds((prev) => new Set([...prev, a.pairId]))
        setFlipped([])
      } else {
        window.setTimeout(() => setFlipped([]), 2000)
      }
    }
  }
  const activePair = useMemo(() => {
  if (!activePairId) return null
  return VOCAB.find((v) => v.id === activePairId) ?? null
  }, [activePairId])


  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-50 p-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="grid grid-cols-12 gap-4 items-start">
          {/* LEFT: hamburger/menu */}
          <aside className="col-span-12 md:col-span-2">
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
                  <button className="block w-full text-left hover:text-white">Settings</button>
                  <button className="block w-full text-left hover:text-white">Import</button>
                  <button className="block w-full text-left hover:text-white">About</button>
                </div>
              )}
            </div>
          </aside>

          {/* CENTER: your current memory game */}
          <main className="col-span-12 md:col-span-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-3xl">
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">vocado</h1>
                  <p className="text-sm text-neutral-300 mt-1">
                    Match the <span className="font-medium text-neutral-100">word</span> with the{" "}
                    <span className="font-medium text-neutral-100">emoji + translation</span>.
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

              <div className="bg-neutral-900/40 backdrop-blur rounded-2xl p-5 shadow-sm border border-neutral-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {cards.map((card, idx) => (
                    <MemoryCard
                      key={card.key}
                      model={card}
                      flipped={isCardFaceUp(idx)}
                      onClick={() => handleCardClick(idx)}
                    />
                  ))}
                </div>

                <div className="mt-4 text-xs text-neutral-400">
                  Progress: {matchedPairIds.size}/{VOCAB.length} pairs matched
                </div>
              </div>
            </div>
          </main>

          {/* RIGHT: explanation tile */}
          <aside className="col-span-12 md:col-span-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur">
              <div className="text-sm font-medium text-neutral-100">Explanation</div>

              {activePair ? (
                <div className="mt-3 space-y-2">
                  <div className="text-4xl">{activePair.emoji}</div>

                  <div className="text-sm">
                    <span className="text-neutral-400">Spanish:</span>{" "}
                    <span className="font-medium">{activePair.es}</span>
                  </div>

                  <div className="text-sm">
                    <span className="text-neutral-400">German:</span>{" "}
                    <span className="font-medium">{activePair.de}</span>
                  </div>

                  <div className="pt-2 text-xs text-neutral-400">
                    (Add notes here later: example sentence, conjugation, etc.)
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-neutral-400">
                  Click a card to show details here.
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
  onClick,
}: {
  model: CardModel
  flipped: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-xl border border-neutral-800 bg-neutral-950/40 shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-neutral-400/40"
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.25 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Back (hidden) */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backfaceVisibility: "hidden" as any }}
        >
          <img src="/card-back.png" alt="card back" className="w-35 h-25 opacity-80" />
        </div>

        {/* Front (revealed) */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: "rotateY(180deg)",
            backfaceVisibility: "hidden" as any,
          }}
        >
          {model.kind === "word" ? (
            <div className="text-center px-2">
              <div className="text-lg font-semibold">{model.front.title}</div>
              <div className="text-[11px] text-neutral-400 mt-1">Word</div>
            </div>
          ) : (
            <div className="text-center px-2">
              <div className="text-4xl">{model.front.title}</div>
              <div className="text-sm font-medium mt-2">
                {model.front.subtitle}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">
                Translation
              </div>
            </div>
          )}
        </div>
      </motion.div>
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
