"use client"

import { useEffect, useMemo, useState } from "react"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import { getUiSettings } from "@/lib/ui-settings"

const LANGUAGES = ["Español", "Deutsch", "English", "Français"]
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

type ProfileSettings = {
    level: string
    sourceLanguage: string
    targetLanguage: string
    newsCategory?: string
    seeds?: number
}

export default function ProfileClient({ profile }: { profile: ProfileSettings }) {
    const [draft, setDraft] = useState(profile)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    useEffect(() => {
        setDraft(profile)
    }, [profile])

    const uiSettings = useMemo(
        () => getUiSettings(draft.sourceLanguage),
        [draft.sourceLanguage]
    )

    const ui = useMemo(
        () => ({
            title: "Ich",
            sourceLabel: uiSettings?.onboarding?.sourceLabel ?? "Source",
            targetLabel: uiSettings?.onboarding?.targetLabel ?? "Target",
            levelLabel: uiSettings?.onboarding?.levelLabel ?? "Level",
            save: uiSettings?.profile?.save ?? "Save",
        }),
        [uiSettings]
    )

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
            <header className="px-5 py-4 sticky top-0 bg-[#FAF7F2]/95 backdrop-blur-sm z-40 border-b border-[#3A3A3A]/5">
                <h1 className="text-[18px] font-semibold text-center">{ui.title}</h1>
            </header>

            <div className="px-4 pt-6 space-y-4">
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
                            <option value="">Auto</option>
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
                            <option value="">Auto</option>
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

            <NavFooter />
        </div>
    )
}
