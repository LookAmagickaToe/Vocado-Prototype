// ElevenLabs voice discovery for article narration.
//
// Voice choice is driven by the live ElevenLabs library, not a hand-maintained
// list of environment variables. The API key remains server-only; a selected
// voice ID is saved per language track after the server has verified that the
// voice supports that language (and marks accent matches where ElevenLabs
// provides them).

import { languageCode, slugifyVariant, type LanguageCode } from "@/lib/languages"

const MULTILINGUAL = "eleven_multilingual_v2"
const V3 = "eleven_v3"
const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_VOICES = 4

const MODEL_BY_LANGUAGE: Record<LanguageCode, string> = {
  es: MULTILINGUAL,
  en: MULTILINGUAL,
  de: MULTILINGUAL,
  fr: MULTILINGUAL,
  pt: MULTILINGUAL,
  ca: V3,
}

export type VoiceGender = "female" | "male" | "unknown"
export type VoiceAccentSource = "regional" | "language"

export type PublicVoiceOption = {
  id: string
  name: string
  gender: VoiceGender
  accent: string | null
  accentSource: VoiceAccentSource
  previewUrl: string | null
}

export type ResolvedVoice = {
  voiceId: string
  modelId: string
  code: LanguageCode
  variant: string | null
}

type ProviderVoice = {
  voice_id?: unknown
  name?: unknown
  labels?: unknown
  preview_url?: unknown
  verified_languages?: unknown
}

type ProviderLanguage = {
  language?: unknown
  accent?: unknown
  preview_url?: unknown
}

type SharedVoice = {
  voice_id?: unknown
  name?: unknown
  gender?: unknown
  accent?: unknown
  language?: unknown
  preview_url?: unknown
  rate?: unknown
}

type LibraryFilter = {
  accent?: string
  search?: string
}

type CachedVoices = {
  expiresAt: number
  voices: PublicVoiceOption[]
}

const voiceCache = new Map<string, CachedVoices>()

// ElevenLabs Voice Library uses English metadata values for its accent filters.
// Catalan is intentionally absent: the shared library currently has no Catalan
// entries, so Catalan continues through the account-library fallback below.
const LIBRARY_FILTERS: Partial<Record<`${LanguageCode}:${string}`, LibraryFilter>> = {
  "de:bayerisch": { accent: "bavarian" },
  "de:oesterreichisch": { search: "austrian" },
  "de:schwyzerduetsch": { accent: "swiss" },
  "es:colombiano": { accent: "colombian" },
  "es:mexicano": { accent: "mexican" },
  "es:rioplatense": { accent: "argentine" },
  "es:andaluz": { accent: "andalusian" },
  "pt:brasileiro": { accent: "brazilian" },
  "pt:europeu": { accent: "european" },
  "fr:quebecois": { accent: "canadian" },
  "en:british": { accent: "british" },
  "en:american": { accent: "american" },
}

const SHARED_LIBRARY_LANGUAGES = new Set<LanguageCode>(["de", "en", "es", "fr", "pt"])

function normalized(value: unknown): string {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : ""
}

function accentTerms(language: LanguageCode, variant: string | null): string[] {
  if (!variant) return []
  const terms: Record<string, string[]> = {
    "de:bayerisch": ["bayerisch", "bavarian"],
    "de:oesterreichisch": ["osterreichisch", "austrian"],
    "de:schwyzerduetsch": ["schwyzerduetsch", "swiss german", "swiss"],
    "es:colombiano": ["colombian"],
    "es:mexicano": ["mexican"],
    "es:rioplatense": ["rioplatense", "argentinian", "argentine"],
    "es:andaluz": ["andalusian"],
    "ca:valencia": ["valencian", "valencia"],
    "ca:balear": ["balearic", "balear"],
    "pt:brasileiro": ["brazilian", "brazil"],
    "pt:europeu": ["european portuguese", "portuguese portugal"],
    "fr:quebecois": ["quebec", "quebecois"],
    "en:british": ["british", "uk", "english uk"],
    "en:american": ["american", "us", "english us"],
  }
  return terms[`${language}:${variant}`] ?? [variant.replace(/-/g, " ")]
}

