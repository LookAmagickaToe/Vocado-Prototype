"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import family from "@/data/worlds/family.json"
import basic_verbs from "@/data/worlds/basic_verbs.json"


//CHange to change world order
const WORLDS = [basic_verbs, family] as unknown as {
  id: string
  title: string
  chunking: { pairsPerGame: number }
  pool: VocabPair[]
}[]

type CardImage =
  | { type: "emoji"; value: string }
  | { type: "image"; src: string; alt?: string }

type ConjugationSection = {
  title: string
  rows: [string, string][] // [pronoun, form]
}

type Conjugation = {
  infinitive?: string
  translation?: string
  sections: ConjugationSection[]
}

type VocabPair = {
  id: string
  es: string
  de: string
  image: CardImage
  explanation?: string
  pos?: "verb" | "noun" | "adj" | "other"
  conjugation?: Conjugation
}

type CardModel = {
  key: string
  pairId: string
  kind: "word" | "image"
  front: { title?: string; subtitle?: string }
  imageSrc?: string
  imageAlt?: string
}



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


//VOCADO
export default function VocabMemory() {
  const [pendingResolution, setPendingResolution] = useState<{
    keys: [string, string]
    pairId: string
    isMatch: boolean
  } | null>(null)

  const [worldId, setWorldId] = useState<string>(WORLDS[0].id)
  const [levelIndex, setLevelIndex] = useState<number>(0)

  const [isWorldsOpen, setIsWorldsOpen] = useState(false)
  const [isLevelsOpen, setIsLevelsOpen] = useState(false)

  const [pendingWorldId, setPendingWorldId] = useState<string | null>(null)

  const currentWorld = useMemo(() => {
    return WORLDS.find((w) => w.id === worldId) ?? WORLDS[0]
  }, [worldId])

  const VOCAB = useMemo(() => {
    const k = currentWorld.chunking.pairsPerGame
    const start = levelIndex * k
    return currentWorld.pool.slice(start, start + k)
  }, [currentWorld, levelIndex])



  const baseDeck = useMemo(() => buildDeck(VOCAB), [VOCAB])
  const [cards, setCards] = useState<CardModel[]>([])
  const [flippedKeys, setFlippedKeys] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set())
  const [moves, setMoves] = useState(0)
  const [isWon, setIsWon] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activePairId, setActivePairId] = useState<string | null>(null)
  const [matchedOrder, setMatchedOrder] = useState<string[]>([]) // pairIds in the order they were found
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [justMatchedKeys, setJustMatchedKeys] = useState<string[]>([])
  const [showWinOverlay, setShowWinOverlay] = useState(false)




  useEffect(() => {
    // shuffle a new deck from the new world vocab
    setCards(shuffle(baseDeck))

    // reset game state
    setFlippedKeys([])          // or setFlipped([])
    setMatchedPairIds(new Set())
    setMatchedOrder([])
    setCarouselIndex(0)
    setMoves(0)
    setIsWon(false)
    setShowWinOverlay(false)
  }, [worldId, baseDeck])

  useEffect(() => {
    if (matchedPairIds.size === VOCAB.length && VOCAB.length > 0) {
      setIsWon(true)
      setShowWinOverlay(true)
    }
  }, [matchedPairIds, VOCAB.length])



  const restart = () => {
    setCards(shuffle(baseDeck))
    setFlippedKeys([])
    setMatchedPairIds(new Set())
    setMatchedOrder([])
    setCarouselIndex(0)
    setMoves(0)
    setIsWon(false)
    setShowWinOverlay(false)

  }


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
    if (isWon) return
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

      setPendingResolution({
        keys: [a.key, b.key],
        pairId: a.pairId,
        isMatch,
      })

      if (isMatch) {
        setJustMatchedKeys([a.key, b.key])
        window.setTimeout(() => setJustMatchedKeys([]), 900)
      }
    }
  }
  useEffect(() => {
    setLevelIndex(0)
  }, [worldId])

  const levelsCount = useMemo(() => {
    const k = currentWorld.chunking.pairsPerGame
    return Math.ceil(currentWorld.pool.length / k)
  }, [currentWorld])


  const activePair = useMemo(() => {
    if (!activePairId) return null
    return VOCAB.find((v) => v.id === activePairId) ?? null
  }, [activePairId, VOCAB])

  const carouselPair = useMemo(() => {
    if (matchedOrder.length === 0) return null
    const pairId = matchedOrder[Math.min(carouselIndex, matchedOrder.length - 1)]
    return VOCAB.find(v => v.id === pairId) ?? null
  }, [matchedOrder, carouselIndex, VOCAB])

  const worldTitle = currentWorld.title
  const levelLabel = `Nivel ${levelIndex + 1}`


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
                ☰ Menú
              </button>

              {isMenuOpen && (
                <div className="mt-3 space-y-2 text-sm text-neutral-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsWorldsOpen(true)   // open worlds overlay
                      setIsMenuOpen(false)   // close hamburger menu
                    }}
                    className="block w-full text-left hover:text-white"
                  >
                    Mundos
                  </button>
                  <button className="block w-full text-left hover:text-white">Gestion</button>
                  <button className="block w-full text-left hover:text-white">🔒 Locked</button>
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
                  <div className="mt-1 text-sm text-neutral-300">
                    {worldTitle} — {levelLabel}
                  </div>
                  <p className="text-sm text-neutral-300 mt-1">
                    Empareja las palabras en{" "}
                    <span className="font-medium text-neutral-100">español</span> con las palabras en{" "}
                    <span className="font-medium text-neutral-100">alemán</span>.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm text-neutral-300">Movimientos</div>
                    <div className="text-xl font-semibold">{moves}</div>
                  </div>
                  <Button onClick={restart} className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reanudar
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER BOARD (row 2) */}
          <div className="col-span-12 md:col-span-7 md:col-start-3 md:row-start-2">
            <div className="w-full max-w-3xl">
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
                  Progreso: {matchedPairIds.size}/{VOCAB.length} parejas encontradas
                </div>
              </div>
            </div>
          </div>


          {/* RIGHT: matched-pairs carousel */}
          <aside className="col-span-12 md:col-span-3 md:row-start-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-100">Parejas encontradas</div>
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
                  <div className="text-sm font-medium text-neutral-100">Explicación</div>
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
      </div>
      <AnimatePresence>
        {showWinOverlay && (
          <WinningScreen
            moves={moves}
            subtitle={`All cards revealed — ${VOCAB.length} pairs matched.`}
            onClose={() => setShowWinOverlay(false)}
            onRestart={restart}
            matchedOrder={matchedOrder}
            carouselIndex={carouselIndex}
            setCarouselIndex={setCarouselIndex}
            carouselPair={carouselPair}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isWorldsOpen && (
          <WorldsOverlay
            worlds={WORLDS as any}
            activeWorldId={worldId}
            onClose={() => setIsWorldsOpen(false)}
            onSelectWorld={(id) => {
              setPendingWorldId(id)     // remember which world user clicked
              setIsWorldsOpen(false)    // close first overlay
              setIsLevelsOpen(true)     // open levels overlay
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLevelsOpen && pendingWorldId && (
          <LevelsOverlay
            world={WORLDS.find(w => w.id === pendingWorldId)!}
            activeLevelIndex={pendingWorldId === worldId ? levelIndex : -1}
            onClose={() => {
              setIsLevelsOpen(false)
              setPendingWorldId(null)
            }}
            onSelectLevel={(idx) => {
              setWorldId(pendingWorldId)  // load the world
              setLevelIndex(idx)          // load subworld
              setIsLevelsOpen(false)
              setPendingWorldId(null)
            }}
          />
        )}
      </AnimatePresence>


    </div>
  )
}
function LevelsOverlay({
  world,
  activeLevelIndex,
  onClose,
  onSelectLevel,
}: {
  world: { id: string; title: string; chunking: { pairsPerGame: number }; pool: VocabPair[] }
  activeLevelIndex: number
  onClose: () => void
  onSelectLevel: (levelIndex: number) => void
}) {
  const levels = useMemo(() => {
    const k = world.chunking.pairsPerGame
    const n = Math.ceil(world.pool.length / k)
    return Array.from({ length: n }, (_, i) => {
      const start = i * k
      const end = Math.min(world.pool.length, start + k)
      return { i, start, end }
    })
  }, [world])

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="w-full max-w-lg rounded-2xl bg-neutral-950 border border-neutral-800 p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">
              {world.title} — Levels
            </h2>
            <p className="text-sm text-neutral-300 mt-2">
              Choose a subworld (chunk of {world.chunking.pairsPerGame} pairs).
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-3 max-h-[55vh] overflow-auto pr-1">
          {levels.map((lvl) => {
            const active = lvl.i === activeLevelIndex && world.id === world.id
            return (
              <button
                key={lvl.i}
                type="button"
                onClick={() => onSelectLevel(lvl.i)}
                className={[
                  "w-full text-left rounded-2xl border p-4 transition",
                  "bg-neutral-900/40 hover:bg-neutral-900/60",
                  active ? "border-neutral-300" : "border-neutral-800",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-neutral-50">
                    Nivel {lvl.i + 1}
                  </div>
                  <div className="text-xs text-neutral-300">
                    {lvl.start + 1}–{lvl.end} / {world.pool.length}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}


function ParticleBurst() {
  const particles = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2
    const distance = 28 + (i % 5) * 10
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance

    const glyphs = ["✨", "💥", "✦", "★", "◆", "✶"]
    const glyph = glyphs[i % glyphs.length]

    const colors = [
      "text-yellow-300",
      "text-amber-300",
      "text-pink-300",
      "text-fuchsia-300",
      "text-purple-300",
      "text-cyan-300",
      "text-blue-300",
      "text-lime-300",
    ]
    const color = colors[i % colors.length]

    return { id: i, x, y, glyph, color }
  })

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1.4 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`absolute text-2xl ${p.color} mix-blend-screen`}
        >
          {p.glyph}
        </motion.div>
      ))}
    </div>
  )
}


function MemoryCard({
  model,
  flipped,
  cleared,
  celebrate,
  onClick,
}: {
  model: CardModel
  flipped: boolean
  cleared: boolean
  celebrate: boolean

  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cleared}
      className="relative aspect-square rounded-xl border border-neutral-800 bg-neutral-950/40 shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-neutral-400/40 disabled:opacity-40 disabled:cursor-default"
    >
      {celebrate && <ParticleBurst />}
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
              src="/card/card-back.png"
              alt="card back"
              className="w-35 h-25 opacity-80"
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
                {model.imageSrc ? (
                  <img
                    src={model.imageSrc}
                    alt={model.imageAlt ?? ""}
                    className="w-20 h-20 object-contain"
                  />
                ) : (
                  <div className="text-4xl leading-none">
                    {model.front.title}
                  </div>
                )}
                <div className="mt-2 text-sm font-medium">
                  {model.front.subtitle}
                </div>
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
  subtitle,
  onClose,
  onRestart,
  matchedOrder,
  carouselIndex,
  setCarouselIndex,
  carouselPair,
}: {
  moves: number
  subtitle: string
  onClose: () => void
  onRestart: () => void
  matchedOrder: string[]
  carouselIndex: number
  setCarouselIndex: React.Dispatch<React.SetStateAction<number>>
  carouselPair: VocabPair | null
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-lg rounded-2xl bg-neutral-950 border border-neutral-800 p-6 shadow-xl"
      >
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Lo has logrado 🎉</h2>
          <p className="text-sm text-neutral-300 mt-2">{subtitle}</p>
          <p className="text-sm text-neutral-400 mt-3">
            Movimientos: <span className="text-neutral-100 font-medium">{moves}</span>
          </p>
        </div>

        {/* Revision carousel */}
        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-neutral-100">Revisión</div>
            <div className="text-xs text-neutral-400">
              {matchedOrder.length === 0 ? "0" : carouselIndex + 1}/{matchedOrder.length}
            </div>
          </div>

          {carouselPair ? (
            <>
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
                    <span className="text-neutral-400">Espa:</span>{" "}
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
                  onClick={() => setCarouselIndex((i) => Math.min(matchedOrder.length - 1, i + 1))}
                  disabled={carouselIndex >= matchedOrder.length - 1}
                >
                  →
                </button>
              </div>

              <div className="my-4 border-t border-neutral-800" />

              <div className="text-sm font-medium text-neutral-100">Explicación</div>
              <div className="mt-2 text-xs text-neutral-300 leading-relaxed">
                {carouselPair.explanation ?? "No explanation added yet."}
              </div>
            </>
          ) : (
            <div className="mt-3 text-xs text-neutral-400">
              No pairs found (yet).
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3 justify-center">
          <Button onClick={onRestart}>Jugar de nuevo</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}



function WorldsOverlay({
  worlds,
  activeWorldId,
  onClose,
  onSelectWorld,
}: {
  worlds: Array<{ id: string; title: string; description?: string }>
  activeWorldId: string
  onClose: () => void
  onSelectWorld: (id: string) => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        className="w-full max-w-lg rounded-2xl bg-neutral-950 border border-neutral-800 p-6 shadow-xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-50">🌎 Mundos</h2>
            <p className="text-sm text-neutral-300 mt-2">
              Selecciona un mundo para cargar un nuevo conjunto de vocabulario.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-200 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-3 max-h-[55vh] overflow-auto pr-1">
          {worlds.map((w) => {
            const active = w.id === activeWorldId
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onSelectWorld(w.id)}
                className={[
                  "w-full text-left rounded-2xl border p-4 transition",
                  "bg-neutral-900/40 hover:bg-neutral-900/60",
                  active ? "border-neutral-300" : "border-neutral-800",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-neutral-50">
                    {w.title}
                  </div>
                  {active && (
                    <span className="text-xs rounded-full border border-neutral-700 px-2 py-1 text-neutral-200">
                      Active
                    </span>
                  )}
                </div>

                {w.description && (
                  <div className="mt-1 text-sm text-neutral-300">
                    {w.description}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-sm text-neutral-200 hover:text-white"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ConjugationCard({ conjugation }: { conjugation: any }) {
  return (
    <div className="space-y-4">
      {(conjugation.infinitive || conjugation.translation) && (
        <div className="text-xs text-neutral-300">
          {conjugation.infinitive && (
            <>
              <span className="text-neutral-400">Infinitivo:</span>{" "}
              <span className="font-semibold text-neutral-100">{conjugation.infinitive}</span>
            </>
          )}
          {conjugation.translation && (
            <>
              <span className="mx-2 text-neutral-700">•</span>
              <span className="text-neutral-400">Deutsch:</span>{" "}
              <span className="font-semibold text-neutral-100">{conjugation.translation}</span>
            </>
          )}
        </div>
      )}

      {conjugation.sections?.map((sec: any) => (
        <div key={sec.title} className="rounded-xl border border-neutral-800 bg-neutral-950/20">
          <div className="px-3 py-2 text-xs font-semibold text-neutral-100 border-b border-neutral-800">
            {sec.title}
          </div>

          <div className="divide-y divide-neutral-800">
            {sec.rows?.map((row: [string, string], idx: number) => (
              <div key={idx} className="grid grid-cols-2 gap-2 px-3 py-2 text-xs">
                <div className="text-neutral-200">{row[0]}</div>
                <div className="text-neutral-50 font-semibold">{row[1]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
