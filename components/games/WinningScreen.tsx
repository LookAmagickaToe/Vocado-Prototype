// WinningScreen.tsx
"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import ConjugationCard from "@/components/games/vocab/ConjugationCard"
import { Conjugation } from "@/types/worlds"

type ReviewCarouselItem = {
  id: string
  image:
    | { type: "emoji"; value: string }
    | { type: "image"; src: string; alt?: string }
  primaryLabel: string
  secondaryLabel: string
  explanation?: string
  conjugation?: Conjugation // keep for vocab-basic per-item tables if you want
}

export default function WinningScreen({
  moves,
  subtitle,
  onClose,
  onRestart,
  onNext,
  nextLabel,

  title = "Lo has logrado 🎉",
  movesLabel = "Movimientos",
  explanationTitle = "Explicación",
  conjugationTitle = "Conjugación",
  primaryCaption = "Español:",
  secondaryCaption = "Alemán:",
  nextLabelDefault = "Siguiente",
  closeLabelDefault = "Cerrar",
  emptyCarouselText = "No se encontraron elementos (todavía).",

  explanation,

  // carousel (old)
  matchedOrder,
  carouselIndex,
  setCarouselIndex,
  carouselItem,
  reviewTitle = "Revisión",

  // ✅ NEW (single tile + single table)
  summaryItem,
  conjugation,
  awardSummary,
}: {
  moves: number
  subtitle: string
  onClose: () => void
  onRestart?: () => void

  onNext?: () => void
  nextLabel?: string

  explanation?: string

  matchedOrder?: string[]
  carouselIndex?: number
  setCarouselIndex?: React.Dispatch<React.SetStateAction<number>>
  carouselItem?: ReviewCarouselItem | null
  reviewTitle?: string

  summaryItem?: ReviewCarouselItem | null
  conjugation?: Conjugation
  awardSummary?: { payout: number; totalBefore: number; totalAfter: number }

  title?: string
  movesLabel?: string
  explanationTitle?: string
  conjugationTitle?: string
  primaryCaption?: string
  secondaryCaption?: string
  nextLabelDefault?: string
  closeLabelDefault?: string
  emptyCarouselText?: string
}) {
  const hasSummary = !!summaryItem
  const [hasMergedAward, setHasMergedAward] = useState(false)

  useEffect(() => {
    if (!awardSummary) return
    setHasMergedAward(false)
    const timer = window.setTimeout(() => setHasMergedAward(true), 3000)
    return () => window.clearTimeout(timer)
  }, [awardSummary])

  const hasCarousel =
    !hasSummary && // ✅ if summary is provided, NEVER show carousel
    !!matchedOrder &&
    matchedOrder.length > 0 &&
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
        className="relative w-full max-w-lg h-[78vh] max-h-[720px] rounded-2xl bg-neutral-950 border border-neutral-800 p-6 shadow-xl flex flex-col"
      >
        {awardSummary && (
          <div className="absolute right-5 top-5 flex items-center gap-3">
            <motion.div
              initial={{ x: 0, opacity: 1, scale: 1 }}
              animate={{
                x: hasMergedAward ? 32 : 0,
                opacity: hasMergedAward ? 0 : 1,
                scale: hasMergedAward ? 0.9 : 1,
              }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 shadow"
            >
              +{awardSummary.payout} 🌱
            </motion.div>
            <div className="rounded-full border border-neutral-800 bg-neutral-950/70 px-3 py-1 text-xs font-semibold text-neutral-100 shadow">
              <motion.span
                key={hasMergedAward ? "after" : "before"}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {hasMergedAward ? awardSummary.totalAfter : awardSummary.totalBefore}
              </motion.span>{" "}
              🌱
            </div>
          </div>
        )}
        <div className="text-center">
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="text-sm text-neutral-300 mt-2">{subtitle}</p>
          <p className="text-sm text-neutral-400 mt-3">
            {movesLabel}:{" "}
            <span className="text-neutral-100 font-medium">{moves}</span>
          </p>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto pr-2 -mr-2">
          {explanation && (
            <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-sm font-medium text-neutral-100">{explanationTitle}</div>
              <div className="mt-2 text-xs text-neutral-300 leading-relaxed">{explanation}</div>
            </div>
          )}

          {/* ✅ SINGLE TILE (for conjugation game) */}
          {hasSummary && (
            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-sm font-medium text-neutral-100">{reviewTitle}</div>

              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/30 p-4 text-center">
                <div className="flex justify-center">
                  {summaryItem!.image.type === "emoji" ? (
                    <div className="text-5xl">{summaryItem!.image.value}</div>
                  ) : (
                    <img
                      src={summaryItem!.image.src}
                      alt={summaryItem!.image.alt ?? "summary image"}
                      className="h-20 w-20 object-contain"
                    />
                  )}
                </div>

                <div className="mt-3 text-sm">
                  <span className="text-neutral-400">{primaryCaption}</span>{" "}
                  <span className="font-semibold">{summaryItem!.primaryLabel}</span>
                </div>

                <div className="text-sm">
                  <span className="text-neutral-400">{secondaryCaption}</span>{" "}
                  <span className="font-semibold">{summaryItem!.secondaryLabel}</span>
                </div>
              </div>

              {summaryItem!.explanation && (
                <>
                  <div className="my-4 border-t border-neutral-800" />
                  <div className="text-sm font-medium text-neutral-100">{explanationTitle}</div>
                  <div className="mt-2 text-xs text-neutral-300 leading-relaxed">
                    {summaryItem!.explanation}
                  </div>
                </>
              )}

              {/* ✅ table ONCE */}
              {conjugation && (
                <>
                  <div className="my-4 border-t border-neutral-800" />
                  <div className="text-sm font-medium text-neutral-100">{conjugationTitle}</div>
                  <div className="mt-2">
                    <ConjugationCard conjugation={conjugation} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* OLD: Revision carousel (kept for vocab worlds) */}
          {hasCarousel && (
            <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-100">{reviewTitle}</div>
                <div className="text-xs text-neutral-400">
                  {matchedOrder!.length === 0 ? "0" : carouselIndex! + 1}/{matchedOrder!.length}
                </div>
              </div>

              {carouselItem ? (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm disabled:opacity-40"
                      onClick={() => setCarouselIndex!((i) => Math.max(0, i - 1))}
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
                        <span className="text-neutral-400">{primaryCaption}</span>{" "}
                        <span className="font-semibold">{carouselItem.primaryLabel}</span>
                      </div>

                      <div className="text-sm">
                        <span className="text-neutral-400">{secondaryCaption}</span>{" "}
                        <span className="font-semibold">{carouselItem.secondaryLabel}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm disabled:opacity-40"
                      onClick={() =>
                        setCarouselIndex!((i) => Math.min(matchedOrder!.length - 1, i + 1))
                      }
                      disabled={carouselIndex! >= matchedOrder!.length - 1}
                    >
                      →
                    </button>
                  </div>

                  <div className="my-4 border-t border-neutral-800" />

                  <div className="text-sm font-medium text-neutral-100">{explanationTitle}</div>
                  <div className="mt-2 text-xs text-neutral-300 leading-relaxed">
                    {carouselItem.explanation ?? "No explanation added yet."}

                    {carouselItem.conjugation ? (
                      <>
                        <div className="my-4 border-t border-neutral-800" />
                        <div className="text-sm font-medium text-neutral-100">{conjugationTitle}</div>
                        <div className="mt-2">
                          <ConjugationCard conjugation={carouselItem.conjugation} />
                        </div>
                      </>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-xs text-neutral-400">{emptyCarouselText}</div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3 justify-center">
          {onNext && (
            <Button
              onClick={onNext}
              className="border border-neutral-800 bg-neutral-900/40 text-neutral-100 hover:bg-neutral-900/60"
            >
              {nextLabel ?? nextLabelDefault}
            </Button>
          )}

          <Button onClick={onClose} className="bg-transparent text-neutral-300 hover:text-neutral-50">
            {closeLabelDefault}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