function genderFor(labels: unknown): VoiceGender {
  const gender = normalized((labels as Record<string, unknown> | null)?.gender)
  return gender === "female" || gender === "male" ? gender : "unknown"
}

function asLanguages(input: unknown): ProviderLanguage[] {
  return Array.isArray(input) ? input.filter((entry): entry is ProviderLanguage => !!entry && typeof entry === "object") : []
}

function asLabels(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {}
}

function optionForVoice(
  raw: ProviderVoice,
  code: LanguageCode,
  variant: string | null
): PublicVoiceOption | null {
  const id = typeof raw.voice_id === "string" ? raw.voice_id : ""
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  if (!id || !name) return null

  const labels = asLabels(raw.labels)
  const languageMatches = asLanguages(raw.verified_languages).filter(
    (entry) => normalized(entry.language) === code
  )
  // A voice with no verified_languages record must not be advertised as a
  // language-learning voice, even if its descriptive labels claim a language.
  if (!languageMatches.length) return null

  const regionalTerms = accentTerms(code, variant)
  const matchedLanguage = languageMatches.find((entry) => {
    const accent = normalized(entry.accent)
    return regionalTerms.some((term) => accent.includes(term))
  })
  const verifiedLanguage = matchedLanguage ?? languageMatches[0]
  const accent =
    typeof verifiedLanguage?.accent === "string"
      ? verifiedLanguage.accent
      : typeof labels.accent === "string"
        ? labels.accent
        : null
  const previewUrl =
    typeof matchedLanguage?.preview_url === "string"
      ? matchedLanguage.preview_url
      : typeof raw.preview_url === "string"
        ? raw.preview_url
        : null

  return {
    id,
    name,
    gender: genderFor(labels),
    accent,
    accentSource: matchedLanguage ? "regional" : "language",
    previewUrl,
  }
}

function optionForSharedVoice(raw: SharedVoice, regional: boolean): PublicVoiceOption | null {
  const id = typeof raw.voice_id === "string" ? raw.voice_id : ""
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  const rate = typeof raw.rate === "number" ? raw.rate : 1
  if (!id || !name || rate > 1) return null

  const gender = normalized(raw.gender)
  return {
    id,
    name,
    gender: gender === "female" || gender === "male" ? gender : "unknown",
    accent: typeof raw.accent === "string" ? raw.accent : null,
    accentSource: regional ? "regional" : "language",
    previewUrl: typeof raw.preview_url === "string" ? raw.preview_url : null,
  }
}

function dedupe(voices: PublicVoiceOption[]): PublicVoiceOption[] {
  const seen = new Set<string>()
  return voices.filter((voice) => {
    if (seen.has(voice.id)) return false
    seen.add(voice.id)
    return true
  })
}

function balancedVoices(candidates: PublicVoiceOption[]): PublicVoiceOption[] {
  const unique = dedupe(candidates)
  const selected = [
    ...unique.filter((voice) => voice.gender === "female").slice(0, 2),
    ...unique.filter((voice) => voice.gender === "male").slice(0, 2),
  ]
  const selectedIds = new Set(selected.map((voice) => voice.id))
  return [
    ...selected,
    ...unique.filter((voice) => !selectedIds.has(voice.id)),
  ].slice(0, MAX_VOICES)
}

async function fetchSharedVoices(
  code: LanguageCode,
  gender: "female" | "male",
  filter: LibraryFilter | null,
  apiKey: string
): Promise<PublicVoiceOption[]> {
  const params = new URLSearchParams({
    language: code,
    gender,
    page_size: "20",
    sort: "trending",
  })
  if (filter?.accent) params.set("accent", filter.accent)
  if (filter?.search) params.set("search", filter.search)

  const response = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 600 },
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("ElevenLabs API key needs Voices Read access")
    }
    // Account voices remain a valid fallback if the shared library is
    // temporarily unavailable or the subscription does not expose it.
    return []
  }

  const payload = await response.json().catch(() => null)
  const voices = Array.isArray(payload?.voices) ? (payload.voices as SharedVoice[]) : []
  return voices
    .filter((voice) => normalized(voice.language) === code)
    .map((voice) => optionForSharedVoice(voice, filter !== null))
    .filter((voice): voice is PublicVoiceOption => voice !== null)
}

