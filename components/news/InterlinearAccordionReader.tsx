"use client"

import { useRef, useEffect, useMemo, useCallback, useState, memo } from "react"
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"
import {
  buildRows,
  cleanWord,
  isWhitespaceChunk,
  splitWords,
} from "@/lib/news/segment"
import { normalizeWord } from "@/lib/words"
import { Pin, Volume2 } from "lucide-react"

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

// ─── Drag-to-listen ──────────────────────────────────────────────────────────
// Once the translation has peeked, dragging either way charges a ring. Left
// pins the sentence; right pins and reads it aloud. Distance is the charge, so
// there is no timer to wait out and nothing to aim at — the ring shows where
// you are heading, and dragging back cancels.

/** Horizontal travel that fills the ring completely. */
const CHARGE_DISTANCE_PX = 56

const RING_DIAMETER_PX = 36

/** Movement below this is noise; past it, the dominant axis claims the press. */
const AXIS_LOCK_PX = 10

// ─── ChargeRing ──────────────────────────────────────────────────────────────
// Position and fill are both motion values, so the whole drag runs without a
// single React re-render — same discipline as the peek animation below.

type ChargeRingProps = {
  x: MotionValue<number>
  y: MotionValue<number>
  /** 0 → 1 as the finger travels in the selected horizontal direction. */
  charge: MotionValue<number>
  action: "pin" | "play"
}

const RADIUS = RING_DIAMETER_PX / 2 - 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const ChargeRing = memo(function ChargeRing({ x, y, charge, action }: ChargeRingProps) {
  // Ring empties clockwise from the top as charge rises.
  const dashOffset = useTransform(charge, (v) => CIRCUMFERENCE * (1 - v))
  const opacity = useTransform(charge, [0, 0.04, 1], [0, 1, 1])
  const scale = useTransform(charge, [0, 1], [0.82, 1])
  // The speaker only appears once the gesture would actually fire, so the ring
  // reads as "keep going" until it reads as "let go".
  const glyphOpacity = useTransform(charge, [0.85, 1], [0, 1])

  return (
    <motion.div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        x,
        y,
        opacity,
        scale,
        width: RING_DIAMETER_PX,
        height: RING_DIAMETER_PX,
        minWidth: RING_DIAMETER_PX,
        maxWidth: RING_DIAMETER_PX,
        aspectRatio: "1 / 1",
        marginLeft: -RING_DIAMETER_PX / 2,
        marginTop: -RING_DIAMETER_PX / 2,
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <svg width={RING_DIAMETER_PX} height={RING_DIAMETER_PX}>
        <circle
          cx={RING_DIAMETER_PX / 2}
          cy={RING_DIAMETER_PX / 2}
          r={RADIUS}
          fill="rgb(255 255 255 / 0.92)"
          stroke="rgb(var(--vocado-accent-rgb) / 0.18)"
          strokeWidth={2.5}
        />
        <motion.circle
          cx={RING_DIAMETER_PX / 2}
          cy={RING_DIAMETER_PX / 2}
          r={RADIUS}
          fill="none"
          stroke="rgb(var(--vocado-accent-rgb))"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          style={{ strokeDashoffset: dashOffset }}
          transform={`rotate(-90 ${RING_DIAMETER_PX / 2} ${RING_DIAMETER_PX / 2})`}
        />
      </svg>
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          opacity: glyphOpacity,
        }}
      >
        {action === "play" ? <Volume2 size={15} /> : <Pin size={14} />}
      </motion.div>
    </motion.div>
  )
})

// ─── SentenceRow ─────────────────────────────────────────────────────────────
// Renders one source sentence + its always-in-DOM, height-clipped translation.
// Each row owns its spring so a hold can open only the sentence being touched.

