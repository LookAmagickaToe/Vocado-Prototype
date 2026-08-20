import { supabaseAdmin } from "@/lib/supabase/admin"
import { normalizeWord } from "@/lib/words"
import { slugifyVariant } from "@/lib/languages"
import type { Track } from "@/lib/track"

export type UserWordOrigin = "theme" | "news" | "selection" | "import"

type PoolLike = {
  es?: unknown
  de?: unknown
  source?: unknown
  target?: unknown
  pos?: unknown
  /**
   * Regional variety this word is specific to, as tagged by the AI at extraction
   * time. Absent or null means the word is standard and every variety of the
   * language inherits it.
   */
  variant?: unknown
}

export type KnownWord = {
  source: string
  target: string
  normSource: string
  normTarget: string
}

/**
 * A saved news article is a bookmark, not learned vocabulary — its words only
 * enter the index through the explicit "save vocabulary" action. Worlds ending in
 * `-verbs` hold conjugated forms rather than standalone words.
 */
export function shouldIndexWorld(world: any): boolean {
  if (!world || world.mode !== "vocab") return false
  if (world.news) return false
  if (typeof world.id === "string" && world.id.endsWith("-verbs")) return false
  return true
}

function toRows(
  userId: string,
  pool: PoolLike[],
  origin: UserWordOrigin,
  worldId: string | null,
  track: Track
) {
  const seen = new Set<string>()
  const rows = []
  for (const item of pool) {
    const source = String(item?.es ?? item?.source ?? "").trim()
    const target = String(item?.de ?? item?.target ?? "").trim()
    const normSource = normalizeWord(source)
    const normTarget = normalizeWord(target)
    if (!normSource || !normTarget) continue
    const key = `${normSource}::${normTarget}`
    if (seen.has(key)) continue
    seen.add(key)

    // A word is tagged with a variety only when the AI marked it as specific to
    // one. Everything else stays NULL — standard vocabulary that every variety of
    // this language inherits, so switching to Bayerisch never asks the learner to
    // re-learn a word they already know in standard Deutsch. A word can only
    // belong to the variety the session is actually in.
    const itemVariant = slugifyVariant(item?.variant)
    const variant = itemVariant && itemVariant === track.variant ? itemVariant : null

    rows.push({
      user_id: userId,
      norm_source: normSource,
      norm_target: normTarget,
      source,
      target,
      pos: typeof item?.pos === "string" ? item.pos : null,
      world_id: worldId,
      origin,
      source_language: track.source,
      target_language: track.target,
      variant,
    })
  }
  return rows
}

/**
 * Mirror a word pool into the user_words index. Never throws — indexing is a
 * side effect and must not fail the save it hangs off.
 */
export async function indexUserWords(
  userId: string,
  pool: PoolLike[],
  origin: UserWordOrigin,
  worldId: string | null = null,
  track: Track
): Promise<number> {
  try {
    return await saveUserWords(userId, pool, origin, worldId, track)
  } catch (error) {
    console.error("user_words index threw:", (error as Error).message)
    return 0
  }
}

/**
 * Persist an explicit vocabulary action. Unlike the best-effort mirror above,
 * this throws when Supabase rejects the write so the UI never reports a word as
 * saved when it only exists in React state.
 */
export async function saveUserWords(
  userId: string,
  pool: PoolLike[],
  origin: UserWordOrigin,
  worldId: string | null = null,
  track: Track
): Promise<number> {
  if (!Array.isArray(pool) || pool.length === 0) return 0
  const rows = toRows(userId, pool, origin, worldId, track)
  if (rows.length === 0) return 0

  const { error } = await supabaseAdmin
    .from("user_words")
    .upsert(rows, {
      // Scoped to the track, so the same spelling can exist in two languages
      // the user is learning. `variant` is absent on purpose: re-encountering a
      // standard word while in a variety session dedupes onto the existing row
      // instead of forking a copy.
      onConflict: "user_id,source_language,target_language,norm_source,norm_target",
      ignoreDuplicates: true,
    })

  if (error) throw new Error(error.message)
  return rows.length
}