async function fetchAccountVoices(
  code: LanguageCode,
  variant: string | null,
  apiKey: string
): Promise<PublicVoiceOption[]> {
  const response = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 600 },
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("ElevenLabs API key needs Voices Read access")
    }
    throw new Error(`ElevenLabs voice discovery failed (${response.status})`)
  }

  const payload = await response.json().catch(() => null)
  const rawVoices = Array.isArray(payload?.voices) ? (payload.voices as ProviderVoice[]) : []
  return rawVoices
    .map((voice) => optionForVoice(voice, code, variant))
    .filter((voice): voice is PublicVoiceOption => voice !== null)
}

/**
 * Fetch available voices from ElevenLabs and retain only voices verified for
 * the language being learned. Results are cached server-side for ten minutes
 * to keep Settings responsive and avoid a provider call for every render.
 */
export async function listVoiceOptions(
  languageInput: unknown,
  variantInput: unknown,
  apiKey: string
): Promise<PublicVoiceOption[]> {
  const code = languageCode(languageInput, "es") as LanguageCode
  const variant = slugifyVariant(variantInput)
  const cacheKey = `${code}|${variant ?? ""}`
  const cached = voiceCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.voices

  const libraryFilter = variant ? LIBRARY_FILTERS[`${code}:${variant}`] ?? null : null
  let candidates: PublicVoiceOption[] = []

  if (SHARED_LIBRARY_LANGUAGES.has(code)) {
    const regional = await Promise.all([
      fetchSharedVoices(code, "female", libraryFilter, apiKey),
      fetchSharedVoices(code, "male", libraryFilter, apiKey),
    ])
    candidates = dedupe(regional.flat())

    // Thin regional catalogues (notably Swiss German) are filled with native
    // base-language voices while keeping every available regional match first.
    const hasTwoFemale = candidates.filter((voice) => voice.gender === "female").length >= 2
    const hasTwoMale = candidates.filter((voice) => voice.gender === "male").length >= 2
    if (libraryFilter && (!hasTwoFemale || !hasTwoMale)) {
      const base = await Promise.all([
        hasTwoFemale ? Promise.resolve([]) : fetchSharedVoices(code, "female", null, apiKey),
        hasTwoMale ? Promise.resolve([]) : fetchSharedVoices(code, "male", null, apiKey),
      ])
      candidates = dedupe([...candidates, ...base.flat()])
    }
  }

  if (balancedVoices(candidates).length < MAX_VOICES) {
    candidates = dedupe([...candidates, ...(await fetchAccountVoices(code, variant, apiKey))])
  }

  const voices = balancedVoices(candidates)

  voiceCache.set(cacheKey, { voices, expiresAt: Date.now() + CACHE_TTL_MS })
  return voices
}

export async function resolveVoice(
  languageInput: unknown,
  variantInput: unknown,
  selectedVoiceId: unknown,
  apiKey: string
): Promise<ResolvedVoice> {
  const code = languageCode(languageInput, "es") as LanguageCode
  const variant = slugifyVariant(variantInput)
  const options = await listVoiceOptions(languageInput, variant, apiKey)
  if (!options.length) {
    throw new Error(`No ElevenLabs voices are verified for ${code}`)
  }

  const saved = typeof selectedVoiceId === "string" ? selectedVoiceId : ""
  const selected = options.find((option) => option.id === saved) ?? options[0]
  return {
    voiceId: selected.id,
    modelId: MODEL_BY_LANGUAGE[code] ?? MULTILINGUAL,
    code,
    variant,
  }
}

/** Audio format requested from ElevenLabs. */
export const OUTPUT_FORMAT = "mp3_44100_64"
