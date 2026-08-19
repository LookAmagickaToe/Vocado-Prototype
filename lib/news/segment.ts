// How an article's text is cut into the rows the reader renders.
//
// This lives outside the reader component because the TTS route has to produce
// exactly the same rows on the server. Audio timings are stored per row index
// and per word index, and those indices are only meaningful if both sides split
// the text identically — a single divergence here silently misaligns every
// highlight in the article. One implementation, imported by both.

// ─── Sentence splitter ───────────────────────────────────────────────────────
// Uses a control character as a temporary split marker so we avoid needing
// lookbehind assertions (Safari <16 compat).
export const SENTENCE_MARKER = "\u001F"

export function splitSentences(text: string): string[] {
  const marked = text.replace(/([.!?])\s+/g, `$1${SENTENCE_MARKER}`)
  return marked.split(SENTENCE_MARKER).map((s) => s.trim()).filter(Boolean)
}

/**
 * Split a sentence into rendering chunks. Whitespace runs are kept as their own
 * entries so a chunk's array index is also its `data-word-index` in the DOM —
 * odd-looking, but it means word timings can address spans directly.
 */
export function splitWords(sentence: string): string[] {
  return sentence.split(/(\s+)/)
}

/** True for the whitespace chunks `splitWords` leaves between words. */
export function isWhitespaceChunk(chunk: string): boolean {
  return /^\s+$/.test(chunk)
}

/** Strip surrounding punctuation so "Rechenzentren." becomes "Rechenzentren". */
export function cleanWord(raw: string): string {
  return raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
}

// ─── Rows ────────────────────────────────────────────────────────────────────

export type SentencePair = {
  source: string
  target: string
  /** Position in the flattened list of all sentences in the article. */
  rowIndex: number
}

/**
 * Pair each source sentence with its translation and number every sentence
 * across the whole article.
 *
 * Alignment is purely positional — paragraph `i` to paragraph `i`, sentence `j`
 * to sentence `j`. A translation that merges or splits a sentence therefore
 * shifts everything after it, and the source side always wins on count. That is
 * a known weakness of the current data model, not something this function can
 * fix; it is called out here because the audio layer inherits it.
 */
export function buildRows(
  sourceParagraphs: string[],
  targetParagraphs: string[]
): SentencePair[][] {
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
}

/** Every sentence in the article, flattened, in row-index order. */
export function flattenRows(groups: SentencePair[][]): SentencePair[] {
  return groups.flat()
}

/**
 * The exact string sent to the TTS provider, and the one its character-level
 * alignment indexes into. Paragraphs are joined with a blank line so the voice
 * takes a breath between them.
 */
export const PARAGRAPH_JOINER = "\n\n"

export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join(PARAGRAPH_JOINER)
}
