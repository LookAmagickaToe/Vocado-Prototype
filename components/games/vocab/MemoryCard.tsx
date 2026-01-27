"use client"

import { motion } from "framer-motion"
import type { CardModel } from "./types"
import AutoFitText from "@/components/ui/auto-fit-text"

function ParticleBurst() {
  const particles = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2
    const distance = 28 + (i % 5) * 10
    const x = Math.cos(angle) * distance
    const y = Math.sin(angle) * distance

    const glyphs = ["✦", "★", "✶", "✷", "✹", "✺"]
    const glyph = glyphs[i % glyphs.length]

    const colors = [
      "text-yellow-500",
      "text-yellow-400",
      "text-amber-400",
      "text-sky-400",
      "text-sky-300",
      "text-blue-300",
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
          className={`absolute text-3xl ${p.color} opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]`}
        >
          {p.glyph}
        </motion.div>
      ))}
    </div>
  )
}

export default function MemoryCard({
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
      className="relative aspect-square rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)] disabled:opacity-40 disabled:cursor-default touch-manipulation"
    >
      {celebrate && <ParticleBurst />}

      {cleared ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-[rgb(var(--vocado-accent-rgb))] text-2xl">✓</div>
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
            <img
              src="/card/card-back.png"
              alt="card back"
              className="max-w-[70%] max-h-[70%] object-contain opacity-80"
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
              <div className="h-full w-full px-2 text-center flex items-center justify-center">
                <AutoFitText
                  text={model.front.title}
                  maxPx={18}
                  minPx={5}
                  lineHeight={1.05}
                  className="w-full font-semibold tracking-tight leading-tight"
                />
              </div>
            ) : (
              <div className="h-full w-full px-2 text-center flex flex-col items-center justify-center gap-2">
                {model.imageSrc ? (
                  <img
                    src={model.imageSrc}
                    alt={model.imageAlt ?? ""}
                    className="max-h-[55%] max-w-[70%] w-auto object-contain"
                  />
                ) : (
                  <div className="text-[clamp(1.4rem,6vw,2.6rem)] leading-none">
                    {model.front.title}
                  </div>
                )}

                {model.front.subtitle ? (
                  <AutoFitText
                    text={model.front.subtitle}
                    maxPx={14}
                    minPx={5}
                    lineHeight={1.05}
                    className="w-full max-h-[35%] font-medium leading-tight"
                  />
                ) : null}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </button>
  )
}
