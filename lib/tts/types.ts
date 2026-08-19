// Timing tables that let one audio file serve arbitrary sub-ranges.
//
// ElevenLabs returns per-character start/end times for the text it spoke. We
// collapse that into the two units the reader actually addresses — sentences
// (rows) and words — so playing a single sentence is a seek plus a stop time
// rather than a separate API call and a separate file.

export type TimeRange = {
  /** Row index from buildRows(), article-global. */
  rowIndex: number
  start: number
  end: number
}

export type WordRange = TimeRange & {
  /** Index into splitWords(sentence), so it matches data-word-index in the DOM. */
  wordIndex: number
}

export type TtsMarks = {
  version: 1
  durationSec: number
  segments: TimeRange[]
  /**
   * Null when the provider's alignment could not be mapped onto the input text
   * exactly and we fell back to proportional sentence timings. Sentence
   * playback still works; word-level karaoke is disabled rather than shown
   * drifting.
   */
  words: WordRange[] | null
}

/** Audio metadata carried inside a saved world (world.news.audio). */
export type NewsAudio = {
  /** Content hash — also the storage path stem under `_tts/`. */
  hash: string
  /** Language label the audio was generated from. */
  language: string
  variant?: string | null
  /** ElevenLabs voice ID that generated this cached narration. */
  voiceId: string
  modelId: string
  marks: TtsMarks
}
