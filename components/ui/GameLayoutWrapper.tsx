"use client"

import NavFooter from "@/components/ui/NavFooter"
import type { ReactNode } from "react"

type GameLayoutWrapperProps = {
    children: ReactNode
}

export default function GameLayoutWrapper({ children }: GameLayoutWrapperProps) {
    return (
        <div className="min-h-screen bg-[#F6F2EB] text-[#3A3A3A] pb-20">
            {children}
            <NavFooter showOnGame={true} />
        </div>
    )
}
