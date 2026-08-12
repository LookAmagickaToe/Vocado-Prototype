import i18n from "@/data/ui/i18n.json"
import { resolveLanguage } from "@/lib/languages"

type UiSettings = (typeof i18n)["es"]

/**
 * The app chrome is rendered in the user's source (native) language. Resolution
 * goes through lib/languages so a new language only has to be declared once —
 * this used to be a hand-written if-chain that had to be extended in parallel.
 * A language with no translated bundle falls back to Spanish.
 */
const getLanguageKey = (sourceLanguage?: string): keyof typeof i18n => {
  const code = resolveLanguage(sourceLanguage)?.code
  return code && code in i18n ? (code as keyof typeof i18n) : "es"
}

export const getUiSettings = (sourceLanguage?: string): UiSettings => {
  const key = getLanguageKey(sourceLanguage)
  return i18n[key] || i18n.es
}
