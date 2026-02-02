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
    const [leaderboardScope, setLeaderboardScope] = useState<"daily" | "weekly" | "overall" | "harvest">("weekly")
    const [leaderboardEntries, setLeaderboardEntries] = useState<
        Array<{ username: string; score: number; avatarUrl?: string | null; harvestCount?: number }>
    >([])
    const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())
    const [userHarvestCount, setUserHarvestCount] = useState<number>(0)

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

    // Load user's harvest count
    useEffect(() => {
        const loadHarvestCount = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data: profileData } = await supabase
                    .from("profiles")
                    .select("harvest_count")
                    .eq("id", user.id)
                    .single()

                if (profileData?.harvest_count) {
                    setUserHarvestCount(profileData.harvest_count)
                }
            } catch {
                // ignore
            }
        }
        loadHarvestCount()
    }, [])

    return (
        <div className="min-h-screen bg-[#F2F0E9] font-sans text-[#3A3A3A] pb-20">
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
                            { id: "harvest", label: ui.harvests },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setLeaderboardScope(tab.id as "daily" | "weekly" | "overall" | "harvest")}
                                className={[
                                    "rounded-full px-5 py-1.5 text-[12px] font-medium border transition-colors",
                                    leaderboardScope === tab.id
                                        ? "border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb)/0.2)] text-[#3A3A3A]"
                                        : "border-[#3A3A3A]/10 bg-[#F2F0E9] text-[#3A3A3A]/70",
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
                                    <div className="h-9 w-9 rounded-full border border-[#3A3A3A]/10 overflow-hidden bg-[#F2F0E9] flex items-center justify-center">
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
                                        {/* Harvest Count (show if NOT in harvest scope and > 0) */}
                                        {leaderboardScope !== "harvest" && (entry.harvestCount ?? 0) > 0 && (
                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgb(var(--vocado-accent-rgb)/0.15)]">
                                                <span className="text-[11px]">🥑</span>
                                                <span className="text-[10px] font-semibold text-[#3A3A3A]">
                                                    {entry.harvestCount}
                                                </span>
                                            </div>
                                        )}

                                        {/* Score */}
                                        <span className="text-[14px] font-semibold text-[#3A3A3A]/70">
                                            {entry.score.toLocaleString()} {leaderboardScope === "harvest" ? "🥑" : "🌱"}
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

                {/* Festive Harvest Showcase */}
                <div className="px-5 py-6">
                    <div className="bg-gradient-to-br from-[rgb(var(--vocado-accent-rgb)/0.2)] via-[#FAF7F2] to-[rgb(var(--vocado-accent-rgb)/0.15)] rounded-[24px] p-6 border-2 border-[rgb(var(--vocado-accent-rgb)/0.4)] shadow-[0_8px_32px_-8px_rgba(var(--vocado-accent-rgb),0.3)] relative overflow-hidden">
                        {/* Decorative elements */}
                        <div className="absolute top-0 right-0 text-[80px] opacity-10 select-none">🥑</div>
                        <div className="absolute bottom-0 left-0 text-[60px] opacity-10 select-none">✨</div>

                        <div className="relative z-10 text-center">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <span className="text-[32px] animate-bounce">🥑</span>
                                <Trophy className="w-6 h-6 text-yellow-500" />
                                <span className="text-[32px] animate-bounce" style={{ animationDelay: "0.1s" }}>🥑</span>
                            </div>

                            <h3 className="text-[18px] font-bold text-[#3A3A3A] mb-2">
                                {ui.harvests || "Harvests"}
                            </h3>

                            <div className="flex items-center justify-center gap-3 mb-2">
                                <div className="text-[48px] font-black text-[rgb(var(--vocado-accent-rgb))] drop-shadow-sm">
                                    {userHarvestCount}
                                </div>
                            </div>

                            <p className="text-[12px] text-[#3A3A3A]/70 font-medium">
                                {profile.sourceLanguage === "Español" ? "¡Ciclos completos de 7 días!" :
                                    profile.sourceLanguage === "Deutsch" ? "Abgeschlossene 7-Tage-Zyklen!" :
                                        profile.sourceLanguage === "Français" ? "Cycles de 7 jours terminés !" :
                                            profile.sourceLanguage === "Português" ? "Ciclos de 7 dias completos!" :
                                                "Completed 7-day cycles!"}
                            </p>

                            {userHarvestCount === 0 && (
                                <div className="mt-3 text-[11px] text-[#3A3A3A]/60 italic">
                                    {profile.sourceLanguage === "Español" ? "Completa tu primer ciclo para cosechar 🌱" :
                                        profile.sourceLanguage === "Deutsch" ? "Vervollständige deinen ersten Zyklus zum Ernten 🌱" :
                                            profile.sourceLanguage === "Français" ? "Terminez votre premier cycle pour récolter 🌱" :
                                                profile.sourceLanguage === "Português" ? "Complete seu primeiro ciclo para colher 🌱" :
                                                    "Complete your first cycle to harvest 🌱"}
                                </div>
                            )}

                            {userHarvestCount > 0 && (
                                <div className="mt-4 flex items-center justify-center gap-1 flex-wrap">
                                    {Array.from({ length: Math.min(userHarvestCount, 10) }).map((_, i) => (
                                        <span
                                            key={i}
                                            className="text-[24px] inline-block animate-pulse"
                                            style={{ animationDelay: `${i * 0.1}s` }}
                                        >
                                            🥑
                                        </span>
                                    ))}
                                    {userHarvestCount > 10 && (
                                        <span className="text-[14px] font-bold text-[rgb(var(--vocado-accent-rgb))]">
                                            +{userHarvestCount - 10}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <NavFooter labels={ui.nav} />
        </div>
    )
}
