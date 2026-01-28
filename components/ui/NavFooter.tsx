"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Star, Briefcase, BookOpen, User, Newspaper } from "lucide-react"
import clsx from "clsx"
import { getUiSettings } from "@/lib/ui-settings"

type NavFooterProps = {
    showOnGame?: boolean
    labels?: {
        home?: string
        worlds?: string
        news?: string
        vocables?: string
        profile?: string
    }
}

export default function NavFooter({ showOnGame = false, labels }: NavFooterProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [localLabels, setLocalLabels] = useState<NavFooterProps["labels"] | null>(null)

    useEffect(() => {
        if (labels || typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem("vocado-profile-settings")
            if (!raw) return
            const parsed = JSON.parse(raw)
            const uiSettings = getUiSettings(parsed?.sourceLanguage)
            if (uiSettings?.nav) {
                setLocalLabels(uiSettings.nav)
            }
        } catch {
            // ignore local fallback
        }
    }, [labels])

    const effectiveLabels = labels ?? localLabels ?? {}

    const isHome = pathname === "/"
    const isWorlds = pathname === "/worlds"
    const isVocables = pathname === "/vocables"
    const isProfile = pathname === "/profile"
    const isNews = pathname === "/news"
    const isGame = pathname === "/play"

    // Hide on game page unless explicitly told to show
    if (isGame && !showOnGame) return null

    return (
        <nav className="fixed bottom-0 left-0 right-0 h-[56px] bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-md border-t border-[rgb(var(--vocado-divider-rgb)/0.2)] flex items-center justify-around px-6 z-50">
            <NavTab
                icon={Star}
                label={effectiveLabels.home ?? "Home"}
                active={isHome}
                onClick={() => router.push("/")}
            />
            <NavTab
                icon={Briefcase}
                label={effectiveLabels.worlds ?? "Welten"}
                active={isWorlds}
                onClick={() => router.push("/worlds")}
            />
            <NavTab
                icon={Newspaper}
                label={effectiveLabels.news ?? "News"}
                active={isNews}
                onClick={() => router.push("/news")}
            />
            <NavTab
                icon={BookOpen}
                label={effectiveLabels.vocables ?? "Vokabeln"}
                active={isVocables}
                onClick={() => router.push("/vocables")}
            />
            <NavTab
                icon={User}
                label={effectiveLabels.profile ?? "Ich"}
                active={isProfile}
                onClick={() => router.push("/profile")}
            />
        </nav>
    )
}

function NavTab({ icon: Icon, label, active, onClick }: {
    icon: any;
    label: string;
    active: boolean;
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors",
                active ? "text-[rgb(var(--vocado-accent-rgb))]" : "text-[#3A3A3A]/40 hover:text-[#3A3A3A]/60"
            )}
        >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    )
}
