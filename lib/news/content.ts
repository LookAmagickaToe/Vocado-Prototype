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

export function hasCurrentNewsPromptVersion(value: any): boolean {
  return value?.promptVersion === NEWS_PROMPT_VERSION
    || value?.news?.promptVersion === NEWS_PROMPT_VERSION
}
