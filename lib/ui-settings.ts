import i18n from "@/data/ui/i18n.json"

type UiSettings = (typeof i18n)["es"]

const getLanguageKey = (sourceLanguage?: string): keyof typeof i18n => {
  const value = (sourceLanguage || "").toLowerCase()
  if (value === "de" || value.includes("deutsch") || value.includes("german")) return "de"
  if (value === "en" || value.includes("english")) return "en"
  if (value === "fr" || value.includes("français") || value.includes("french")) return "fr"
  if (value === "pt" || value.includes("português") || value.includes("portuguese") || value.includes("portugues")) return "pt"
  return "es"
}

export const getUiSettings = (sourceLanguage?: string): UiSettings => {
  const key = getLanguageKey(sourceLanguage)
  return i18n[key] || i18n.es
}