type RowProps = {
  source: string
  target: string
  /** Position in the flattened list of all sentences, used for scroll anchoring. */
  rowIndex: number
  open: boolean
  marked: boolean
  vocabularyWords: Set<string>
  /** Index into this row's `words` array that is currently highlighted, if any. */
  selectedWordIndex: number | null
  /** Word currently being spoken in this row, for the karaoke highlight. */
  spokenWordIndex: number | null
  /**
   * True while this row's audio plays. Its translation stays open independently
   * of the shared peek spring, so the reader can follow along after releasing.
   */
  pinnedOpen: boolean
}

// Memoized so highlighting a word re-renders only the row losing the highlight
// and the row gaining it, not every sentence in the article.
const SentenceRow = memo(function SentenceRow({
  source,
  target,
  rowIndex,
  open,
  marked,
  vocabularyWords,
  selectedWordIndex,
  spokenWordIndex,
  pinnedOpen,
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
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const openTarget = useMotionValue(open || pinnedOpen ? 1 : 0)
  useEffect(() => {
    openTarget.set(open || pinnedOpen ? 1 : 0)
  }, [open, pinnedOpen, openTarget])
  const openness = useSpring(openTarget, SPRING)

  // Per-row derived height — reads naturalHeightRef dynamically at animation time.
  const clipHeight = useTransform(
    openness,
    (v) => v * (naturalHeightRef.current + TRANSLATION_PADDING)
  )
  const rowTransOpacity = useTransform(openness, [0, 0.35, 1], [0, 0.15, 1])
  const rowTransY = useTransform(openness, [0, 1], [7, 0])

  const words = useMemo(() => splitWords(source), [source])

  return (
    <div
      data-row-index={rowIndex}
      data-sentence={source}
      style={{
        borderTop: `1px solid ${marked ? "rgb(var(--vocado-accent-rgb) / 0.5)" : "transparent"}`,
        borderBottom: `1px solid ${marked ? "rgb(var(--vocado-accent-rgb) / 0.5)" : "transparent"}`,
        paddingTop: "5px",
        paddingBottom: "5px",
        transition: "border-color 160ms ease",
      }}
    >
      {/* ── Source sentence (Spanish) ── */}
      <motion.div
        style={{
          color: "#2A2A2A",
          lineHeight: 1.7,
          fontSize: "0.875rem",
        }}
      >
        {/* Wrapped per word so a tap can identify which word was hit. */}
        {words.map((chunk, i) =>
          isWhitespaceChunk(chunk) ? (
            chunk
          ) : (
            <span
              key={i}
              data-word={cleanWord(chunk)}
              data-word-index={i}
              // The spread box-shadow gives the highlight breathing room around
              // the glyphs without padding, so nothing reflows when it toggles.
              // The spoken highlight is deliberately softer than the tapped one
              // so a word the user chose still stands out while audio runs.
              style={
                selectedWordIndex === i
                  ? {
                      backgroundColor: "rgb(var(--vocado-accent-rgb) / 0.3)",
                      boxShadow: "0 0 0 2px rgb(var(--vocado-accent-rgb) / 0.3)",
                      borderRadius: "3px",
                    }
                  : spokenWordIndex === i
                    ? {
                        backgroundColor: "rgb(var(--vocado-accent-rgb) / 0.16)",
                        boxShadow: "0 0 0 2px rgb(var(--vocado-accent-rgb) / 0.16)",
                        borderRadius: "3px",
                      }
                    : vocabularyWords.has(normalizeWord(cleanWord(chunk)))
                      ? {
                          color: "rgb(var(--vocado-accent-dark-rgb))",
                          backgroundColor: "rgb(var(--vocado-accent-rgb) / 0.14)",
                          boxShadow: "0 0 0 1.5px rgb(var(--vocado-accent-rgb) / 0.14)",
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
              opacity: rowTransOpacity,
              y: rowTransY,
              paddingTop: "4px",
              paddingBottom: "5px",
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                lineHeight: 1.55,
                fontStyle: "italic",
                color: "#234D2A",
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
  /**
   * Fired when the user holds a sentence and drags right past the charge
   * threshold. Omit to disable the gesture entirely (e.g. before audio is
   * available for this article).
   */
  onPlayRow?: (rowIndex: number) => void
  /** Row currently being spoken — stays open and drives the karaoke highlight. */
  activeRow?: number | null
  /** Word within `activeRow` currently being spoken. */
  activeWord?: number | null
  /** Dedicated toolbar control: show every translation at once. */
  expandedAll?: boolean
  /** Words shown in the New Vocabulary carousel. */
  vocabularyWords?: string[]
}

export default function InterlinearAccordionReader({
  sourceParagraphs,
  targetParagraphs,
  onWordTap,
  highlightActive = true,
  onPlayRow,
  activeRow = null,
  activeWord = null,
  expandedAll = false,
  vocabularyWords = [],
}: Props) {
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [peekRow, setPeekRow] = useState<number | null>(null)
  const [pinnedRow, setPinnedRow] = useState<number | null>(null)

  // Press bookkeeping for tap-vs-peek discrimination and scroll anchoring.
  // `rowIndex` is captured once at pointerdown: dragging across other rows must
  // not retarget the gesture mid-way.
  // `axis` latches on first significant movement so a diagonal cannot both
  // scroll the page and charge the ring.
  const pressRef = useRef<{
    x: number
    y: number
    peeked: boolean
    rowIndex: number | null
    axis: "none" | "horizontal" | "vertical"
    charged: boolean
    action: "pin" | "play"
  } | null>(null)
  const [gestureAction, setGestureAction] = useState<"pin" | "play">("play")
  // Which word currently carries the highlight, identified by its row and its
  // index within that row — the same word can appear in several sentences.
  const [selectedWord, setSelectedWord] = useState<{
    rowIndex: number
    wordIndex: number
  } | null>(null)

  useEffect(() => {
    if (!highlightActive) setSelectedWord(null)
  }, [highlightActive])

  // Charge ring geometry and fill, all motion values so the drag never
  // re-renders React.
  const ringX = useMotionValue(0)
  const ringY = useMotionValue(0)
  const chargeRaw = useMotionValue(0)
  const charge = useSpring(chargeRaw, { stiffness: 700, damping: 40, mass: 0.5 })
  const gestureEnabled = Boolean(onPlayRow)
  const vocabularySet = useMemo(
    () => new Set(vocabularyWords.map(normalizeWord).filter(Boolean)),
    [vocabularyWords]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rowEl = (e.target as HTMLElement | null)?.closest?.(
        "[data-row-index]"
      ) as HTMLElement | null
      const pressedRow = Number(rowEl?.dataset.rowIndex)
      // Gesture mode is a true single-row accordion. Starting a new sentence
      // releases the previously frozen one; only the toolbar may open all rows.
      if (Number.isFinite(pressedRow)) setPinnedRow(null)

      pressRef.current = {
        x: e.clientX,
        y: e.clientY,
        peeked: false,
        rowIndex: Number.isFinite(pressedRow) ? pressedRow : null,
        axis: "none",
        charged: false,
        action: "play",
      }
      setGestureAction("play")

      // The charge target belongs to the pressed sentence, not to the initial
      // finger coordinate. Keep it directly on the reader's right edge and
      // vertically aligned with that sentence so it never appears randomly.
      const containerRect = containerRef.current?.getBoundingClientRect()
      const rowRect = rowEl?.getBoundingClientRect()
      if (containerRect && rowRect) {
        ringX.set(containerRect.width - RING_DIAMETER_PX / 2 - 4)
        ringY.set(rowRect.top - containerRect.top + rowRect.height / 2)
      }
      chargeRaw.set(0)

      peekTimer.current = setTimeout(() => {
        if (pressRef.current) pressRef.current.peeked = true
        setPeekRow(pressRef.current?.rowIndex ?? null)
      }, PEEK_DELAY_MS)
    },
    [ringX, ringY, chargeRaw]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const press = pressRef.current
      if (!press || !gestureEnabled) return

      // The gesture only exists once the translation is showing — before that a
      // move is still a scroll or an aborted tap, exactly as before.
      if (!press.peeked || press.rowIndex === null) return

      const dx = e.clientX - press.x
      const dy = e.clientY - press.y

      if (press.axis === "none") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return
        press.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical"
        if (press.axis === "horizontal") {
          // Keep receiving moves even if the finger leaves the container.
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {
            // Capture is a nicety; the gesture still works without it.
          }
        }
      }

      if (press.axis !== "horizontal") return

      const nextAction = dx < 0 ? "pin" : "play"
      if (press.action !== nextAction) {
        press.action = nextAction
        setGestureAction(nextAction)
        const containerRect = containerRef.current?.getBoundingClientRect()
        if (containerRect) {
          ringX.set(
            nextAction === "pin"
              ? RING_DIAMETER_PX / 2 + 4
              : containerRect.width - RING_DIAMETER_PX / 2 - 4
          )
        }
      }

      const next = Math.max(0, Math.min(1, Math.abs(dx) / CHARGE_DISTANCE_PX))
      chargeRaw.set(next)

      // One pulse as the gesture becomes committed, and only on the way up.
      const nowCharged = next >= 1
      if (nowCharged && !press.charged) {
        navigator.vibrate?.(10)
      }
      press.charged = nowCharged
    },
    [gestureEnabled, chargeRaw, ringX]
  )

  const endPress = useCallback(
    (e: React.PointerEvent, cancelled: boolean) => {
      if (peekTimer.current) clearTimeout(peekTimer.current)
      const press = pressRef.current
      pressRef.current = null

      setPeekRow(null)
      chargeRaw.set(0)

      // A committed horizontal release always freezes the row. Only the
      // rightward action additionally starts sentence audio.
      if (!cancelled && press?.charged && press.rowIndex !== null) {
        setPinnedRow(press.rowIndex)
        if (press.action === "play") onPlayRow?.(press.rowIndex)
        return
      }

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

      const wordRect = wordEl.getBoundingClientRect()
      onWordTap(
        word,
        { x: wordRect.left + wordRect.width / 2, y: wordRect.bottom },
        rowEl?.dataset.sentence ?? ""
      )
    },
    [onWordTap, onPlayRow, chargeRaw]
  )

  useEffect(() => {
    return () => {
      if (peekTimer.current) clearTimeout(peekTimer.current)
    }
  }, [])

  // Split each paragraph into sentence-level pairs, numbering every sentence
  // across the whole article so scroll anchoring can sum the rows above one.
  // Shared with the TTS route so audio timings address the same rows.
  const paragraphGroups = useMemo(
    () => buildRows(sourceParagraphs, targetParagraphs),
    [sourceParagraphs, targetParagraphs]
  )

  if (!sourceParagraphs.length) return null

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endPress(e, false)}
      // A charging drag legitimately travels past the container's right edge —
      // cancelling there would kill the gesture just as it completes.
      onPointerLeave={(e) => {
        if (pressRef.current?.axis === "horizontal") return
        endPress(e, true)
      }}
      onPointerCancel={(e) => endPress(e, true)}
      style={{
        position: "relative",
        touchAction: "pan-y",
        // Stops a rightward drag from being read as a horizontal overscroll,
        // which some browsers turn into a history navigation.
        overscrollBehaviorX: "contain",
        WebkitUserSelect: "none",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {gestureEnabled ? (
        <ChargeRing x={ringX} y={ringY} charge={charge} action={gestureAction} />
      ) : null}
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
              open={expandedAll || peekRow === pair.rowIndex || pinnedRow === pair.rowIndex}
              marked={peekRow === pair.rowIndex || pinnedRow === pair.rowIndex}
              vocabularyWords={vocabularySet}
              selectedWordIndex={
                selectedWord?.rowIndex === pair.rowIndex
                  ? selectedWord.wordIndex
                  : null
              }
              spokenWordIndex={
                activeRow === pair.rowIndex ? activeWord : null
              }
              pinnedOpen={activeRow === pair.rowIndex}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
