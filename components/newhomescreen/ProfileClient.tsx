"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import { getUiSettings } from "@/lib/ui-settings"

const LANGUAGES = ["Español", "Deutsch", "English", "Français"]
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
const FALLBACK_AVATAR = "/profilepictures/happy_vocado.png"

type ProfileSettings = {
    name?: string
    avatarUrl?: string
    level: string
    sourceLanguage: string
    targetLanguage: string
    newsCategory?: string
    seeds?: number
}

export default function ProfileClient({ profile }: { profile: ProfileSettings }) {
    const router = useRouter()
    const [draft, setDraft] = useState(profile)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [googleAvatar, setGoogleAvatar] = useState<string>("")
    const [avatarOptions, setAvatarOptions] = useState<string[]>([])
    const [isEditingName, setIsEditingName] = useState(false)
    const [showAvatarPicker, setShowAvatarPicker] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        setDraft((prev) => ({
            ...prev,
            name: prev.name || profile.name,
            sourceLanguage: prev.sourceLanguage || profile.sourceLanguage,
            targetLanguage: prev.targetLanguage || profile.targetLanguage,
            level: prev.level || profile.level,
            newsCategory: prev.newsCategory || profile.newsCategory,
            avatarUrl: prev.avatarUrl || profile.avatarUrl,
            seeds: typeof prev.seeds === "number" ? prev.seeds : profile.seeds,
        }))
    }, [profile])

    const uiSettings = useMemo(
        () => getUiSettings(draft.sourceLanguage),
        [draft.sourceLanguage]
    )

    const ui = useMemo(
        () => ({
            nameLabel: uiSettings?.profile?.nameLabel ?? "Name",
            namePlaceholder: uiSettings?.profile?.namePlaceholder ?? "Your name",
            avatarLabel: uiSettings?.profile?.avatarLabel ?? "Profile picture",
            sourceLabel: uiSettings?.onboarding?.sourceLabel ?? "Source",
            targetLabel: uiSettings?.onboarding?.targetLabel ?? "Target",
            levelLabel: uiSettings?.onboarding?.levelLabel ?? "Level",
            save: uiSettings?.profile?.save ?? "Save",
            autoLabel: uiSettings?.profile?.autoLabel ?? "Auto",
            logout: uiSettings?.profile?.logout ?? uiSettings?.home?.logout ?? "Log out",
            nav: uiSettings?.nav ?? {},
        }),
        [uiSettings]
    )

    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem("vocado-profile-settings")
            if (!raw) return
            const parsed = JSON.parse(raw)
            const pickString = (value: unknown, fallback?: string) =>
                typeof value === "string" && value.trim().length > 0 ? value : fallback
            setDraft((prev) => ({
                ...prev,
                name: pickString(parsed?.name, prev.name),
                sourceLanguage: pickString(parsed?.sourceLanguage, prev.sourceLanguage),
                targetLanguage: pickString(parsed?.targetLanguage, prev.targetLanguage),
                level: pickString(parsed?.level, prev.level),
                newsCategory: pickString(parsed?.newsCategory, prev.newsCategory),
                avatarUrl: pickString(parsed?.avatarUrl, prev.avatarUrl),
            }))
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem("vocado-seeds")
            if (!raw) return
            const localSeeds = Number(raw)
            if (Number.isFinite(localSeeds)) {
                setDraft((prev) => ({
                    ...prev,
                    seeds: Math.max(prev.seeds ?? 0, localSeeds),
                }))
            }
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        const loadGoogleAvatar = async () => {
            const userRes = await supabase.auth.getUser()
            const metadata = userRes.data.user?.user_metadata as Record<string, unknown> | undefined
            const avatar =
                (typeof metadata?.avatar_url === "string" && metadata.avatar_url) ||
                (typeof metadata?.picture === "string" && metadata.picture) ||
                ""
            setGoogleAvatar(avatar)
            if (!draft.avatarUrl && avatar) {
                setDraft((prev) => ({ ...prev, avatarUrl: avatar }))
            }
            const name =
                (typeof metadata?.full_name === "string" && metadata.full_name) ||
                (typeof metadata?.name === "string" && metadata.name) ||
                (typeof metadata?.preferred_username === "string" && metadata.preferred_username) ||
                ""
            if (!draft.name && name) {
                setDraft((prev) => ({ ...prev, name }))
            }
        }
        loadGoogleAvatar()
    }, [draft.avatarUrl])

    useEffect(() => {
        const loadProfile = async () => {
            const userRes = await supabase.auth.getUser()
            const userId = userRes.data.user?.id
            if (!userId) return
            const baseSelect = "level,source_language,target_language,news_category,seeds,username"
            const withAvatar = await supabase
                .from("profiles")
                .select(`${baseSelect},avatar_url`)
                .eq("id", userId)
                .maybeSingle()
            let row = withAvatar.data
            if (withAvatar.error && typeof withAvatar.error.message === "string" && withAvatar.error.message.includes("avatar_url")) {
                const fallback = await supabase
                    .from("profiles")
                    .select(baseSelect)
                    .eq("id", userId)
                    .maybeSingle()
                row = fallback.data
            }
            if (!row) return
            setDraft((prev) => ({
                ...prev,
                name: prev.name || row.username || prev.name,
                sourceLanguage: prev.sourceLanguage || row.source_language || prev.sourceLanguage,
                targetLanguage: prev.targetLanguage || row.target_language || prev.targetLanguage,
                level: prev.level || row.level || prev.level,
                newsCategory: prev.newsCategory || row.news_category || prev.newsCategory,
                seeds: typeof row.seeds === "number" ? row.seeds : prev.seeds,
                avatarUrl: prev.avatarUrl || row.avatar_url || prev.avatarUrl,
            }))
        }
        loadProfile()
    }, [])

    useEffect(() => {
        const loadAvatarOptions = async () => {
            if (typeof window === "undefined") return
            try {
                const response = await fetch("/profilepictures/index.json", { cache: "no-store" })
                if (!response.ok) throw new Error("avatar list missing")
                const data = await response.json()
                if (Array.isArray(data) && data.length > 0) {
                    setAvatarOptions(data.filter((src) => typeof src === "string"))
                    if (!draft.avatarUrl && !googleAvatar) {
                        const fallback = data[Math.floor(Math.random() * data.length)] || FALLBACK_AVATAR
                        setDraft((prev) => ({ ...prev, avatarUrl: fallback }))
                    }
                    return
                }
            } catch {
                // ignore and fallback
            }
            setAvatarOptions([FALLBACK_AVATAR])
            if (!draft.avatarUrl && !googleAvatar) {
                setDraft((prev) => ({ ...prev, avatarUrl: FALLBACK_AVATAR }))
            }
        }
        loadAvatarOptions()
    }, [draft.avatarUrl, googleAvatar])

    useEffect(() => {
        if (typeof window === "undefined") return
        const payload = {
            name: draft.name,
            level: draft.level,
            sourceLanguage: draft.sourceLanguage,
            targetLanguage: draft.targetLanguage,
            newsCategory: draft.newsCategory,
            avatarUrl: draft.avatarUrl,
        }
        window.localStorage.setItem("vocado-profile-settings", JSON.stringify(payload))
    }, [draft.name, draft.level, draft.sourceLanguage, draft.targetLanguage, draft.newsCategory, draft.avatarUrl])

    const handleSave = async () => {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) return
        setIsSaving(true)
        setSaveError(null)
        try {
            const response = await fetch("/api/auth/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name: draft.name,
                    avatarUrl: draft.avatarUrl,
                    level: draft.level,
                    sourceLanguage: draft.sourceLanguage,
                    targetLanguage: draft.targetLanguage,
                }),
            })
            if (!response.ok) {
                const data = await response.json().catch(() => null)
                throw new Error(data?.error ?? "Save failed")
            }
            if (typeof window !== "undefined") {
                window.localStorage.setItem(
                    "vocado-profile-settings",
                    JSON.stringify({
                        level: draft.level,
                        sourceLanguage: draft.sourceLanguage,
                        targetLanguage: draft.targetLanguage,
                        newsCategory: draft.newsCategory,
                        name: draft.name,
                        avatarUrl: draft.avatarUrl,
                    })
                )
            }
        } catch (err) {
            setSaveError((err as Error).message)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
            <div className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#3A3A3A]/5 h-[56px] flex items-center px-5">
                <div className="h-5 w-5" />
                <h1 className="flex-1 text-center text-[18px] font-semibold text-[#3A3A3A]">
                    Profil
                </h1>
                <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">
                    {draft.seeds ?? 0} 🌱
                </span>
            </div>

            <div className="px-4 pt-6 space-y-4">
                <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => setShowAvatarPicker((prev) => !prev)}
                            className="relative h-20 w-20 rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] overflow-hidden"
                        >
                            <img
                                src={draft.avatarUrl || googleAvatar || FALLBACK_AVATAR}
                                alt="Profile"
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                    const target = e.currentTarget
                                    if (target.src.endsWith(FALLBACK_AVATAR)) return
                                    target.src = FALLBACK_AVATAR
                                }}
                            />
                            <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[#FAF7F2] border border-[#3A3A3A]/10 flex items-center justify-center text-[11px] text-[#3A3A3A]/70">
                                ✎
                            </span>
                        </button>

                        <div className="flex-1">
                            {isEditingName ? (
                                <input
                                    type="text"
                                    value={draft.name ?? ""}
                                    onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                                    onBlur={() => setIsEditingName(false)}
                                    placeholder={ui.namePlaceholder}
                                    className="w-full rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-[16px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40"
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsEditingName(true)}
                                    className={[
                                        "text-left text-[18px] font-semibold",
                                        draft.name ? "text-[#3A3A3A]" : "text-[#3A3A3A]/40 italic",
                                    ].join(" ")}
                                >
                                    {draft.name || ui.namePlaceholder}
                                </button>
                            )}
                        </div>
                    </div>

                    {showAvatarPicker && (
                        <div className="space-y-2">
                            <div className="text-[12px] font-medium text-[#3A3A3A]/60">
                                {ui.avatarLabel}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {avatarOptions.map((src) => (
                                    <button
                                        key={src}
                                        type="button"
                                        onClick={() => setDraft((prev) => ({ ...prev, avatarUrl: src }))}
                                        className={[
                                            "h-10 w-10 rounded-full border overflow-hidden",
                                            (draft.avatarUrl || FALLBACK_AVATAR) === src
                                                ? "border-[#9FB58E]"
                                                : "border-[#3A3A3A]/10",
                                        ].join(" ")}
                                    >
                                        <img
                                            src={src}
                                            alt="Option"
                                            className="h-full w-full object-cover"
                                            onError={(e) => {
                                                const target = e.currentTarget
                                                if (target.src.endsWith(FALLBACK_AVATAR)) return
                                                target.src = FALLBACK_AVATAR
                                            }}
                                        />
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-10 w-10 rounded-full border border-dashed border-[#3A3A3A]/20 text-[#3A3A3A]/60 text-[12px]"
                                >
                                    +
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        const reader = new FileReader()
                                        reader.onload = () => {
                                            const result = typeof reader.result === "string" ? reader.result : ""
                                            if (result) {
                                                setDraft((prev) => ({ ...prev, avatarUrl: result }))
                                            }
                                        }
                                        reader.readAsDataURL(file)
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 p-4 shadow-sm space-y-4">
                    <div>
                        <label className="text-[12px] font-medium text-[#3A3A3A]/60">
                            {ui.sourceLabel}
                        </label>
                        <select
                            value={draft.sourceLanguage}
                            onChange={(e) => setDraft((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                            className="mt-2 w-full rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-[14px] text-[#3A3A3A]"
                        >
                            <option value="">{ui.autoLabel}</option>
                            {LANGUAGES.map((lang) => (
                                <option key={lang} value={lang}>
                                    {lang}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[12px] font-medium text-[#3A3A3A]/60">
                            {ui.targetLabel}
                        </label>
                        <select
                            value={draft.targetLanguage}
                            onChange={(e) => setDraft((prev) => ({ ...prev, targetLanguage: e.target.value }))}
                            className="mt-2 w-full rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-[14px] text-[#3A3A3A]"
                        >
                            <option value="">{ui.autoLabel}</option>
                            {LANGUAGES.map((lang) => (
                                <option key={lang} value={lang}>
                                    {lang}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[12px] font-medium text-[#3A3A3A]/60">
                            {ui.levelLabel}
                        </label>
                        <select
                            value={draft.level}
                            onChange={(e) => setDraft((prev) => ({ ...prev, level: e.target.value }))}
                            className="mt-2 w-full rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] px-3 py-2 text-[14px] text-[#3A3A3A]"
                        >
                            {LEVELS.map((level) => (
                                <option key={level} value={level}>
                                    {level}
                                </option>
                            ))}
                        </select>
                    </div>

                    {saveError && (
                        <div className="text-[11px] text-[#B45353]">{saveError}</div>
                    )}

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full rounded-xl bg-[#9FB58E] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50 hover:bg-[#8CA77D] transition-colors"
                    >
                        {ui.save}
                    </button>
                </div>
            </div>

            <div className="px-4 pt-6">
                <button
                    type="button"
                    onClick={async () => {
                        await supabase.auth.signOut()
                        router.push("/login")
                    }}
                    className="w-full rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] px-4 py-2 text-[14px] font-medium text-[#3A3A3A] hover:bg-[#F0EDE6] transition-colors"
                >
                    {ui.logout}
                </button>
            </div>

            <NavFooter labels={ui.nav} />
        </div>
    )
}
