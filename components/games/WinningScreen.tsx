"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import ConjugationCard from "@/components/games/vocab/ConjugationCard"
import { Conjugation } from "@/types/worlds"


type ReviewCarouselItem = {
  id: string
  image:
    | { type: "emoji"; value: string }
    | { type: "image"; src: string; alt?: string }
  primaryLabel: string // e.g. Spanish
  secondaryLabel: string // e.g. German
  explanation?: string
  conjugation?: Conjugation

}

export default function WinningScreen({
  moves,
  subtitle,
  onClose,
  onRestart,

  // ✅ add these here
  onNext,
  nextLabel,
  primaryLabel,
  secondaryLabel,

    explanation,

  matchedOrder,
  carouselIndex,
  setCarouselIndex,
  carouselItem,
  reviewTitle = "Revisión",
}: {
  moves: number
  subtitle: string
  onClose: () => void
  onRestart: () => void

  onNext?: () => void
  nextLabel?: string
  primaryLabel?: string
  secondaryLabel?: string
  
  explanation?: string

  matchedOrder?: string[]
  carouselIndex?: number
  setCarouselIndex?: React.Dispatch<React.SetStateAction<number>>
  carouselItem?: ReviewCarouselItem | null
  reviewTitle?: string
}) {
  const hasCarousel =
    !!matchedOrder &&
    typeof carouselIndex === "number" &&
    !!setCarouselIndex

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-lg h-[78vh] max-h-[720px] rounded-2xl bg-neutral-950 border border-neutral-800 p-6 shadow-xl flex flex-col"
      >
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Lo has logrado 🎉</h2>
          <p className="text-sm text-neutral-300 mt-2">{subtitle}</p>
          <p className="text-sm text-neutral-400 mt-3">
            Movimientos:{" "}
            <span className="text-neutral-100 font-medium">{moves}</span>
          </p>
        </div>
        <div className="mt-6 flex-1 overflow-y-auto pr-2 -mr-2">
            {explanation && (
                <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
                    <div className="text-sm font-medium text-neutral-100">Explicación</div>
                    <div className="mt-2 text-xs text-neutral-300 leading-relaxed">
                    {explanation}
                    </div>
                </div>
                )}

            {/* Revision carousel (optional) */}
            {hasCarousel && (
            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
                <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-100">
                    {reviewTitle}
                </div>
                <div className="text-xs text-neutral-400">
                    {matchedOrder.length === 0 ? "0" : carouselIndex + 1}/{matchedOrder.length}
                </div>
                </div>

                {carouselItem ? (
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
                        {carouselItem.image.type === "emoji" ? (
                            <div className="text-5xl">{carouselItem.image.value}</div>
                        ) : (
                            <img
                            src={carouselItem.image.src}
                            alt={carouselItem.image.alt ?? "review image"}
                            className="h-20 w-20 object-contain"
                            />
                        )}
                        </div>

                        <div className="mt-3 text-sm">
                        <span className="text-neutral-400">Español:</span>{" "}
                        <span className="font-semibold">{carouselItem.primaryLabel}</span>
                        </div>

                        <div className="text-sm">
                        <span className="text-neutral-400">Aleman:</span>{" "}
                        <span className="font-semibold">{carouselItem.secondaryLabel}</span>
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

                    <div className="my-4 border-t border-neutral-800" />

                    <div className="text-sm font-medium text-neutral-100">Explicación</div>
                    <div className="mt-2 text-xs text-neutral-300 leading-relaxed">
                    {carouselItem.explanation ?? "No explanation added yet."}
                    {carouselItem.conjugation ? (
                        <>
                            <div className="my-4 border-t border-neutral-800" />
                            <div className="text-sm font-medium text-neutral-100">Conjugación</div>
                            <div className="mt-2">
                            <ConjugationCard conjugation={carouselItem.conjugation} />
                            </div>
                        </>
                        ) : null}
                    </div>
                </>
                ) : (
                <div className="mt-3 text-xs text-neutral-400">
                No se encontraron elementos (todavía).
                </div>
                )}
            </div>
            )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3 justify-center">
            <Button
            onClick={onNext}
            className="border border-neutral-800 bg-neutral-900/40 text-neutral-100 hover:bg-neutral-900/60"
            >
            {nextLabel ?? "Siguiente"}
            </Button>

            <Button
            onClick={onClose}
            className="bg-transparent text-neutral-300 hover:text-neutral-50"
            >
            {secondaryLabel ?? "Cerrar"}
            </Button>

            </div>
      </motion.div>
    </motion.div>
  )
}
