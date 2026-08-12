"use client"

import { useRef, useEffect, useMemo, useCallback, useState, memo } from "react"
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"

// ─── Spring config ────────────────────────────────────────────────────────────
// stiffness/damping tuned so press-in is snappy but release has one barely-
// perceptible overshoot — the "elastic material" feel.
const SPRING: Parameters<typeof useSpring>[1] = {
  stiffness: 520,
  damping: 34,
  mass: 0.72,
  restDelta: 0.001,
}

// How long the finger must be held before peek triggers.
// Prevents every scroll-start from flashing the translation.
const PEEK_DELAY_MS = 130

// A press that ends before the peek delay and barely moved is a tap on a word,
// not a peek or a scroll.
const TAP_MOVE_TOLERANCE_PX = 8

// Bottom padding buffer so an expanded translation doesn't feel cramped.
const TRANSLATION_PADDING = 8

// ─── Sentence splitter ───────────────────────────────────────────────────────
// Uses a control character as a temporary split marker so we avoid needing
// lookbehind assertions (Safari <16 compat).
const SENTENCE_MARKER = "\u001F"

function splitSentences(text: string): string[] {
  const marked = text.replace(/([.!?])\s+/g, `$1${SENTENCE_MARKER}`)
  return marked.split(SENTENCE_MARKER).map((s) => s.trim()).filter(Boolean)
}

/** Strip surrounding punctuation so "Rechenzentren." becomes "Rechenzentren". */
function cleanWord(raw: string): string {
  return raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
}

/** Nearest ancestor that actually scrolls; falls back to the document. */
function getScrollParent(node: HTMLElement | null): HTMLElement | Window {
  let el: HTMLElement | null = node?.parentElement ?? null
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el
    }
    el = el.parentElement
  }
  return window
}

// ─── SentenceRow ─────────────────────────────────────────────────────────────
// Renders one source sentence + its always-in-DOM, height-clipped translation.
// All spring-driven values are passed in from the parent so every row animates
// with a single shared spring — zero React re-renders during the animation.

type RowProps = {
  source: string
  target: string
  /** Position in the flattened list of all sentences, used for scroll anchoring. */
  rowIndex: number
  registerHeight: (rowIndex: number, height: number) => void
  /** Shared spring value 0 → 1 */
  spring: MotionValue<number>
  sourceScale: MotionValue<number>
  sourceColor: MotionValue<string>
  transOpacity: MotionValue<number>
  transY: MotionValue<number>
  /** Index into this row's `words` array that is currently highlighted, if any. */
  selectedWordIndex: number | null
}

