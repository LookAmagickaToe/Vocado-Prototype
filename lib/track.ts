// A "track" is one thing the user is learning: a language pair plus an optional
// regional variety. Worlds, vocabulary, saved news and lists all belong to a
// track, so learning Deutsch and then English inside one profile feels like two
// clean slates.
//
// The variety is where it gets interesting. A variety is NOT a separate track —
// it is a lens over its base language:
//
//     standard Deutsch    →  words tagged variant = NULL
//     Bayerisch           →  words tagged variant = NULL  OR  'bayerisch'
//
// Base words are shared, variety words are private. So switching to Bayerisch
// keeps every standard German word you already learned, with its SRS progress
// intact — it is literally the same row — while `Bua` and `i mog di` stay hidden
// from standard Deutsch. Five varieties of one language cost five tags over one
// shared pool, not five copies of it.

import { languageLabel, slugifyVariant } from "@/lib/languages"

export type Track = {
  /** Native / UI language. Stored as a display label, e.g. "Español". */
  source: string
  /** Language being learned, e.g. "Deutsch". */
  target: string
  /** Variety slug, or null for the standard form. */
  variant: string | null
}

/** Anything carrying the three scoping columns — a DB row or a world blob. */
export type TrackScoped = {
  source_language?: string | null
  target_language?: string | null
  variant?: string | null
}

export const DEFAULT_SOURCE = "Español"
export const DEFAULT_TARGET = "Deutsch"

/**
 * Build a track from loose input (profile row, query params, client state),
 * canonicalizing the language labels and slugifying the variety.
 */
export function buildTrack(input: {
  source?: unknown
  target?: unknown
  variant?: unknown
}): Track {
  return {
    source: languageLabel(input.source, DEFAULT_SOURCE),
    target: languageLabel(input.target, DEFAULT_TARGET),
    variant: slugifyVariant(input.variant),
  }
}

/**
 * Stable identifier for a track, safe for use inside a localStorage key.
 * The variety is part of the key: a Bayerisch session and a standard Deutsch
 * session must not share a cache, because they resolve to different word sets.
 */
export function trackKey(track: Track): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  return [slug(track.source), slug(track.target), track.variant ?? "std"].join("_")
}

/** Namespace a localStorage key to a track: `vocado-worlds-cache:<user>:<track>`. */
export function scopedCacheKey(base: string, track: Track, userId?: string | null): string {
  const parts = [base]
  if (userId) parts.push(userId)
  parts.push(trackKey(track))
  return parts.join(":")
}

/** Two tracks address the same word set. */
export function sameTrack(a: Track, b: Track): boolean {
  return a.source === b.source && a.target === b.target && a.variant === b.variant
}

/**
 * Does a stored row belong to the set this track can see?
 *
 * Language pair must match exactly. The variety follows the inheritance rule:
 * a standard session sees only untagged rows; a variety session sees untagged
 * rows plus its own. It never sees a sibling variety's rows.
 *
 * Rows written before the language columns existed carry nulls; the migration
 * backfills them, but a null pair here is treated as belonging to the current
 * track so nothing silently disappears if a backfill was missed.
 */
export function matchesTrack(row: TrackScoped, track: Track): boolean {
  const source = row.source_language ?? null
  const target = row.target_language ?? null
  if (source !== null && source !== track.source) return false
  if (target !== null && target !== track.target) return false

  const variant = row.variant ?? null
  if (variant === null) return true
  return variant === track.variant
}

/** Keep only the rows this track can see. */
export function filterByTrack<T extends TrackScoped>(rows: T[], track: Track): T[] {
  return rows.filter((row) => matchesTrack(row, track))
}

/** The three columns to stamp onto anything a track owns. */
export function trackColumns(track: Track) {
  return {
    source_language: track.source,
    target_language: track.target,
    variant: track.variant,
  }
}

/**
 * PostgREST filter expressing the variety inheritance rule, for use with
 * `.or(...)`. Returns null for a standard session, where the caller should use
 * `.is("variant", null)` instead — `.or()` with a single term is wasteful and
 * PostgREST handles the null check better on its own.
 */
export function variantOrFilter(track: Track): string | null {
  return track.variant ? `variant.is.null,variant.eq.${track.variant}` : null
}

/**
 * Apply the track scope to a Supabase query builder. Kept here so the six routes
 * that need it cannot drift apart on the inheritance rule.
 */
export function applyTrackScope<T extends {
  eq: (column: string, value: unknown) => T
  is: (column: string, value: unknown) => T
  or: (filter: string) => T
}>(query: T, track: Track): T {
  const scoped = query
    .eq("source_language", track.source)
    .eq("target_language", track.target)
  const or = variantOrFilter(track)
  return or ? scoped.or(or) : scoped.is("variant", null)
}
