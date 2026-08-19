// Turn a provider's character-level alignment into the sentence and word time
// ranges the reader addresses.
//
// The provider tells us when each *character* was spoken. The reader thinks in
// rows (sentences) and word indices. This module is the bridge, and it must use
// the same splitters the reader renders with — hence the imports from
// lib/news/segment rather than a local regex.

import {
  buildRows,
  flattenRows,
  isWhitespaceChunk,
  joinParagraphs,
  splitWords,
} from "@/lib/news/segment"
import type { TimeRange, TtsMarks, WordRange } from "./types"

/** Shape of ElevenLabs' `alignment` / `normalized_alignment` objects. */
export type Alignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

export function isAlignment(value: unknown): value is Alignment {
  const a = value as Alignment | null
  return Boolean(
    a &&
      Array.isArray(a.characters) &&
      Array.isArray(a.character_start_times_seconds) &&
      Array.isArray(a.character_end_times_seconds)
  )
}

/**
 * True when the alignment indexes the input text one-for-one, so
 * `alignment.characters[i]` is `text[i]` and timings can be read directly.
 *
 * The provider normalizes some text before speaking it (numbers, abbreviations),
 * in which case `alignment` no longer lines up and only the coarse fallback is
 * safe. Checking rather than assuming is what keeps a drifting highlight from
 * shipping silently.
 */
function alignsExactly(alignment: Alignment, text: string): boolean {
  return (
    alignment.characters.length === text.length &&
    alignment.character_start_times_seconds.length >= text.length &&
    alignment.character_end_times_seconds.length >= text.length &&
    alignment.characters.join("") === text
  )
}

function lastTime(alignment: Alignment): number {
  const ends = alignment.character_end_times_seconds
  return ends.length ? ends[ends.length - 1] : 0
}

/**
 * Locate every sentence inside the joined text.
 *
 * Uses a forward-moving cursor and `indexOf` rather than arithmetic: the
 * splitter trims each sentence, so the offsets are not simply cumulative
 * lengths. Returns null if any sentence cannot be located, which forces the
 * caller onto the fallback instead of emitting wrong offsets.
 */
function locateSentences(
  text: string,
  sentences: string[]
): { start: number; end: number }[] | null {
  const spans: { start: number; end: number }[] = []
  let cursor = 0
  for (const sentence of sentences) {
    const start = text.indexOf(sentence, cursor)
    if (start === -1) return null
    const end = start + sentence.length
    spans.push({ start, end })
    cursor = end
  }
  return spans
}

/**
 * Build the timing tables for one article.
 *
 * `paragraphs` must be the same array that was sent to the provider, and the
 * same one the reader renders as its source column — row indices are derived
 * from it and are meaningless otherwise.
 */
export function buildMarks(paragraphs: string[], alignment: Alignment): TtsMarks {
  const text = joinParagraphs(paragraphs)
  // Row numbering comes from the source column only; the target column does not
  // affect it, so passing paragraphs twice yields the reader's exact indices.
  const rows = flattenRows(buildRows(paragraphs, paragraphs))
  const durationSec = lastTime(alignment)

  const spans = locateSentences(
    text,
    rows.map((row) => row.source)
  )

  if (!spans || !alignsExactly(alignment, text)) {
    return {
      version: 1,
      durationSec,
      segments: proportionalSegments(rows, spans, text, durationSec),
      words: null,
    }
  }

  const starts = alignment.character_start_times_seconds
  const ends = alignment.character_end_times_seconds

  const segments: TimeRange[] = []
  const words: WordRange[] = []

  rows.forEach((row, i) => {
    const span = spans[i]
    segments.push({
      rowIndex: row.rowIndex,
      start: starts[span.start],
      end: ends[span.end - 1],
    })

    // Word offsets are relative to the sentence, so add the sentence's own
    // offset to get back into the joined text the alignment indexes.
    let offset = 0
    splitWords(row.source).forEach((chunk, wordIndex) => {
      if (!isWhitespaceChunk(chunk) && chunk.length > 0) {
        const from = span.start + offset
        words.push({
          rowIndex: row.rowIndex,
          wordIndex,
          start: starts[from],
          end: ends[from + chunk.length - 1],
        })
      }
      offset += chunk.length
    })
  })

  return { version: 1, durationSec, segments, words }
}

/**
 * Sentence timings by character position when exact alignment is unavailable.
 *
 * Assumes an even speaking rate across the article, which is wrong in detail
 * but keeps "play this sentence" roughly usable. Word highlighting is dropped
 * entirely in this mode rather than shown drifting.
 */
function proportionalSegments(
  rows: { rowIndex: number; source: string }[],
  spans: { start: number; end: number }[] | null,
  text: string,
  durationSec: number
): TimeRange[] {
  const total = text.length || 1
  if (!spans) {
    // Sentences could not even be located — fall back to equal slices so
    // playback still advances instead of failing outright.
    const slice = durationSec / (rows.length || 1)
    return rows.map((row, i) => ({
      rowIndex: row.rowIndex,
      start: i * slice,
      end: (i + 1) * slice,
    }))
  }
  return rows.map((row, i) => ({
    rowIndex: row.rowIndex,
    start: (spans[i].start / total) * durationSec,
    end: (spans[i].end / total) * durationSec,
  }))
}
