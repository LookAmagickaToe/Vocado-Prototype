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
  chunking: { itemsPerGame: number } // rename to be generic
  mode: "vocab" | "phrase"
}

export type VocabWorld = WorldBase & {
  mode: "vocab"
  pool: VocabPair[]
}

export type PhraseWorld = WorldBase & {
  mode: "phrase"
  pool: PhraseItem[]
  distractions?: PhraseToken[]
}

export type World = VocabWorld | PhraseWorld
