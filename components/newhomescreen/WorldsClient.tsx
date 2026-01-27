"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Plus, BookOpen, Upload, X, ChevronDown, ChevronRight, Play, MoreHorizontal } from "lucide-react"
import NavFooter from "@/components/ui/NavFooter"
import type { World } from "@/types/worlds"
import { getUiSettings } from "@/lib/ui-settings"
import { formatTemplate } from "@/lib/ui"
import { supabase } from "@/lib/supabase/client"

// --- THEME CONSTANTS ---
const COLORS = {
    bg: "#F6F2EB",
    bgCard: "#FAF7F2",
    accent: "#9FB58E",
    text: "#3A3A3A",
}

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const normalizePos = (value: unknown) =>
    value === "verb" || value === "noun" || value === "adj" ? value : "other"
const normalizeEmoji = (value: unknown, fallback = "📘") => {
    if (typeof value !== "string") return fallback
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
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
    const [promptError, setPromptError] = useState<string | null>(null)
    const [cachedLists, setCachedLists] = useState<WorldList[]>(lists)
    const [cachedWorlds, setCachedWorlds] = useState<World[]>(worlds)
    const [cacheKey, setCacheKey] = useState("vocado-worlds-cache")

    // Expanded state tracking
    const [expandedListId, setExpandedListId] = useState<string | null>(null)
    const [expandedWorldId, setExpandedWorldId] = useState<string | null>(null)
    const [openWorldMenuId, setOpenWorldMenuId] = useState<string | null>(null)

    const uiSettings = useMemo(
        () => getUiSettings(profile.sourceLanguage),
        [profile.sourceLanguage]
    )
    const ui = useMemo(
        () => ({
            title: uiSettings?.worlds?.title ?? "Worlds",
            searchPlaceholder: uiSettings?.worlds?.searchPlaceholder ?? "Search lists or worlds...",
            emptySearch: uiSettings?.worlds?.emptySearch ?? "No lists found",
            emptyDefault: uiSettings?.worlds?.emptyDefault ?? "Create your first list",
            newWorldTitle: uiSettings?.worlds?.newWorldTitle ?? "Create new world",
            newWorldPlaceholder: uiSettings?.worlds?.newWorldPlaceholder ?? "e.g. Spanish travel vocab",
            newWorldAction: uiSettings?.worlds?.newWorldAction ?? "Create world",
            newWorldLoading: uiSettings?.worlds?.newWorldLoading ?? "Creating...",
            listWorldCount: uiSettings?.worlds?.listWorldCount ?? "{count} worlds",
            worldMeta: uiSettings?.worlds?.worldMeta ?? "{levels} levels • {words} words",
            levelItemLabel: uiSettings?.worlds?.levelItemLabel ?? "Level {count}",
            libraryAction: uiSettings?.worlds?.libraryAction ?? "Library",
            uploadAction: uiSettings?.worlds?.uploadAction ?? "Upload",
            deleteLabel: uiSettings?.worldsOverlay?.deleteLabel ?? "Delete",
            nav: uiSettings?.nav ?? {},
        }),
        [uiSettings]
    )

    // Build a map of worldId -> world for quick lookup
    const worldMap = useMemo(() => {
        const map = new Map<string, World>()
        cachedWorlds.forEach(w => map.set(w.id, w))
        return map
    }, [cachedWorlds])

    // Filter lists by search
    const filteredLists = useMemo(() => {
        if (!searchQuery) return cachedLists
        const q = searchQuery.toLowerCase()
        return cachedLists
            .map(list => {
                const listMatches = list.name.toLowerCase().includes(q)
                if (listMatches) {
                    return list
                }
                const matchingWorldIds = list.worldIds.filter(wId => {
                    const w = worldMap.get(wId)
                    return w?.title.toLowerCase().includes(q)
                })
                return { ...list, worldIds: matchingWorldIds }
            })
            .filter(list => list.worldIds.length > 0 || list.name.toLowerCase().includes(q))
    }, [cachedLists, searchQuery, worldMap])

    useEffect(() => {
        if (lists.length > 0) {
            setCachedLists(lists)
        }
        if (worlds.length > 0) {
            setCachedWorlds(worlds)
        }
    }, [lists, worlds])

    useEffect(() => {
        const hydrateCache = async () => {
            const session = await supabase.auth.getSession()
            const userId = session.data.session?.user?.id
            const key = `vocado-worlds-cache:${userId || "anon"}`
            setCacheKey(key)
            if (typeof window === "undefined") return
            const raw = window.localStorage.getItem(key)
            if (!raw) return
            try {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed?.lists)) {
                    setCachedLists(parsed.lists)
                }
                if (Array.isArray(parsed?.worlds)) {
                    setCachedWorlds(parsed.worlds)
                }
            } catch {
                // ignore cache parse errors
            }
        }
        hydrateCache()
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        if (!cacheKey) return
        window.localStorage.setItem(
            cacheKey,
            JSON.stringify({
                lists: cachedLists,
                worlds: cachedWorlds,
                updatedAt: Date.now(),
            })
        )
    }, [cacheKey, cachedLists, cachedWorlds])

    useEffect(() => {
        const fetchLatest = async () => {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) return
            try {
                const response = await fetch("/api/storage/worlds/list", {
                    method: "GET",
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!response.ok) return
                const data = await response.json()
                const listRows = Array.isArray(data?.lists) ? data.lists : []
                const worldRows = Array.isArray(data?.worlds) ? data.worlds : []
                if (listRows.length === 0 && worldRows.length === 0) return

                const listsById = new Map<string, WorldList>()
                listRows.forEach((row: any) => {
                    if (row?.id && row?.name) {
                        listsById.set(row.id, { id: row.id, name: row.name, worldIds: [] })
                    }
                })

                const listWorldsMap = new Map<string, Array<{ id: string; position: number }>>()
                worldRows.forEach((row: any) => {
                    if (row?.listId && listsById.has(row.listId)) {
                        const arr = listWorldsMap.get(row.listId) ?? []
                        arr.push({ id: row.worldId, position: row.position ?? 0 })
                        listWorldsMap.set(row.listId, arr)
                    }
                })

                listsById.forEach((list, id) => {
                    const entries = listWorldsMap.get(id) ?? []
                    entries.sort((a, b) => a.position - b.position)
                    list.worldIds = entries.map((entry) => entry.id)
                })

                const nextWorlds = worldRows
                    .map((row: any) => row?.json)
                    .filter((json: any) => json && typeof json.id === "string") as World[]

                setCachedLists(Array.from(listsById.values()))
                setCachedWorlds(nextWorlds)
            } catch {
                // ignore network errors
            }
        }
        fetchLatest()
    }, [])

    const deleteWorld = async (worldId: string) => {
        setCachedWorlds((prev) => prev.filter((world) => world.id !== worldId))
        setCachedLists((prev) =>
            prev.map((list) => ({
                ...list,
                worldIds: list.worldIds.filter((id) => id !== worldId),
            }))
        )
        setExpandedWorldId((prev) => (prev === worldId ? null : prev))
        setOpenWorldMenuId(null)
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) return
            await fetch("/api/storage/worlds/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ worldIds: [worldId] }),
            })
        } catch {
            // ignore delete failures for now
        }
    }

    // Get levels count for a world
    const getLevelCount = (world: World): number => {
        if (!world.pool) return 0
        const itemsPerGame = world.chunking?.itemsPerGame ?? 8
        return Math.ceil(world.pool.length / itemsPerGame)
    }

    const buildWorldFromAiItems = (
        items: any[],
        title: string,
        sourceLabel: string,
        targetLabel: string
    ): World => {
        const id = `upload-${Date.now()}`
        const cleanTitle = title.trim() || "New world"
        const pool = items
            .map((item, index) => {
                const source = normalizeText(item?.source)
                const target = normalizeText(item?.target)
                if (!source || !target) return null
                const pos = normalizePos(item?.pos)
                const explanation =
                    normalizeText(item?.explanation) || `Meaning of ${source}.`
                const example = normalizeText(item?.example) || `Example: ${source}.`
                return {
                    id: `${id}-${index}`,
                    es: source,
                    de: target,
                    image: { type: "emoji", value: normalizeEmoji(item?.emoji, "📘") } as any,
                    pos,
                    explanation,
                    example,
                }
            })
            .filter(Boolean) as any[]

        return {
            id,
            title: cleanTitle,
            description: cleanTitle,
            mode: "vocab",
            pool,
            chunking: { itemsPerGame: 8 },
            source_language: sourceLabel,
            target_language: targetLabel,
            ui: {
                vocab: {
                    carousel: {
                        primaryLabel: `${sourceLabel}:`,
                        secondaryLabel: `${targetLabel}:`,
                    },
                },
            },
        } as World
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
        const theme = promptText.trim()
        if (!theme) return
        setIsGenerating(true)
        setPromptError(null)
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) {
                throw new Error("Missing auth token")
            }

            const sourceLabel = profile.sourceLanguage || "Español"
            const targetLabel = profile.targetLanguage || "Deutsch"
            const response = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task: "theme_list",
                    theme,
                    count: 20,
                    level: profile.level || "A2",
                    sourceLabel,
                    targetLabel,
                }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data?.error || "AI request failed")
            }

            const items = Array.isArray(data?.items) ? data.items : []
            if (items.length === 0) {
                setPromptError(ui.emptySearch ?? "No words found")
                return
            }

            const generatedTitle =
                typeof data?.title === "string" && data.title.trim()
                    ? data.title.trim()
                    : theme
            const world = buildWorldFromAiItems(items, generatedTitle, sourceLabel, targetLabel)
            if (!world.pool || world.pool.length === 0) {
                setPromptError(ui.emptySearch ?? "No words found")
                return
            }

            let listId = cachedLists[0]?.id ?? ""
            if (!listId) {
                const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : `list-${Date.now()}`
                listId = uuid
                const newList = { id: listId, name: generatedTitle, worldIds: [] }
                setCachedLists((prev) => [...prev, newList])
                await fetch("/api/storage/state", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        lists: [{ id: listId, name: generatedTitle, position: cachedLists.length }],
                    }),
                })
            }

            await fetch("/api/storage/worlds/save", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    worlds: [world],
                    listId,
                    positions: { [world.id]: 0 },
                }),
            })

            setCachedWorlds((prev) => [...prev, world])
            setCachedLists((prev) =>
                prev.map((list) =>
                    list.id === listId
                        ? {
                              ...list,
                              worldIds: list.worldIds.includes(world.id)
                                  ? list.worldIds
                                  : [...list.worldIds, world.id],
                          }
                        : list
                )
            )
            setExpandedListId(listId)
            setPromptText("")
            setShowPromptInput(false)
        } catch (err) {
            setPromptError((err as Error).message)
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
            <div className="sticky top-0 z-40 bg-[#FAF7F2]/95 backdrop-blur-sm border-b border-[#3A3A3A]/5 h-[56px] flex items-center justify-between px-5">
                <div className="h-5 w-5" />
                <h1 className="text-[18px] font-semibold text-[#3A3A3A]">{ui.title}</h1>
                <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">
                    {profile.seeds ?? 0} 🌱
                </span>
            </div>

            {/* Search Bar */}
            <div className="px-4 pt-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3A3A3A]/40" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={ui.searchPlaceholder}
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
                                <span className="text-[13px] font-medium text-[#3A3A3A]">{ui.newWorldTitle}</span>
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
                                placeholder={ui.newWorldPlaceholder}
                                className="w-full px-3 py-2 rounded-lg border border-[#3A3A3A]/10 bg-[#F6F2EB] text-[14px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[#9FB58E]/40"
                                onKeyDown={(e) => e.key === "Enter" && handleCreateWorld()}
                            />
                            {promptError && (
                                <div className="mt-2 text-[11px] text-[#B45353]">{promptError}</div>
                            )}
                            <button
                                onClick={handleCreateWorld}
                                disabled={isGenerating || !promptText.trim()}
                                className="mt-3 w-full py-2 rounded-xl bg-[#9FB58E] text-white text-[14px] font-medium disabled:opacity-50 transition-colors hover:bg-[#8CA77D]"
                            >
                                {isGenerating ? ui.newWorldLoading : ui.newWorldAction}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lists Section */}
            <div className="px-4 pt-4 space-y-3">
                {filteredLists.length === 0 ? (
                    <div className="text-center py-12 text-[#3A3A3A]/50 text-[14px]">
                        {searchQuery ? ui.emptySearch : ui.emptyDefault}
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
                                        {formatTemplate(ui.listWorldCount, { count: String(list.worldIds.length) })}
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
                                                <div key={worldId} className="relative">
                                                    {/* World Row */}
                                                    <div className="w-full flex items-center gap-2 px-6 py-3 text-left hover:bg-[#F6F2EB] transition-colors">
                                                        <button
                                                            onClick={(e) => handleWorldClick(worldId, e)}
                                                            className="flex items-center gap-3 flex-1 text-left"
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
                                                                    {formatTemplate(ui.worldMeta, {
                                                                        levels: String(levelCount),
                                                                        words: String(world.pool?.length ?? 0),
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </button>
                                                        <div className="relative">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setOpenWorldMenuId((prev) => (prev === worldId ? null : worldId))
                                                                }}
                                                                className="h-8 w-8 rounded-full border border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/60 flex items-center justify-center hover:text-[#3A3A3A]"
                                                            >
                                                                <MoreHorizontal className="w-4 h-4" />
                                                            </button>
                                                            {openWorldMenuId === worldId && (
                                                                <div className="absolute right-0 mt-2 w-28 rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] shadow-sm overflow-hidden z-10">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            deleteWorld(worldId)
                                                                        }}
                                                                        className="w-full px-3 py-2 text-[12px] text-left text-[#3A3A3A] hover:bg-[#F6F2EB]"
                                                                    >
                                                                        {ui.deleteLabel}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

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
                                                                            {formatTemplate(ui.levelItemLabel, { count: String(i + 1) })}
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
                                    <span className="text-[13px] font-medium text-[#3A3A3A]">{ui.libraryAction}</span>
                                </button>
                                <button
                                    onClick={handleUpload}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-lg border border-[#3A3A3A]/10"
                                >
                                    <Upload className="w-4 h-4 text-[#9FB58E]" />
                                    <span className="text-[13px] font-medium text-[#3A3A3A]">{ui.uploadAction}</span>
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
            <NavFooter labels={ui.nav} />
        </div>
    )
}
