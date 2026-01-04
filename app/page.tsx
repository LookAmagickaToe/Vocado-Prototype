"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

import family from "@/data/worlds/family.json"
import basic_verbs from "@/data/worlds/basic_verbs.json"
import verbs_conjugation from "@/data/worlds/verbs_conjugation.json"
import verbs_conjugation_espanol from "@/data/worlds/verbs_conjugation_espanol.json"
import kitchen_utensils from "@/data/worlds/kitchen_utensils.json"
import social_relationships from "@/data/worlds/social_relationships.json"
import basic_english from "@/data/worlds/basic_english.json"
import new_year from "@/data/worlds/new_year.json"

import { formatTemplate } from "@/lib/ui"
import VocabMemoryGame from "@/components/games/VocabMemoryGame"
import phrases_basic from "@/data/worlds/phrases_basic.json"
import PhraseMemoryGame from "@/components/games/PhraseMemoryGame"
import type { World } from "@/types/worlds"


//Adapt here for verbs
const WORLDS = [basic_verbs, family, phrases_basic, verbs_conjugation, 
  verbs_conjugation_espanol, social_relationships, kitchen_utensils, new_year,
basic_english] as unknown as World[]


function extractVerbLabelFromPair(p: { id: string; es: string }) {
  // Prefer "(sein)" from the ES string
  const m = p.es.match(/\(([^)]+)\)/)
  if (m?.[1]) return m[1].trim()

  // Fallback: from id "sein_1ps" -> "sein"
  const prefix = p.id.split("_")[0]
  return prefix || ""
}