// Memoized so highlighting a word re-renders only the row losing the highlight
// and the row gaining it, not every sentence in the article.
const SentenceRow = memo(function SentenceRow({
  source,
  target,
  rowIndex,
  registerHeight,
  spring,
  sourceScale,
  sourceColor,
  transOpacity,
  transY,
  selectedWordIndex,
}: RowProps) {
  // Measure the translation's natural height without a state re-render.
  // The transform function closes over naturalHeightRef (object), not over
  // naturalHeightRef.current (value), so it always reads the latest height
  // on every animation frame.
  const innerRef = useRef<HTMLDivElement>(null)
  const naturalHeightRef = useRef(0)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      naturalHeightRef.current = height
      registerHeight(rowIndex, height + TRANSLATION_PADDING)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [rowIndex, registerHeight])

  // Per-row derived height — reads naturalHeightRef dynamically at animation time.
  const clipHeight = useTransform(
    spring,
    (v) => v * (naturalHeightRef.current + TRANSLATION_PADDING)
  )

  const words = useMemo(() => source.split(/(\s+)/), [source])

  return (
    <div data-row-index={rowIndex} data-sentence={source}>
      {/* ── Source sentence (Spanish) ── */}
      <motion.div
        style={{
          scale: sourceScale,
          color: sourceColor,
          transformOrigin: "left center",
          lineHeight: 1.7,
          fontSize: "0.875rem",
        }}
      >
        {/* Wrapped per word so a tap can identify which word was hit. */}
        {words.map((chunk, i) =>
          /^\s+$/.test(chunk) ? (
            chunk
          ) : (
            <span
              key={i}
              data-word={cleanWord(chunk)}
              data-word-index={i}
              // The spread box-shadow gives the highlight breathing room around
              // the glyphs without padding, so nothing reflows when it toggles.
              style={
                selectedWordIndex === i
                  ? {
                      backgroundColor: "rgb(var(--vocado-accent-rgb) / 0.3)",
                      boxShadow: "0 0 0 2px rgb(var(--vocado-accent-rgb) / 0.3)",
                      borderRadius: "3px",
                    }
                  : undefined
              }
            >
              {chunk}
            </span>
          )
        )}
      </motion.div>

      {/* ── Translation clip container ──
          Always in DOM. Height springs from 0 → naturalHeight.
          overflow: hidden clips the content without removing it from the tree,
          so the ResizeObserver can always measure the inner div's true height. */}
      {target ? (
        <motion.div style={{ height: clipHeight, overflow: "hidden" }}>
          <motion.div
            ref={innerRef}
            style={{
              opacity: transOpacity,
              y: transY,
              paddingTop: "4px",
              paddingBottom: "5px",
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                lineHeight: 1.55,
                fontStyle: "italic",
                color: "#1A1A1A",
                paddingLeft: "10px",
                borderLeft: "2.5px solid rgba(92,184,70,0.42)",
              }}
            >
              {target}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  )
})

// ─── Public component ─────────────────────────────────────────────────────────

type Props = {
  /** Source-language paragraphs — what the reader is learning (e.g. Spanish) */
  sourceParagraphs: string[]
  /** Target-language paragraphs — user's native language (e.g. German) */
  targetParagraphs: string[]
  /**
   * Fired when a single word is tapped (not held, not scrolled). `context` is
   * the full sentence the word sits in, so the consumer can disambiguate a word
   * that means different things in different sentences.
   */
  onWordTap?: (
    word: string,
    position: { x: number; y: number },
    context: string
  ) => void
  /**
   * While false, no word stays highlighted — lets the parent drop the highlight
   * when it dismisses whatever the tap opened.
   */
  highlightActive?: boolean
}

export default function InterlinearAccordionReader({
  sourceParagraphs,
  targetParagraphs,
  onWordTap,
  highlightActive = true,
}: Props) {
  // One raw motion value + spring drives the entire reading surface.
  const raw = useMotionValue(0)
  const spring = useSpring(raw, SPRING)
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Height each row's translation will add once expanded, by row index.
  const rowHeightsRef = useRef<number[]>([])
  const registerHeight = useCallback((rowIndex: number, height: number) => {
    rowHeightsRef.current[rowIndex] = height
  }, [])

  // Press bookkeeping for tap-vs-peek discrimination and scroll anchoring.
  const pressRef = useRef<{ x: number; y: number; peeked: boolean } | null>(null)
  // Single active scroll-compensation subscription. Replacing it always tears
  // the previous one down, so a new press during a collapse cannot leave two
  // listeners writing scrollTop against different anchors.
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Which word currently carries the highlight, identified by its row and its
  // index within that row — the same word can appear in several sentences.
  const [selectedWord, setSelectedWord] = useState<{
    rowIndex: number
    wordIndex: number
  } | null>(null)

  useEffect(() => {
    if (!highlightActive) setSelectedWord(null)
  }, [highlightActive])

  const clearAnchor = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }, [])

  const scrollTopOf = (scroller: HTMLElement | Window) =>
    scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop

  const scrollToTop = (scroller: HTMLElement | Window, value: number) => {
    if (scroller === window) window.scrollTo(0, value)
    else (scroller as HTMLElement).scrollTop = value
  }

  /**
   * Expanding every translation pushes the pressed sentence down by the combined
   * height of the translations above it. Compensate by scrolling exactly that
   * much, so the sentence the user is pointing at stays put while everything
   * above moves up and everything below moves down.
   */
  const startAnchoring = useCallback(
    (target: EventTarget | null) => {
      clearAnchor()

      const rowEl = (target as HTMLElement | null)?.closest?.("[data-row-index]") as HTMLElement | null
      const container = containerRef.current
      if (!rowEl || !container) return

      const pressedIndex = Number(rowEl.dataset.rowIndex)
      if (!Number.isFinite(pressedIndex)) return

      const heightAbove = rowHeightsRef.current
        .slice(0, pressedIndex)
        .reduce((sum, h) => sum + (h || 0), 0)
      if (heightAbove <= 0) return

      const scroller = getScrollParent(container)
      const startScroll = scrollTopOf(scroller)

      // Anchor captured by closure, not read from a ref, so this handler keeps
      // using its own values even if another press starts.
      unsubscribeRef.current = spring.on("change", (v) => {
        scrollToTop(scroller, startScroll + v * heightAbove)
      })
    },
    [clearAnchor, spring]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      pressRef.current = { x: e.clientX, y: e.clientY, peeked: false }
      const target = e.target
      peekTimer.current = setTimeout(() => {
        if (pressRef.current) pressRef.current.peeked = true
        startAnchoring(target)
        raw.set(1)
      }, PEEK_DELAY_MS)
    },
    [raw, startAnchoring]
  )

  const endPress = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      if (peekTimer.current) clearTimeout(peekTimer.current)
      const press = pressRef.current
      pressRef.current = null

      // The subscription stays alive through the collapse so the page scrolls
      // back in step with the shrinking translations; it is torn down by the
      // next press or on unmount.
      if (raw.get() !== 0) raw.set(0)

      if (cancelled || !press || press.peeked || !onWordTap) return

      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      if (moved > TAP_MOVE_TOLERANCE_PX) return

      const wordEl = (e.target as HTMLElement | null)?.closest?.("[data-word]") as HTMLElement | null
      const word = wordEl?.dataset.word
      if (!word) return

      const rowEl = wordEl?.closest("[data-row-index]") as HTMLElement | null
      const rowIndex = Number(rowEl?.dataset.rowIndex)
      const wordIndex = Number(wordEl?.dataset.wordIndex)
      setSelectedWord(
        Number.isFinite(rowIndex) && Number.isFinite(wordIndex)
          ? { rowIndex, wordIndex }
          : null
      )

      onWordTap(word, { x: e.clientX, y: e.clientY }, rowEl?.dataset.sentence ?? "")
    },
    [onWordTap, raw]
  )

  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current)
      unsubscribeRef.current?.()
    }
  }, [])

  // Shared derived values — computed once here, consumed by every SentenceRow
  // via motion value subscriptions (no React re-render cascade).
  const sourceScale = useTransform(spring, [0, 1], [1, 0.93])
  const sourceColor = useTransform(spring, [0, 1], ["#2A2A2A", "#7A7A7A"])
  const transOpacity = useTransform(spring, [0, 1], [0, 1])
  const transY = useTransform(spring, [0, 1], [7, 0])

  // Split each paragraph into sentence-level pairs, numbering every sentence
  // across the whole article so scroll anchoring can sum the rows above one.
  const paragraphGroups = useMemo(() => {
    let rowIndex = 0
    return sourceParagraphs.map((srcPara, i) => {
      const tgtPara = targetParagraphs[i] ?? ""
      const srcSents = splitSentences(srcPara)
      const tgtSents = splitSentences(tgtPara)
      return srcSents.map((src, j) => ({
        source: src,
        target: tgtSents[j] ?? "",
        rowIndex: rowIndex++,
      }))
    })
  }, [sourceParagraphs, targetParagraphs])

  if (!sourceParagraphs.length) return null

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => endPress(e, false)}
      onPointerLeave={(e) => endPress(e, true)}
      onPointerCancel={(e) => endPress(e, true)}
      style={{
        touchAction: "pan-y",
        WebkitUserSelect: "none",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {paragraphGroups.map((sentences, pi) => (
        <div
          key={pi}
          style={{
            marginBottom:
              pi < paragraphGroups.length - 1 ? "14px" : 0,
          }}
        >
          {sentences.map((pair, si) => (
            <SentenceRow
              key={`${pi}-${si}`}
              source={pair.source}
              target={pair.target}
              rowIndex={pair.rowIndex}
              registerHeight={registerHeight}
              spring={spring}
              sourceScale={sourceScale}
              sourceColor={sourceColor}
              transOpacity={transOpacity}
              transY={transY}
              selectedWordIndex={
                selectedWord?.rowIndex === pair.rowIndex
                  ? selectedWord.wordIndex
                  : null
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}
