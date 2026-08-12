"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { ArrowLeft, Bookmark, BookmarkCheck } from "lucide-react"

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#F9F9F8",
  body: "#1E293B",       // slate-800
  muted: "#64748B",      // slate-500
  dimmed: "#94A3B8",     // slate-400 — source text while peeking
  translation: "#047857", // emerald-700
  accent: "#10B981",     // emerald-500
} as const

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const

// ─── Sentence splitting ───────────────────────────────────────────────────────
function splitSentences(text: string): string[] {
  const marked = text.replace(/([.!?])\s+/g, "$1")
  return marked.split("").map((s) => s.trim()).filter(Boolean)
}

function buildParagraphs(
  source: string[],
  target: string[]
): Array<Array<{ original: string; translated: string }>> {
  return source.map((srcPara, i) => {
    const tgtPara = target[i] ?? ""
    const src = splitSentences(srcPara)
    const tgt = splitSentences(tgtPara)
    return src.map((original, j) => ({ original, translated: tgt[j] ?? "" }))
  })
}

// ─── Single paragraph ─────────────────────────────────────────────────────────
function ParagraphBlock({
  sentences,
  index,
  peekingIndex,
  setPeekingIndex,
}: {
  sentences: Array<{ original: string; translated: string }>
  index: number
  peekingIndex: number | null
  setPeekingIndex: (n: number | null) => void
}) {
  const isPeeking = peekingIndex === index

  return (
    <motion.div
      layout
      className="mb-10"
      style={{ touchAction: "pan-y", cursor: "default", userSelect: "none", WebkitUserSelect: "none" }}
      onPointerDown={() => setPeekingIndex(index)}
      onPointerUp={() => setPeekingIndex(null)}
      onPointerLeave={() => setPeekingIndex(null)}
      onPointerCancel={() => setPeekingIndex(null)}
      transition={SPRING}
    >
      {isPeeking ? (
        // ── Peek mode: each sentence on its own line, translation below ──
        sentences.map((s, si) => (
          <div key={si}>
            <motion.p
              layout
              initial={false}
              animate={{ color: C.dimmed, scale: 0.96 }}
              transition={SPRING}
              style={{
                transformOrigin: "left center",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "1.15rem",
                lineHeight: 1.8,
              }}
            >
              {s.original}
            </motion.p>

            <AnimatePresence>
              {s.translated && (
                <motion.div
                  key="t"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={SPRING}
                  style={{ overflow: "hidden" }}
                >
                  <p
                    style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "1.05rem",
                      lineHeight: 1.75,
                      color: C.translation,
                      fontStyle: "italic",
                      marginTop: "0.25rem",
                      marginBottom: "0.75rem",
                      paddingLeft: "12px",
                      borderLeft: `2px solid ${C.translation}40`,
                    }}
                  >
                    {s.translated}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))
      ) : (
        // ── Reading mode: all sentences inline, natural text flow ──
        <motion.p
          layout
          initial={false}
          animate={{ color: C.body }}
          transition={SPRING}
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "1.15rem",
            lineHeight: 1.8,
            color: C.body,
          }}
        >
          {sentences.map((s, si) => (
            <span key={si}>
              {s.original}
              {si < sentences.length - 1 ? " " : ""}
            </span>
          ))}
        </motion.p>
      )}
    </motion.div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────
export type ZeitungReaderProps = {
  title: string
  date: string
  sourceParagraphs: string[]  // e.g. Spanish
  targetParagraphs: string[]  // e.g. German
  sourceLabel: string         // e.g. "Español"
  targetLabel: string         // e.g. "Alemán"
  seeds?: number
  isSaved: boolean
  showTranslation: boolean
  newsUrl?: string
  onBack: () => void
  onSave: () => Promise<void> | void
  onPlay: () => void
  onToggleLanguage: (v: boolean) => void
}

export default function ZeitungReader({
  title,
  date,
  sourceParagraphs,
  targetParagraphs,
  sourceLabel,
  targetLabel,
  seeds,
  isSaved,
  showTranslation,
  newsUrl,
  onBack,
  onSave,
  onPlay,
  onToggleLanguage,
}: ZeitungReaderProps) {
  const [peekingIndex, setPeekingIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const paragraphs = useMemo(
    () => buildParagraphs(sourceParagraphs, targetParagraphs),
    [sourceParagraphs, targetParagraphs]
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
    } finally {
      setSaving(false)
    }
  }

  // Format date nicely
  const formattedDate = useMemo(() => {
    if (!date) return ""
    try {
      const d = new Date(date)
      return new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(d)
    } catch {
      return date
    }
  }, [date])

  return (
    // Full-screen overlay — sits above NavFooter and all other UI
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ backgroundColor: C.bg }}
    >
      {/* ── Layer 1: Header ────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5"
        style={{
          backgroundColor: `${C.bg}e8`,
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 700,
              color: C.body,
              fontSize: "1.05rem",
              lineHeight: 1.2,
            }}
          >
            Vocado Zeitung
          </div>
          {formattedDate && (
            <div
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic",
                fontSize: "0.8rem",
                color: C.muted,
                marginTop: "1px",
              }}
            >
              {formattedDate}
            </div>
          )}
        </div>

        {seeds != null && (
          <div className="flex items-center gap-1 text-sm" style={{ color: C.muted }}>
            <span className="font-medium tabular-nums">{seeds}</span>
            <span style={{ color: C.accent }}>✓</span>
          </div>
        )}
      </header>

      {/* ── Layer 2: Floating Action Bar ───────────────────────────────── */}
      <div
        className="sticky z-10 flex justify-center px-4"
        style={{ top: "61px", paddingTop: "10px", paddingBottom: "10px", pointerEvents: "none" }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5 shadow-sm"
          style={{
            backgroundColor: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.55)",
            pointerEvents: "auto",
          }}
        >
          {/* Back */}
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
            style={{ color: C.muted }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-200" />

          {/* Language toggle */}
          <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ backgroundColor: "#F1F5F9" }}>
            {[
              { label: sourceLabel, value: true },
              { label: targetLabel, value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                type="button"
                onClick={() => onToggleLanguage(value)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={
                  showTranslation === value
                    ? { backgroundColor: "#fff", color: C.body, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                    : { color: C.muted }
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-200" />

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors hover:bg-slate-100 disabled:opacity-50"
            style={{ color: isSaved ? C.accent : C.muted }}
          >
            {isSaved ? (
              <BookmarkCheck className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>

          {/* Play */}
          <button
            type="button"
            onClick={onPlay}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: C.accent }}
          >
            🚀 <span>Spielen</span>
          </button>
        </div>
      </div>

      {/* ── Layer 3: Article ───────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-6 pt-8 pb-32">
        {/* Title */}
        {title && (
          <h1
            className="mb-10"
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
              fontWeight: 700,
              color: C.body,
              lineHeight: 1.25,
            }}
          >
            {title}
          </h1>
        )}

        {/* Paragraphs */}
        <LayoutGroup>
          {paragraphs.map((sentences, i) => (
            <ParagraphBlock
              key={i}
              sentences={sentences}
              index={i}
              peekingIndex={peekingIndex}
              setPeekingIndex={setPeekingIndex}
            />
          ))}
        </LayoutGroup>

        {/* Source URL */}
        {newsUrl && (
          <div
            className="mt-10 pt-6 border-t text-xs"
            style={{ borderColor: "rgba(0,0,0,0.07)", color: C.muted }}
          >
            Quelle: {newsUrl}
          </div>
        )}
      </main>
    </div>
  )
}