export default function Page() {
  const [worldId, setWorldId] = useState<string>(WORLDS[0]?.id ?? "world-0")
  const [levelIndex, setLevelIndex] = useState<number>(0)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isWorldsOpen, setIsWorldsOpen] = useState(false)
  const [isLevelsOpen, setIsLevelsOpen] = useState(false)
  const [pendingWorldId, setPendingWorldId] = useState<string | null>(null)

  // used to force-remount the game (restart) without touching game internals
  const [gameSeed, setGameSeed] = useState(0)

  const currentWorld = useMemo(() => {
    return WORLDS.find((w) => w.id === worldId) ?? WORLDS[0]
  }, [worldId])

  const levelsCount = useMemo(() => {
    const k = currentWorld.chunking.itemsPerGame
    return Math.max(1, Math.ceil(currentWorld.pool.length / k))
  }, [currentWorld])

    const worldTitle = currentWorld.title
    const safeLevel = Math.min(levelIndex, levelsCount - 1) + 1




  const openWorlds = () => {
    setIsWorldsOpen(true)
    setIsMenuOpen(false)
  }

  const restart = () => {
    setGameSeed((s) => s + 1)
  }

  const nextLevel = () => {
    setLevelIndex((i) => {
        const next = i + 1
        return next >= levelsCount ? 0 : next // wrap to level 0 (or clamp if you prefer)
    })
    setGameSeed((s) => s + 1) // force remount so the game resets cleanly
    }
    const headerInstructions =
        currentWorld.ui?.page?.instructions ??
        currentWorld.description ??
        (currentWorld.mode === "vocab"
            ? "Empareja las palabras en español con las palabras en alemán."
            : "Construye la frase en el orden correcto.")

    const currentChunk = useMemo(() => {
    const k = currentWorld.chunking.itemsPerGame
    const start = Math.min(levelIndex, levelsCount - 1) * k
    return currentWorld.pool.slice(start, start + k)
    }, [currentWorld, levelIndex, levelsCount])

    const chunkVerb = useMemo(() => {
    if (currentWorld.mode !== "vocab") return ""
    const first = currentChunk[0]
    if (!first) return ""
    // types: VocabPair has id + es, safe here because mode === "vocab"
    return extractVerbLabelFromPair(first as any)
    }, [currentWorld.mode, currentChunk])
    
    const levelLabelTemplate =
    currentWorld.ui?.header?.levelLabelTemplate ?? "Nivel {i}/{n}"
    const currentVerb =
    currentWorld.mode === "vocab"
        ? extractVerbLabelFromPair(
            (currentWorld.pool[Math.min(levelIndex, levelsCount - 1) * currentWorld.chunking.itemsPerGame] as any)
        )
        : ""

    const levelLabel = formatTemplate(levelLabelTemplate, {
    i: safeLevel,
    n: levelsCount,
    verb: currentVerb,
    })

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
                    onClick={openWorlds}
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

          {/* CENTER HEADER */}
          <div className="col-span-12 md:col-span-10 md:col-start-3 md:row-start-1">
            <div className="w-full">
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                    voc<span className="text-green-500">ado</span>
                </h1>                  
                <div className="mt-1 text-sm text-neutral-300">
                    {worldTitle} — {levelLabel}
                  </div>
                    <p className="text-sm text-neutral-300 mt-1">
                        {headerInstructions}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={restart} className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reanudar
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* GAME AREA (center+right is inside the component) */}
          <div className="col-span-12 md:col-span-10 md:col-start-3 md:row-start-2">
            {currentWorld.mode === "vocab" ? (
                <VocabMemoryGame
                key={`${worldId}:${levelIndex}:${gameSeed}`}
                world={currentWorld}
                levelIndex={Math.min(levelIndex, levelsCount - 1)}
                onNextLevel={nextLevel}
                />
            ) : (
                <PhraseMemoryGame
                key={`${worldId}:${levelIndex}:${gameSeed}`}
                world={currentWorld}
                levelIndex={Math.min(levelIndex, levelsCount - 1)}
                onNextLevel={nextLevel}
                />
            )}
            </div>
        </div>
      </div>

      {/* WORLDS OVERLAY */}
      <AnimatePresence>
        {isWorldsOpen && (
          <WorldsOverlay
            worlds={WORLDS}
            activeWorldId={worldId}
            onClose={() => setIsWorldsOpen(false)}
            onSelectWorld={(id) => {
              setPendingWorldId(id)
              setIsWorldsOpen(false)
              setIsLevelsOpen(true)
            }}
          />
        )}
      </AnimatePresence>

      {/* LEVELS OVERLAY */}
      <AnimatePresence>
        {isLevelsOpen && pendingWorldId && (
          <LevelsOverlay
            world={WORLDS.find((w) => w.id === pendingWorldId)!}
            activeLevelIndex={pendingWorldId === worldId ? levelIndex : -1}
            onClose={() => {
              setIsLevelsOpen(false)
              setPendingWorldId(null)
            }}
            onSelectLevel={(idx) => {
              // order matters: set world, then level, then restart game
              setWorldId(pendingWorldId)
              setLevelIndex(idx)
              setGameSeed((s) => s + 1)
              setIsLevelsOpen(false)
              setPendingWorldId(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
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
                  <div className="text-base font-semibold text-neutral-50">{w.title}</div>
                  {active && (
                    <span className="text-xs rounded-full border border-neutral-700 px-2 py-1 text-neutral-200">
                      Active
                    </span>
                  )}
                </div>

                {w.description && <div className="mt-1 text-sm text-neutral-300">{w.description}</div>}
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

function LevelsOverlay({
  world,
  activeLevelIndex,
  onClose,
  onSelectLevel,
}: {
  world: World
  activeLevelIndex: number
  onClose: () => void
  onSelectLevel: (levelIndex: number) => void
}) {
    const levelItemTemplate = world.ui?.header?.levelItemTemplate ?? "Nivel {i}"

    const levels = useMemo(() => {
    const k = world.chunking.itemsPerGame
    const n = Math.max(1, Math.ceil(world.pool.length / k))
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
                {world.description ?? `Choose a subworld (chunk of ${world.chunking.itemsPerGame} items).`}
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
            const active = lvl.i === activeLevelIndex
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
                        {formatTemplate(levelItemTemplate, {
                            i: lvl.i + 1,
                            verb:
                            world.mode === "vocab"
                                ? extractVerbLabelFromPair(world.pool[lvl.start] as any)
                                : "",
                        })}
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
