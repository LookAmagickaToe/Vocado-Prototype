// components/games/vocab/types.ts
export type CardModel = {
  key: string
  pairId: string
  kind: "word" | "image"
  front: { title?: string; subtitle?: string }
  imageSrc?: string
  imageAlt?: string
}
