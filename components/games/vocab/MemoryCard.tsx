"use client"

import { motion } from "framer-motion"
import type { CardModel } from "./types"

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
      className="relative aspect-square rounded-xl border border-neutral-800 bg-neutral-950/40 shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-neutral-400/40 disabled:opacity-40 disabled:cursor-default touch-manipulation"
    >
      {celebrate && <ParticleBurst />}

      {cleared ? (
        <div className="absolute inset-0 flex items-center justify-center">
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
              <div className="px-2 text-center">
                <div
                  className="text-[clamp(0.7rem,3.2vw,1rem)] sm:text-[clamp(0.85rem,2.2vw,1.15rem)] font-semibold tracking-tight leading-tight break-words"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {model.front.title}
                </div>
              </div>
            ) : (
              <div className="px-2 text-center flex flex-col items-center">
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

                <div
                  className="mt-2 text-[clamp(0.65rem,2.6vw,0.95rem)] sm:text-[clamp(0.75rem,2vw,1rem)] font-medium leading-tight break-words"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
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
