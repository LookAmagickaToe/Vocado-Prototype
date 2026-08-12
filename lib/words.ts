// Shared word normalization. Used by both the server (user_words index) and the
// client (dedup before showing / saving). Any change here must be applied to the
// stored norm_source / norm_target columns too, otherwise old rows stop matching.

const LEADING_ARTICLES = new Set([
  // German
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines",
  // Spanish
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  // French
  "le", "les", "l", "du", "des", "une",
  // English
  "the", "a", "an",
  // Italian / Portuguese
  "il", "lo", "gli", "o", "os", "as", "uma",
  // Catalan — el/la/les/un/una/l are already covered above. The personal
  // articles "en" and "na" are deliberately left out: they are ordinary words in
  // Spanish and French ("en casa", "en effet"), and stripping them would change
  // how those languages normalize.
  "els", "uns", "unes",
])

/**
 * Fold a word into a comparison key: accent-free, lowercase, punctuation-free,
 * without a leading article. "Die Übung," and "uebung" do not collapse — only
 * diacritic folding is applied, not transliteration.
 */
export function normalizeWord(input: unknown): string {
  if (typeof input !== "string") return ""
  let value = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Elided article: "l'aigua" → "aigua". Apostrophes survive the cleanup above
  // (English needs them for "don't"), so an elided article never becomes its own
  // token and the word-level strip below cannot see it. Only "l'" is stripped —
  // it is unambiguously the definite article in Catalan, French and Italian,
  // whereas "d'" is a preposition whose removal would change meaning
  // ("d'accord" is not "accord").
  value = value.replace(/^l'\s*/, "")

  const parts = value.split(" ")
  if (parts.length > 1 && LEADING_ARTICLES.has(parts[0])) {
    value = parts.slice(1).join(" ")
  }
  return value
}

/** Comparison key for a vocabulary pair. Empty on either side yields "". */
export function wordKey(source: unknown, target: unknown): string {
  const s = normalizeWord(source)
  const t = normalizeWord(target)
  if (!s || !t) return ""
  return `${s}::${t}`
}

/**
 * Keep only entries whose wordKey has not been seen yet. `seen` is mutated so
 * callers can chain several batches against one accumulating set.
 */
export function dedupeByKey<T>(
  items: T[],
  getSource: (item: T) => unknown,
  getTarget: (item: T) => unknown,
  seen: Set<string> = new Set()
): T[] {
  const result: T[] = []
  for (const item of items) {
    const key = wordKey(getSource(item), getTarget(item))
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}
