import { languageCode } from "@/lib/languages"
import { normalizeWord } from "@/lib/words"

const TENSE_TITLES: Record<string, [string, string, string, string]> = {
  es: ["Presente", "Pretérito indefinido", "Pretérito perfecto", "Futuro"],
  de: ["Präsens", "Präteritum", "Perfekt", "Futur I"],
  en: ["Simple Present", "Simple Past", "Present Perfect", "Future"],
  fr: ["Présent", "Passé simple", "Passé composé", "Futur simple"],
  pt: ["Presente", "Pretérito perfeito", "Pretérito perfeito composto", "Futuro"],
  ca: ["Present", "Passat simple", "Perfet", "Futur"],
}

const EXPECTED_PRONOUNS: Record<string, string[]> = {
  es: ["yo", "tú", "él", "ella", "nosotros", "vosotros", "ellos", "ellas"],
  de: ["ich", "du", "er", "sie", "es", "wir", "ihr"],
  en: ["i", "you", "he", "she", "it", "we", "they"],
  fr: ["je", "tu", "il", "elle", "nous", "vous", "ils", "elles"],
  pt: ["eu", "tu", "ele", "ela", "nós", "vós", "eles", "elas", "você", "vocês"],
  ca: ["jo", "tu", "ell", "ella", "nosaltres", "vosaltres", "ells", "elles"],
}

export function targetTenseTitles(language: string): [string, string, string, string] {
  const code = languageCode(language, "es")
  return TENSE_TITLES[code] ?? TENSE_TITLES.es
}

function sourceStem(value: string): string {
  const normalized = normalizeWord(value).replace(/\s+/g, "")
  if (normalized.length < 5) return ""
  return normalized.replace(/(ieren|ern|en|ir|er|ar|re|n)$/u, "").slice(0, 8)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Reject mixed tables such as Spanish pronouns paired with German verb forms. */
export function isConjugationForTarget(
  conjugation: any,
  targetLanguage: string,
  sourceLanguage: string,
  sourceVerb: string
): boolean {
  const sections = Array.isArray(conjugation?.sections) ? conjugation.sections : []
  if (
    sections.length !== 4
    || sections.some((section: any) => !Array.isArray(section?.rows) || !section.rows.length)
  ) {
    return false
  }

  const targetCode = languageCode(targetLanguage, "es")
  const sourceCode = languageCode(sourceLanguage, "de")
  const rows = sections.flatMap((section: any) => section.rows)
  const pronouns = rows.map((row: any) => normalizeWord(row?.[0] ?? ""))
  const expected = EXPECTED_PRONOUNS[targetCode] ?? []
  if (
    expected.length
    && !pronouns.some((pronoun: string) =>
      expected.some((value) => pronoun.includes(normalizeWord(value)))
    )
  ) {
    return false
  }

  if (targetCode !== sourceCode) {
    const sourceInfinitive = normalizeWord(sourceVerb).replace(/\s+/g, "")
    const targetVerb = normalizeWord(
      conjugation?.verb ?? conjugation?.infinitive ?? ""
    ).replace(/\s+/g, "")
    if (sourceInfinitive && targetVerb === sourceInfinitive) return false

    const stem = sourceStem(sourceVerb)
    if (sourceCode === "de" && stem.length >= 4) {
      const germanForm = new RegExp(
        `^(?:ge)?${escapeRegExp(stem)}(?:e|st|t|en|te|test|ten|tet)$`,
        "u"
      )
      const leakedForms = rows.filter((row: any) => {
        const words = normalizeWord(row?.[1] ?? "").split(/\s+/)
        return words.some((word: string) => germanForm.test(word))
      }).length
      if (leakedForms >= 4) return false
    }
  }

  return rows.every(
    (row: any) =>
      typeof row?.[0] === "string" && typeof row?.[1] === "string" && row[1].trim()
  )
}
