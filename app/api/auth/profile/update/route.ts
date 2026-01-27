import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

async function getUserId(req: Request) {
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data.user?.id ?? null
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const level =
      typeof body?.level === "string" ? body.level.trim() : undefined
    const sourceLanguage =
      typeof body?.sourceLanguage === "string" ? body.sourceLanguage.trim() : undefined
    const targetLanguage =
      typeof body?.targetLanguage === "string" ? body.targetLanguage.trim() : undefined
    const newsCategory =
      typeof body?.newsCategory === "string" ? body.newsCategory.trim() : undefined
    const name =
      typeof body?.name === "string" ? body.name.trim() : undefined
    const avatarUrl =
      typeof body?.avatarUrl === "string" ? body.avatarUrl.trim() : undefined
    const onboardingDone =
      typeof body?.onboardingDone === "boolean" ? body.onboardingDone : undefined

    const updates: Record<string, string | boolean | null> = {}
    if (level !== undefined) updates.level = level || null
    if (sourceLanguage !== undefined) updates.source_language = sourceLanguage || null
    if (targetLanguage !== undefined) updates.target_language = targetLanguage || null
    if (newsCategory !== undefined) updates.news_category = newsCategory || null
    if (name !== undefined) updates.username = name || null
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl || null
    if (onboardingDone !== undefined) updates.onboarding_done = onboardingDone

    if (!Object.keys(updates).length) {
      return NextResponse.json({ ok: true })
    }

    let { error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)

    const requestedAvatar = updates.avatar_url
    if (requestedAvatar) {
      try {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { avatar_url: requestedAvatar },
        })
      } catch {
        // ignore metadata update failures
      }
    }

    if (error && updates.avatar_url) {
      const message = typeof error.message === "string" ? error.message : ""
      if (message.includes("avatar_url")) {
        const retryPayload = { ...updates }
        delete retryPayload.avatar_url
        const retry = await supabaseAdmin
          .from("profiles")
          .update(retryPayload)
          .eq("id", userId)
        error = retry.error ?? null
      }
    }

    if (error) {
      return NextResponse.json({ error: "Update failed", details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", details: (error as Error).message },
      { status: 400 }
    )
  }
}
