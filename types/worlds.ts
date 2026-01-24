export type CardImage =
  | { type: "emoji"; value: string }
  | { type: "image"; src: string; alt?: string }

export type ConjugationSection = {
  title: string
  rows: [string, string][]
}

export type Conjugation = {
  infinitive?: string
  translation?: string
  sections: ConjugationSection[]
}

export type VocabPair = {
  id: string
  es: string
  de: string
  image: CardImage
  explanation?: string
  example?: string
  pos?: "verb" | "noun" | "adj" | "other"
  conjugation?: Conjugation
}

// -------- Grammar / Phrase mode types --------

export type PhraseTokenType = "verb" | "noun" | "pronoun" | "adj" | "other"

export type PhraseToken = {
  id: string
  text: string          // Spanish piece: "me", "gusta", "correr"
  type: PhraseTokenType // for color
}

export type PhraseItem = {
  id: string
  motherTongue: string  // displayed above board (English/German)
  tokens: PhraseToken[] // correct order
  explanation?: string
}

export type WorldBase = {
  id: string
  title: string
  description?: string
  chunking: { itemsPerGame: number }
  mode: "vocab" | "phrase"
  source_language?: string
  target_language?: string
  news?: {
    summary: string[]
    sourceUrl?: string
    title?: string
  }

  ui?: WorldUI
}


export type VocabWorld = WorldBase & {
  mode: "vocab"
  submode?: "conjugation" | string
  pool: VocabPair[]
  conjugations?: Record<string, Conjugation>

}

export type PhraseWorld = WorldBase & {
  mode: "phrase"
  pool: PhraseItem[]
  distractions?: PhraseToken[]
}

export type World = VocabWorld | PhraseWorld

// types/worlds.ts

export type UITemplate = string // e.g. "Nivel {i}/{n}" oder "Fortschritt: {matched}/{total}"

export type WorldUI = {
  header?: {
    levelLabelTemplate?: UITemplate // "Nivel {i}/{n}" | "Konjugation {i}/{n}"
    levelItemTemplate?: UITemplate  // "Nivel {i}" für Level-Liste/Overlay
  }

  page?: {
    instructions?: string // Text unter World/Level im Header
  }

  vocab?: {
    // kleine, häufige Texte im Vocab-Game
    progressTemplate?: UITemplate // "Progreso: {matched}/{total} • Movimientos: {moves}"
    carousel?: {
      primaryLabel?: string   // "Español:" (oder "Pronombre:" etc.)
      secondaryLabel?: string // "Deutsch:" (oder "Conjugación:" etc.)
    }
    rightPanel?: {
      title?: string // "Parejas encontradas"
      emptyHint?: string
    }
  }

  phrase?: {
    // Texte für Phrase-Game
    introKicker?: string
    introButton?: string

    promptTitle?: string
    promptSubtitle?: string

    howItWorksTitle?: string
    howItWorksText?: string

    legendTitle?: string

    progressTemplate?: UITemplate // "Progreso: {i}/{n} • Movimientos: {moves}"
    winSubtitleTemplate?: UITemplate // "Phrase completed — {n} tokens placed."

    nextPhraseLabel?: string
    nextLevelLabel?: string
  }

  winning?: {
    title?: string
    movesLabel?: string
    explanationTitle?: string
    reviewTitle?: string
    conjugationTitle?: string
    nextDefault?: string
    closeDefault?: string
  }
}
