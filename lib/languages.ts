// Single source of truth for the languages the app supports and the regional
// varieties ("accents") each one offers.
//
// Before this module the language list was copy-pasted in six places — the three
// picker components, the news pool's LANG_CODES map, and the fuzzy label maps in
// the two news routes. Adding a language meant editing all six and forgetting one.
// Everything now resolves through here.

export type LanguageCode = "es" | "en" | "de" | "fr" | "pt" | "ca"

export type Language = {
  code: LanguageCode
  /** Display label, and the value stored in profiles.source_language / target_language. */
  label: string
}

export const LANGUAGES: Language[] = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "ca", label: "Català" },
]

/** Just the labels, for `<select>` options. */
export const LANGUAGE_LABELS = LANGUAGES.map((lang) => lang.label)

const BY_CODE = new Map(LANGUAGES.map((lang) => [lang.code, lang]))
const BY_LABEL = new Map(LANGUAGES.map((lang) => [lang.label, lang]))

/**
 * Every spelling we accept for a language: its code, its own label, and the
 * English/German/Spanish names that turn up in URLs and stored profile rows.
 * Keys are lowercased; lookups lowercase their input.
 */
const ALIASES: Record<string, LanguageCode> = {
  es: "es", español: "es", espanol: "es", spanish: "es", spanisch: "es", castellano: "es",
  en: "en", english: "en", englisch: "en", inglés: "en", ingles: "en",
  de: "de", deutsch: "de", german: "de", alemán: "de", aleman: "de", alemany: "de",
  fr: "fr", français: "fr", francais: "fr", french: "fr", französisch: "fr", francés: "fr", frances: "fr",
  pt: "pt", português: "pt", portugues: "pt", portuguese: "pt", portugiesisch: "pt", portugués: "pt",
  ca: "ca", català: "ca", catala: "ca", catalan: "ca", catalán: "ca", katalanisch: "ca",
}

/** Resolve any spelling of a language to its canonical entry, or null. */
export function resolveLanguage(input: unknown): Language | null {
  if (typeof input !== "string") return null
  const value = input.trim().toLowerCase()
  if (!value) return null
  // Tolerate regional tags like "en-US" that arrive from Accept-Language headers.
  const code = ALIASES[value] ?? ALIASES[value.split("-")[0]]
  return code ? BY_CODE.get(code) ?? null : null
}

/** Canonical display label for any spelling. Falls back to `fallback` unchanged. */
export function languageLabel(input: unknown, fallback = "Español"): string {
  return resolveLanguage(input)?.label ?? fallback
}

/**
 * Two-letter code for a language label. News pools key their word pairs by this
 * code, so the field names inside a pool depend on the user's language pair.
 */
export function languageCode(input: unknown, fallback: string): string {
  return resolveLanguage(input)?.code ?? fallback
}

// ─── Regional varieties ───────────────────────────────────────────────────────
// A variety is a dialect or regional accent of a base language. It is NOT a
// language of its own: a learner studying Bayerisch keeps every standard German
// word they already know, and only sees dialect-specific words on top. See
// lib/track.ts for the inheritance rule that makes that work.

export type Variant = {
  /** Stable identifier stored in the DB. Never change one once words are tagged. */
  slug: string
  label: string
}

/** Curated varieties per language code. `[]` means the language offers none yet. */
export const VARIANTS: Record<LanguageCode, Variant[]> = {
  de: [
    { slug: "bayerisch", label: "Bayerisch" },
    { slug: "oesterreichisch", label: "Österreichisch" },
    { slug: "schwyzerduetsch", label: "Schwyzerdütsch" },
  ],
  es: [
    { slug: "colombiano", label: "Colombiano" },
    { slug: "mexicano", label: "Mexicano" },
    { slug: "rioplatense", label: "Rioplatense" },
    { slug: "andaluz", label: "Andaluz" },
  ],
  ca: [
    { slug: "valencia", label: "Valencià" },
    { slug: "balear", label: "Balear" },
  ],
  pt: [
    { slug: "brasileiro", label: "Brasileiro" },
    { slug: "europeu", label: "Europeu" },
  ],
  fr: [{ slug: "quebecois", label: "Québécois" }],
  en: [
    { slug: "british", label: "British" },
    { slug: "american", label: "American" },
  ],
}

/** Curated varieties offered for a language label. */
export function variantsFor(languageInput: unknown): Variant[] {
  const lang = resolveLanguage(languageInput)
  return lang ? VARIANTS[lang.code] : []
}

/**
 * Fold a free-text variety into a stable slug, so "Bavarian", "bavarian" and
 * " Bavarian " don't become three different settings the user can't tell apart.
 */
export function slugifyVariant(input: unknown): string | null {
  if (typeof input !== "string") return null
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || null
}

/**
 * Human-readable name for a variant slug. Curated slugs resolve to their proper
 * label; a free-text slug is title-cased back into something presentable.
 */
export function variantLabel(slug: unknown, languageInput?: unknown): string | null {
  const value = typeof slug === "string" ? slug.trim() : ""
  if (!value) return null

  const pools = languageInput
    ? [variantsFor(languageInput)]
    : Object.values(VARIANTS)
  for (const pool of pools) {
    const found = pool.find((variant) => variant.slug === value)
    if (found) return found.label
  }

  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** True when `slug` is one of the curated varieties for the language. */
export function isCuratedVariant(slug: unknown, languageInput: unknown): boolean {
  if (typeof slug !== "string") return false
  return variantsFor(languageInput).some((variant) => variant.slug === slug)
}

export { BY_LABEL as LANGUAGES_BY_LABEL }
