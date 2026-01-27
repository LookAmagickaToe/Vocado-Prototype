"use client"

import { useRouter, usePathname } from "next/navigation"
import { Star, Briefcase, BookOpen, User } from "lucide-react"
import clsx from "clsx"

type NavFooterProps = {
    showOnGame?: boolean
}

export default function NavFooter({ showOnGame = false }: NavFooterProps) {
    const router = useRouter()
    const pathname = usePathname()

    const isHome = pathname === "/"
    const isWorlds = pathname === "/worlds"
    const isVocables = pathname === "/vocables"
    const isProfile = pathname === "/profile"
    const isGame = pathname === "/play"

    // Hide on game page unless explicitly told to show
    if (isGame && !showOnGame) return null

    return (
        <nav className="fixed bottom-0 left-0 right-0 h-[56px] bg-[#FAF7F2]/95 backdrop-blur-md border-t border-[#3A3A3A]/5 flex items-center justify-around px-6 z-50">
            <NavTab
                icon={Star}
                label="Home"
                active={isHome}
                onClick={() => router.push("/")}
            />
            <NavTab
                icon={Briefcase}
                label="Welten"
                active={isWorlds}
                onClick={() => router.push("/worlds")}
            />
            <NavTab
                icon={BookOpen}
                label="Vokabeln"
                active={isVocables}
                onClick={() => router.push("/vocables")}
            />
            <NavTab
                icon={User}
                label="Ich"
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
                active ? "text-[#9FB58E]" : "text-[#3A3A3A]/40 hover:text-[#3A3A3A]/60"
            )}
        >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    )
}
