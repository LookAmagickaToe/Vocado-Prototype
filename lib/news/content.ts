import { languageCode } from "@/lib/languages"

/**
 * Bump this whenever the level-specific article/vocabulary contract changes.
 * It prevents today's already-cached content from masking a prompt fix.
 */
export const NEWS_PROMPT_VERSION = "level-summary-v2"

// Occurrence checks must preserve articles. `normalizeWord` intentionally turns
// "la ceniza" into "ceniza" for vocabulary deduplication, which is wrong when
// checking whether that exact visible phrase occurs inside a sentence.
function normalizeOccurrenceText(input: unknown): string {
  if (typeof input !== "string") return ""
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function vocabularyAppearsInSummary(item: any, summary: unknown): boolean {
  const term = normalizeOccurrenceText(item?.target)
  const text = Array.isArray(summary)
    ? normalizeOccurrenceText(summary.join(" "))
    : normalizeOccurrenceText(summary)

  if (!term || !text) return false
  return ` ${text} `.includes(` ${term} `)
}

/** Only vocabulary visibly present in this exact level's learning text survives. */
export function filterVocabularyToSummary(items: unknown, summary: unknown): any[] {
  if (!Array.isArray(items)) return []
  return items.filter((item) => vocabularyAppearsInSummary(item, summary))
}

type NewsPoolPair = {
  source: string
  target: string
}

function occurrenceScore(pair: NewsPoolPair, targetSummary: unknown, sourceSummary: unknown): number {
  let score = 0
  if (vocabularyAppearsInSummary({ target: pair.target }, targetSummary)) score += 2
  if (vocabularyAppearsInSummary({ target: pair.source }, sourceSummary)) score += 1
  return score
}

/**
 * News pools exist in two historical formats:
 *
 * - language-keyed (`de` is German and `es` is Spanish), and
 * - legacy card order (`es` is source and `de` is target, regardless of language).
 *
 * New payloads carry explicit `source`/`target` fields. For an older payload,
 * use the visible parallel article text to identify which of the two layouts it
 * contains. This keeps old local/bookmarked news readable without swapping the
 * learning and native languages.
 */
export function resolveNewsPoolPair(
  pair: any,
  sourceLanguage: string,
  targetLanguage: string,
  targetSummary?: unknown,
  sourceSummary?: unknown
): NewsPoolPair {
  const explicit = {
    source: typeof pair?.source === "string" ? pair.source.trim() : "",
    target: typeof pair?.target === "string" ? pair.target.trim() : "",
  }
  if (explicit.source && explicit.target) return explicit

  const sourceCode = languageCode(sourceLanguage, "es")
  const targetCode = languageCode(targetLanguage, "de")
  const languageKeyed = {
    source: String(pair?.[sourceCode] ?? "").trim(),
    target: String(pair?.[targetCode] ?? "").trim(),
  }
  const legacyOrdered = {
    source: String(pair?.es ?? "").trim(),
    target: String(pair?.de ?? "").trim(),
  }

  if (!languageKeyed.source || !languageKeyed.target) return legacyOrdered
  if (!legacyOrdered.source || !legacyOrdered.target) return languageKeyed
  if (
    languageKeyed.source === legacyOrdered.source
    && languageKeyed.target === legacyOrdered.target
  ) {
    return languageKeyed
  }

  return occurrenceScore(legacyOrdered, targetSummary, sourceSummary)
    > occurrenceScore(languageKeyed, targetSummary, sourceSummary)
    ? legacyOrdered
    : languageKeyed
}

export function hasCurrentNewsPromptVersion(value: any): boolean {
  return value?.promptVersion === NEWS_PROMPT_VERSION
    || value?.news?.promptVersion === NEWS_PROMPT_VERSION
}
