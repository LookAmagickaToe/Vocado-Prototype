// localStorage key builders, all scoped to the active track.
//
// These were previously assembled inline in each component, which is how the
// worlds cache ended up with a bare un-namespaced `vocado-worlds-cache` key
// written alongside the per-user one and read as a fallback. That fallback is
// unsafe once content is per-language: a German cache would hydrate an English
// session. It is gone, and every key now runs through here.
//
// Keys are versioned with a `v2` marker so the old, unscoped entries are simply
// ignored rather than misread — the next fetch repopulates them correctly.

import { scopedCacheKey, type Track } from "@/lib/track"

export function worldsCacheKey(track: Track, userId?: string | null): string {
  return scopedCacheKey("vocado-worlds-cache-v2", track, userId || "anon")
}

export function vocablesCacheKey(track: Track): string {
  return scopedCacheKey("vocado-vocables-cache-v2", track)
}

export function newsCacheKey(track: Track, category: string, level: string): string {
  return `${scopedCacheKey("vocado-news-cache-v2", track)}:${category}:${level}`
}

export function savedNewsKey(track: Track): string {
  return scopedCacheKey("vocado-saved-news-v2", track)
}

export function pendingWorldsKey(track: Track): string {
  return scopedCacheKey("vocado-pending-worlds-v2", track)
}

export function lastPlayedKey(track: Track): string {
  return scopedCacheKey("vocado-last-played-v2", track)
}

/**
 * Drop every cache belonging to a track. Used when a track is removed, and as
 * the belt-and-braces step on a switch — the new track's keys differ, so stale
 * entries are already unreachable, but leaving them costs quota forever.
 */
export function clearTrackCaches(track: Track, userId?: string | null): void {
  if (typeof window === "undefined") return
  for (const key of [
    worldsCacheKey(track, userId),
    vocablesCacheKey(track),
    savedNewsKey(track),
    pendingWorldsKey(track),
    lastPlayedKey(track),
  ]) {
    window.localStorage.removeItem(key)
  }
  // News caches carry category and level suffixes, so they need a prefix sweep.
  const newsPrefix = scopedCacheKey("vocado-news-cache-v2", track)
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(newsPrefix)) window.localStorage.removeItem(key)
  }
}

/**
 * Remove the pre-track cache entries once, so a user upgrading does not carry a
 * mixed-language blob around in localStorage forever. Safe to call repeatedly.
 */
export function purgeLegacyCaches(): void {
  if (typeof window === "undefined") return
  const legacyPrefixes = [
    "vocado-worlds-cache",
    "vocado-vocables-cache",
    "vocado-news-cache",
    "vocado-last-played",
  ]
  for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
    const key = window.localStorage.key(i)
    if (!key) continue
    // Only the unversioned originals; the v2 keys carry the marker.
    if (legacyPrefixes.some((prefix) => key.startsWith(prefix)) && !key.includes("-v2")) {
      window.localStorage.removeItem(key)
    }
  }
  window.localStorage.removeItem("vocado-saved-news")
  window.localStorage.removeItem("vocado-pending-worlds")
}
