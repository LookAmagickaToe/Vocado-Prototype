// Server-side resolution of "who is this request, and which track is active?".
//
// Split from lib/track.ts because that module is imported by client components
// and must stay free of the Supabase service-role client.
//
// Every storage route repeated the same eight-line getUserId() helper. They now
// share this one, which also resolves the active track so scoping cannot be
// forgotten in one route and applied in another.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildTrack, type Track } from "@/lib/track"

export type RequestContext = {
  userId: string
  track: Track
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("authorization") || ""
  return auth.startsWith("Bearer ") ? auth.slice(7) : ""
}

export async function getUserId(req: Request): Promise<string | null> {
  const token = bearerToken(req)
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data.user?.id ?? null
}

/**
 * The active track for a user, read from the profile pointer columns.
 * `profiles` records which track is active; `user_tracks` holds the durable
 * per-track state.
 */
export async function getActiveTrack(userId: string): Promise<Track> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("source_language,target_language,active_variant")
    .eq("id", userId)
    .maybeSingle()

  return buildTrack({
    source: data?.source_language,
    target: data?.target_language,
    variant: data?.active_variant,
  })
}

/**
 * Resolve caller and track in one step. An explicit track in the request body or
 * query string wins over the profile — the client knows which track a screen is
 * showing, and a switch that has not yet round-tripped to `profiles` should not
 * write content into the previous track.
 */
export async function getRequestContext(
  req: Request,
  override?: { source?: unknown; target?: unknown; variant?: unknown }
): Promise<RequestContext | null> {
  const userId = await getUserId(req)
  if (!userId) return null

  if (override?.source && override?.target) {
    return { userId, track: buildTrack(override) }
  }

  return { userId, track: await getActiveTrack(userId) }
}

/** Pull a track override off a URL's query string, if present. */
export function trackFromSearchParams(params: URLSearchParams) {
  return {
    source: params.get("source_language") ?? undefined,
    target: params.get("target_language") ?? undefined,
    variant: params.get("variant") ?? undefined,
  }
}
