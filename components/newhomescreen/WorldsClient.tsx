"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Plus, BookOpen, Upload, X, ChevronDown, ChevronRight, Play } from "lucide-react"
import NavFooter from "@/components/ui/NavFooter"
import type { World } from "@/types/worlds"

// --- THEME CONSTANTS ---
const COLORS = {
    bg: "#F6F2EB",
    bgCard: "#FAF7F2",
    accent: "#9FB58E",
    text: "#3A3A3A",
}

type WorldList = {
    id: string
    name: string
    worldIds: string[]
}

type ProfileSettings = {
    level: string
    sourceLanguage: string
    targetLanguage: string
    newsCategory?: string
    seeds?: number
}

type WorldsClientProps = {
    profile: ProfileSettings
    lists?: WorldList[]
    worlds?: World[]
}

export default function WorldsClient({ profile, lists = [], worlds = [] }: WorldsClientProps) {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState("")
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [showPromptInput, setShowPromptInput] = useState(false)
    const [promptText, setPromptText] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)

    // Expanded state tracking
    const [expandedListId, setExpandedListId] = useState<string | null>(null)
    const [expandedWorldId, setExpandedWorldId] = useState<string | null>(null)

    // Build a map of worldId -> world for quick lookup
    const worldMap = useMemo(() => {
        const map = new Map<string, World>()
        worlds.forEach(w => map.set(w.id, w))
        return map
    }, [worlds])

    // Filter lists by search
    const filteredLists = useMemo(() => {
        if (!searchQuery) return lists
        const q = searchQuery.toLowerCase()
        return lists.filter(list => {
            // Match list name
            if (list.name.toLowerCase().includes(q)) return true
            // Or match any world title within
            return list.worldIds.some(wId => {
                const w = worldMap.get(wId)
                return w?.title.toLowerCase().includes(q)
            })
        })
    }, [lists, searchQuery, worldMap])

    // Get levels count for a world
    const getLevelCount = (world: World): number => {
        if (!world.pool) return 0
        const itemsPerGame = world.chunking?.itemsPerGame ?? 8
        return Math.ceil(world.pool.length / itemsPerGame)
    }

    const handleListClick = (listId: string) => {
        setExpandedWorldId(null) // Close any expanded world
        setExpandedListId(prev => prev === listId ? null : listId)
    }

    const handleWorldClick = (worldId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setExpandedWorldId(prev => prev === worldId ? null : worldId)
    }

    const handleLevelClick = (worldId: string, levelIndex: number, e: React.MouseEvent) => {
        e.stopPropagation()
        router.push(`/play?world=${worldId}&level=${levelIndex}`)
    }

    const handleUpload = () => {
        setIsMenuOpen(false)
        setShowPromptInput(true)
    }

    const handleCreateWorld = async () => {
        if (!promptText.trim()) return
        setIsGenerating(true)

        await new Promise(resolve => setTimeout(resolve, 1500))
        // TODO: Implement actual world creation

        setPromptText("")
        setShowPromptInput(false)
        setIsGenerating(false)
    }

    return (
        <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
            {/* Header */}
            <header className="px-5 py-4 sticky top-0 bg-[#FAF7F2]/95 backdrop-blur-sm z-40 border-b border-[#3A3A3A]/5">
                <h1 className="text-[18px] font-semibold text-center">
                    Welten
                </h1>
            </header>

            {/* Search Bar */}
            <div className="px-4 pt-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3A3A3A]/40" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Suche Listen oder Welten..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] text-[14px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[#9FB58E]/40"
                    />
                </div>
            </div>

            {/* Prompt Input for new world */}
            <AnimatePresence>
                {showPromptInput && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pt-4 overflow-hidden"
                    >
                        <div className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/10 p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[13px] font-medium text-[#3A3A3A]">Neue Welt erstellen</span>
                                <button
                                    onClick={() => setShowPromptInput(false)}
                                    className="p-1 rounded-full hover:bg-[#3A3A3A]/5"
                                >
                                    <X className="w-4 h-4 text-[#3A3A3A]/50" />
                                </button>
                            </div>
                            <input
                                type="text"
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder="z.B. Spanische Reisevokabeln"
                                className="w-full px-3 py-2 rounded-lg border border-[#3A3A3A]/10 bg-[#F6F2EB] text-[14px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[#9FB58E]/40"
                                onKeyDown={(e) => e.key === "Enter" && handleCreateWorld()}
                            />
                            <button
                                onClick={handleCreateWorld}
                                disabled={isGenerating || !promptText.trim()}
                                className="mt-3 w-full py-2 rounded-xl bg-[#9FB58E] text-white text-[14px] font-medium disabled:opacity-50 transition-colors hover:bg-[#8CA77D]"
                            >
                                {isGenerating ? "Erstelle..." : "Welt erstellen"}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lists Section */}
            <div className="px-4 pt-4 space-y-3">
                {filteredLists.length === 0 ? (
                    <div className="text-center py-12 text-[#3A3A3A]/50 text-[14px]">
                        {searchQuery ? "Keine Listen gefunden" : "Erstelle deine erste Liste"}
                    </div>
                ) : (
                    filteredLists.map(list => (
                        <div key={list.id} className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 shadow-sm overflow-hidden">
                            {/* List Header */}
                            <button
                                onClick={() => handleListClick(list.id)}
                                className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#F6F2EB] transition-colors"
                            >
                                <div className="w-10 h-10 rounded-xl bg-[#E3EBC5]/40 flex items-center justify-center">
                                    {expandedListId === list.id ? (
                                        <ChevronDown className="w-5 h-5 text-[#9FB58E]" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-[#9FB58E]" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="text-[15px] font-medium text-[#3A3A3A]">{list.name}</div>
                                    <div className="text-[12px] text-[#3A3A3A]/50">
                                        {list.worldIds.length} Welt{list.worldIds.length !== 1 ? "en" : ""}
                                    </div>
                                </div>
                            </button>

                            {/* Expanded Worlds inside List */}
                            <AnimatePresence>
                                {expandedListId === list.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="border-t border-[#3A3A3A]/5 bg-[#F6F2EB]/50"
                                    >
                                        {list.worldIds.map(worldId => {
                                            const world = worldMap.get(worldId)
                                            if (!world) return null
                                            const levelCount = getLevelCount(world)
                                            const isWorldExpanded = expandedWorldId === worldId

                                            return (
                                                <div key={worldId}>
                                                    {/* World Row */}
                                                    <button
                                                        onClick={(e) => handleWorldClick(worldId, e)}
                                                        className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-[#F6F2EB] transition-colors"
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-white border border-[#3A3A3A]/5 flex items-center justify-center text-sm">
                                                            {isWorldExpanded ? (
                                                                <ChevronDown className="w-4 h-4 text-[#3A3A3A]/40" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 text-[#3A3A3A]/40" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="text-[14px] font-medium text-[#3A3A3A]">{world.title}</div>
                                                            <div className="text-[11px] text-[#3A3A3A]/50">
                                                                {levelCount} Level{levelCount !== 1 ? "s" : ""} • {world.pool?.length ?? 0} Wörter
                                                            </div>
                                                        </div>
                                                    </button>

                                                    {/* Expanded Levels inside World */}
                                                    <AnimatePresence>
                                                        {isWorldExpanded && (
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.15 }}
                                                                className="bg-white/50 border-t border-[#3A3A3A]/5"
                                                            >
                                                                {Array.from({ length: levelCount }, (_, i) => (
                                                                    <button
                                                                        key={i}
                                                                        onClick={(e) => handleLevelClick(worldId, i, e)}
                                                                        className="w-full flex items-center gap-3 px-10 py-2.5 text-left hover:bg-[#E3EBC5]/20 transition-colors"
                                                                    >
                                                                        <div className="w-6 h-6 rounded-full bg-[#9FB58E]/20 flex items-center justify-center">
                                                                            <Play className="w-3 h-3 text-[#9FB58E]" />
                                                                        </div>
                                                                        <span className="text-[13px] text-[#3A3A3A]/80">
                                                                            Level {i + 1}
                                                                        </span>
                                                                    </button>
                                                                ))}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))
                )}
            </div>

            {/* Floating Plus Button */}
            <div className="fixed bottom-24 right-6 z-50">
                <AnimatePresence>
                    {isMenuOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/20"
                                onClick={() => setIsMenuOpen(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                                className="absolute bottom-16 right-0 flex flex-col gap-2 items-end"
                            >
                                <button
                                    onClick={() => { setIsMenuOpen(false) }}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-lg border border-[#3A3A3A]/10"
                                >
                                    <BookOpen className="w-4 h-4 text-[#9FB58E]" />
                                    <span className="text-[13px] font-medium text-[#3A3A3A]">Bibliothek</span>
                                </button>
                                <button
                                    onClick={handleUpload}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-lg border border-[#3A3A3A]/10"
                                >
                                    <Upload className="w-4 h-4 text-[#9FB58E]" />
                                    <span className="text-[13px] font-medium text-[#3A3A3A]">Hochladen</span>
                                </button>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                <motion.button
                    onClick={() => setIsMenuOpen(prev => !prev)}
                    animate={{ rotate: isMenuOpen ? 45 : 0 }}
                    className="w-14 h-14 rounded-full bg-[#9FB58E] shadow-lg flex items-center justify-center"
                >
                    <Plus className="w-6 h-6 text-white" />
                </motion.button>
            </div>

            {/* Navigation Footer */}
            <NavFooter />
        </div>
    )
}
