"use client"

import { useEffect, useState } from "react"
import { Trophy } from "lucide-react"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import { getUiSettings } from "@/lib/ui-settings"

type LeaderboardClientProps = {
    profile: {
        username: string
        seeds: number
        avatarUrl: string
        sourceLanguage: string
    }
}

export default function LeaderboardClient({ profile }: LeaderboardClientProps) {
    const [leaderboardScope, setLeaderboardScope] = useState<"daily" | "weekly" | "overall">("weekly")
    const [leaderboardEntries, setLeaderboardEntries] = useState<
        Array<{ username: string; score: number; avatarUrl?: string | null; harvestCount?: number }>
    >([])
    const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())

    const fullUi = getUiSettings(profile.sourceLanguage)

    const ui = {
        leaderboardTitle: fullUi.nav?.leaderboard || "Leaderboard",
        leaderboardDaily: profile.sourceLanguage === "Español" ? "Diario" :
            profile.sourceLanguage === "Deutsch" ? "Täglich" :
                profile.sourceLanguage === "Français" ? "Quotidien" :
                    profile.sourceLanguage === "Português" ? "Diário" : "Daily",
        leaderboardWeekly: profile.sourceLanguage === "Español" ? "Semanal" :
            profile.sourceLanguage === "Deutsch" ? "Wöchentlich" :
                profile.sourceLanguage === "Français" ? "Hebdomadaire" :
                    profile.sourceLanguage === "Português" ? "Semanal" : "Weekly",
        leaderboardOverall: profile.sourceLanguage === "Español" ? "General" :
            profile.sourceLanguage === "Deutsch" ? "Insgesamt" :
                profile.sourceLanguage === "Français" ? "Général" :
                    profile.sourceLanguage === "Português" ? "Geral" : "Overall",
        you: profile.sourceLanguage === "Español" ? "Tú" : "You",
        noEntries: profile.sourceLanguage === "Español" ? "Sin entradas aún" : "No entries yet",
        harvests: profile.sourceLanguage === "Español" ? "Cosechas" :
            profile.sourceLanguage === "Deutsch" ? "Ernten" :
                profile.sourceLanguage === "Français" ? "Récoltes" :
                    profile.sourceLanguage === "Português" ? "Colheitas" : "Harvests",
        nav: fullUi.nav,
    }

    // Load leaderboard
    useEffect(() => {
        const loadLeaderboard = async () => {
            try {
                const session = await supabase.auth.getSession()
                const token = session.data.session?.access_token
                if (!token) return
                const response = await fetch(`/api/leaderboard?scope=${leaderboardScope}`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!response.ok) return
                const data = await response.json()
                const entries = Array.isArray(data?.entries) ? data.entries : []
                setLeaderboardEntries(entries)
            } catch {
                // ignore
            }
        }
        loadLeaderboard()
    }, [leaderboardScope])

    return (
        <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-sm border-b border-[rgb(var(--vocado-divider-rgb)/0.2)] h-[56px] flex items-center px-5">
                <div className="flex-1" />
                <h1 className="text-[18px] font-semibold text-[#3A3A3A]">
                    {ui.leaderboardTitle}
                </h1>
                <div className="flex-1 flex justify-end">
                    <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">
                        {profile.seeds} 🌱
                    </span>
                </div>
            </div>

            {/* Main Content */}
            <div className="px-4 pt-6 space-y-4 max-w-md mx-auto">
                {/* Leaderboard Section */}
                <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 p-4 shadow-sm space-y-4">
                    <div className="flex items-center justify-center gap-2">
                        <Trophy className="w-6 h-6 text-[rgb(var(--vocado-accent-rgb))]" />
                        <h2 className="text-[18px] font-semibold text-[#3A3A3A]">
                            {ui.leaderboardTitle}
                        </h2>
                    </div>

                    {/* Scope Toggle */}
                    <div className="flex items-center justify-center gap-2">
                        {[
                            { id: "daily", label: ui.leaderboardDaily },
                            { id: "weekly", label: ui.leaderboardWeekly },
                            { id: "overall", label: ui.leaderboardOverall },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setLeaderboardScope(tab.id as "daily" | "weekly" | "overall")}
                                className={[
                                    "rounded-full px-5 py-1.5 text-[12px] font-medium border transition-colors",
                                    leaderboardScope === tab.id
                                        ? "border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb)/0.2)] text-[#3A3A3A]"
                                        : "border-[#3A3A3A]/10 bg-[#F6F2EB] text-[#3A3A3A]/70",
                                ].join(" ")}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Leaderboard List */}
                    <div className="space-y-2">
                        {leaderboardEntries.slice(0, 5).map((entry, index) => {
                            const entryKey = `${entry.username}-${index}`
                            const isCurrentUser = entry.username === profile.username
                            const showAvatar = entry.avatarUrl && !failedAvatars.has(entryKey)

                            return (
                                <div
                                    key={entryKey}
                                    className={[
                                        "flex items-center gap-3 p-3 rounded-xl border transition-all",
                                        isCurrentUser
                                            ? "bg-[rgb(var(--vocado-accent-rgb)/0.15)] border-[rgb(var(--vocado-accent-rgb)/0.3)] shadow-sm"
                                            : "bg-white border-[#3A3A3A]/5",
                                    ].join(" ")}
                                >
                                    {/* Rank */}
                                    <div className="w-8 text-center">
                                        {index === 0 ? (
                                            <Trophy className="w-5 h-5 text-yellow-500 mx-auto" />
                                        ) : (
                                            <span className="text-[13px] font-semibold text-[#3A3A3A]/40">
                                                #{index + 1}
                                            </span>
                                        )}
                                    </div>

                                    {/* Avatar */}
                                    <div className="h-9 w-9 rounded-full border border-[#3A3A3A]/10 overflow-hidden bg-[#F6F2EB] flex items-center justify-center">
                                        {showAvatar ? (
                                            <img
                                                src={entry.avatarUrl!}
                                                alt={entry.username}
                                                className="h-full w-full object-cover"
                                                onError={() => {
                                                    setFailedAvatars((prev) => new Set(prev).add(entryKey))
                                                }}
                                            />
                                        ) : (
                                            <span className="text-[12px] font-semibold text-[#3A3A3A]/60">
                                                {entry.username?.charAt(0)?.toUpperCase() ?? "U"}
                                            </span>
                                        )}
                                    </div>

                                    {/* Username */}
                                    <span className={[
                                        "flex-1 text-[14px]",
                                        isCurrentUser ? "font-semibold text-[#3A3A3A]" : "text-[#3A3A3A]/80"
                                    ].join(" ")}>
                                        {entry.username}
                                        {isCurrentUser && (
                                            <span className="ml-2 text-[11px] text-[rgb(var(--vocado-accent-rgb))]">
                                                ({ui.you || "You"})
                                            </span>
                                        )}
                                    </span>

                                    {/* Right: Harvest Count & Score */}
                                    <div className="ml-auto flex items-center gap-2">
                                        {/* Harvest Count */}
                                        {(entry.harvestCount ?? 0) > 0 && (
                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgb(var(--vocado-accent-rgb)/0.15)]">
                                                <span className="text-[11px]">🥑</span>
                                                <span className="text-[10px] font-semibold text-[#3A3A3A]">
                                                    {entry.harvestCount}
                                                </span>
                                            </div>
                                        )}

                                        {/* Score */}
                                        <span className="text-[14px] font-semibold text-[#3A3A3A]/70">
                                            {entry.score.toLocaleString()} 🌱
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                        {leaderboardEntries.length === 0 && (
                            <div className="text-center text-[13px] text-[#3A3A3A]/50 py-8">
                                {ui.noEntries || "No entries yet"}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <NavFooter labels={ui.nav} />
        </div>
    )
}
