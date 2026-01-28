"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
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
    accent: "rgb(var(--vocado-accent-rgb))",
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

type PendingWorldEntry = {
    world?: World
    listId?: string
    remove?: boolean
}

const PENDING_WORLDS_KEY = "vocado-pending-worlds"
const NEWS_LIST_NAME = "Vocado Diario"

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
    const cachedListsRef = useRef<WorldList[]>(lists)
    const cachedWorldsRef = useRef<World[]>(worlds)

    // Expanded state tracking
    const [expandedListId, setExpandedListId] = useState<string | null>(null)
    const [expandedWorldId, setExpandedWorldId] = useState<string | null>(null)
    const [openWorldMenuId, setOpenWorldMenuId] = useState<string | null>(null)
    const [openListMenuId, setOpenListMenuId] = useState<string | null>(null)
    const [confirmListAction, setConfirmListAction] = useState<{
        type: "empty" | "delete"
        listId: string
    } | null>(null)
    const [renameListId, setRenameListId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState("")
    const [isLoadingRemote, setIsLoadingRemote] = useState(false)

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
            loadingLabel: uiSettings?.worlds?.loading ?? "Loading...",
            listMenuRename: uiSettings?.worlds?.listMenuRename ?? "Rename list",
            listMenuEmpty: uiSettings?.worlds?.listMenuEmpty ?? "Empty list",
            listMenuDelete: uiSettings?.worlds?.listMenuDelete ?? "Remove list",
            listMenuRenamePlaceholder: uiSettings?.worlds?.listMenuRenamePlaceholder ?? "List name",
            listMenuConfirmEmpty:
                uiSettings?.worlds?.listMenuConfirmEmpty ??
                "Empty this list? {count} worlds will be removed.",
            listMenuConfirmDelete:
                uiSettings?.worlds?.listMenuConfirmDelete ??
                "Remove this list? {count} worlds will be removed.",
            listMenuConfirmYes: uiSettings?.worlds?.listMenuConfirmYes ?? "Yes",
            listMenuConfirmCancel: uiSettings?.worlds?.listMenuConfirmCancel ?? "Cancel",
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
                const matchingWorldIds = (list.worldIds ?? []).filter(wId => {
                    const w = worldMap.get(wId)
                    return w?.title.toLowerCase().includes(q)
                })
                return { ...list, worldIds: matchingWorldIds }
            })
            .filter(list => (list.worldIds ?? []).length > 0 || list.name.toLowerCase().includes(q))
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
        cachedListsRef.current = cachedLists
    }, [cachedLists])

    useEffect(() => {
        cachedWorldsRef.current = cachedWorlds
    }, [cachedWorlds])

    const applyPendingWorlds = useCallback(() => {
        if (typeof window === "undefined") return
        const raw = window.localStorage.getItem(PENDING_WORLDS_KEY)
        if (!raw) return
        let pending: PendingWorldEntry[] = []
        try {
            const parsed = JSON.parse(raw)
            pending = Array.isArray(parsed) ? parsed : []
        } catch {
            pending = []
        }
        if (!pending.length) {
            window.localStorage.removeItem(PENDING_WORLDS_KEY)
            return
        }
        setCachedWorlds((prev) => {
            let next = [...prev]
            pending.forEach((entry) => {
                const world = entry.world
                if (!world?.id) return
                if (entry.remove) {
                    next = next.filter((item) => item.id !== world.id)
                } else if (!next.some((item) => item.id === world.id)) {
                    next = [...next, world]
                }
            })
            return next
        })
        setCachedLists((prev) => {
            let nextLists = [...prev]
            pending.forEach((entry) => {
                const world = entry.world
                if (!world?.id) return
                const targetListId =
                    entry.listId ||
                    nextLists.find((list) => list.name.toLowerCase() === NEWS_LIST_NAME.toLowerCase())?.id ||
                    ""
                if (entry.remove) {
                    nextLists = nextLists.map((list) => ({
                        ...list,
                        worldIds: (list.worldIds ?? []).filter((id) => id !== world.id),
                    }))
                    return
                }
                if (!targetListId) return
                if (nextLists.some((list) => list.id === targetListId)) {
                    nextLists = nextLists.map((list) =>
                        list.id === targetListId
                            ? {
                                  ...list,
                                  worldIds: list.worldIds?.includes(world.id)
                                      ? list.worldIds
                                      : [...(list.worldIds ?? []), world.id],
                              }
                            : list
                    )
                    return
                }
                nextLists = [...nextLists, { id: targetListId, name: NEWS_LIST_NAME, worldIds: [world.id] }]
            })
            return nextLists
        })
        window.localStorage.removeItem(PENDING_WORLDS_KEY)
    }, [])

    useEffect(() => {
        const hydrateCache = async () => {
            const session = await supabase.auth.getSession()
            const storedUserId =
                typeof window !== "undefined" ? window.localStorage.getItem("vocado-user-id") : null
            const userId = session.data.session?.user?.id || storedUserId || "anon"
            const key = `vocado-worlds-cache:${userId}`
            const fallbackKey = "vocado-worlds-cache"
            setCacheKey(key)
            if (typeof window === "undefined") return
            const raw = window.localStorage.getItem(key) ?? window.localStorage.getItem(fallbackKey)
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
        applyPendingWorlds()
    }, [applyPendingWorlds])

    useEffect(() => {
        if (typeof window === "undefined") return
        if (!cacheKey) return
        const payload = JSON.stringify({
            lists: cachedLists,
            worlds: cachedWorlds,
            updatedAt: Date.now(),
        })
        window.localStorage.setItem(cacheKey, payload)
        window.localStorage.setItem("vocado-worlds-cache", payload)
    }, [cacheKey, cachedLists, cachedWorlds])

    const fetchLatest = useCallback(async () => {
        const perfEnabled =
            typeof window !== "undefined" &&
            window.localStorage.getItem("vocado-debug-perf") === "1"
        const perfStart = perfEnabled ? performance.now() : 0
        const logPerf = (label: string, extra?: Record<string, unknown>) => {
            if (!perfEnabled) return
            const elapsed = Math.round(performance.now() - perfStart)
            console.log(`[perf][worlds] ${label} (${elapsed}ms)`, extra || "")
        }
        setIsLoadingRemote(true)
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        const storedUserId =
            typeof window !== "undefined" ? window.localStorage.getItem("vocado-user-id") : null
        const userId = session.data.session?.user?.id || storedUserId || "anon"
        setCacheKey(`vocado-worlds-cache:${userId}`)
        if (!token) {
            setIsLoadingRemote(false)
            return
        }
        try {
            logPerf("session", { hasToken: Boolean(token) })
            const response = await fetch("/api/storage/worlds/list", {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok) return
            const data = await response.json()
            logPerf("response", {
                lists: Array.isArray(data?.lists) ? data.lists.length : 0,
                worlds: Array.isArray(data?.worlds) ? data.worlds.length : 0,
            })
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

            const localWorlds = cachedWorldsRef.current
            const localLists = cachedListsRef.current
            const mergedWorldsMap = new Map<string, World>()
            nextWorlds.forEach((world) => mergedWorldsMap.set(world.id, world))
            localWorlds.forEach((world) => {
                if (!mergedWorldsMap.has(world.id)) {
                    mergedWorldsMap.set(world.id, world)
                }
            })
            const mergedWorlds = Array.from(mergedWorldsMap.values())
            const mergedWorldIds = new Set(mergedWorlds.map((world) => world.id))

            const mergedListsById = new Map<string, WorldList>()
            const mergeListInto = (list: WorldList) => {
                if (mergedListsById.has(list.id)) {
                    const existing = mergedListsById.get(list.id)!
                    const combined = new Set([...(existing.worldIds ?? []), ...(list.worldIds ?? [])])
                    mergedListsById.set(list.id, { ...existing, worldIds: Array.from(combined) })
                    return
                }
                mergedListsById.set(list.id, { ...list, worldIds: list.worldIds ?? [] })
            }

            Array.from(listsById.values()).forEach(mergeListInto)
            localLists.forEach((list) => {
                const matchByName = Array.from(mergedListsById.values()).find(
                    (item) => item.name.toLowerCase() === list.name.toLowerCase()
                )
                if (matchByName) {
                    const combined = new Set([...(matchByName.worldIds ?? []), ...(list.worldIds ?? [])])
                    mergedListsById.set(matchByName.id, { ...matchByName, worldIds: Array.from(combined) })
                    return
                }
                mergeListInto({ ...list, worldIds: list.worldIds ?? [] })
            })

            const mergedLists = Array.from(mergedListsById.values()).map((list) => ({
                ...list,
                worldIds: (list.worldIds ?? []).filter((id) => mergedWorldIds.has(id)),
            }))

            setCachedLists(mergedLists)
            setCachedWorlds(mergedWorlds)
            logPerf("cached", { lists: mergedLists.length, worlds: mergedWorlds.length })
        } catch {
            // ignore network errors
        } finally {
            setIsLoadingRemote(false)
        }
    }, [])

    useEffect(() => {
        fetchLatest()
    }, [fetchLatest])

    useEffect(() => {
        if (typeof window === "undefined") return
        const flag = window.localStorage.getItem("vocado-refresh-worlds")
        if (flag) {
            window.localStorage.removeItem("vocado-refresh-worlds")
            fetchLatest()
        }
    }, [fetchLatest])

    useEffect(() => {
        if (typeof window === "undefined") return
        const handleStorage = (event: StorageEvent) => {
            if (!event.key) return
            if (event.key.startsWith("vocado-worlds-cache:") || event.key === "vocado-worlds-cache") {
                try {
                    const parsed = event.newValue ? JSON.parse(event.newValue) : null
                    if (Array.isArray(parsed?.lists)) {
                        setCachedLists(parsed.lists)
                    }
                    if (Array.isArray(parsed?.worlds)) {
                        setCachedWorlds(parsed.worlds)
                    }
                } catch {
                    // ignore
                }
            }
            if (event.key === PENDING_WORLDS_KEY) {
                applyPendingWorlds()
            }
            if (event.key === "vocado-refresh-worlds") {
                fetchLatest()
            }
        }
        window.addEventListener("storage", handleStorage)
        return () => window.removeEventListener("storage", handleStorage)
    }, [fetchLatest])

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

    const clearListWorlds = async (listId: string) => {
        const list = cachedLists.find((item) => item.id === listId)
        const worldIds = list?.worldIds ?? []
        if (!worldIds.length) return
        setCachedWorlds((prev) => prev.filter((world) => !worldIds.includes(world.id)))
        setCachedLists((prev) =>
            prev.map((item) => (item.id === listId ? { ...item, worldIds: [] } : item))
        )
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) return
            await fetch("/api/storage/worlds/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ worldIds }),
            })
        } catch {
            // ignore delete errors
        }
    }

    const handleRenameList = async () => {
        if (!renameListId) return
        const nextName = renameValue.trim()
        if (!nextName) return
        const listIndex = cachedLists.findIndex((list) => list.id === renameListId)
        if (listIndex < 0) return
        setCachedLists((prev) =>
            prev.map((list) =>
                list.id === renameListId ? { ...list, name: nextName } : list
            )
        )
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) return
            await fetch("/api/storage/state", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    lists: [
                        {
                            id: renameListId,
                            name: nextName,
                            position: listIndex,
                        },
                    ],
                }),
            })
        } catch {
            // ignore rename errors
        } finally {
            setRenameListId(null)
        }
    }

    const handleDeleteList = async (listId: string) => {
        const list = cachedLists.find((item) => item.id === listId)
        if (!list) return
        const worldIds = list.worldIds
        setCachedLists((prev) => prev.filter((item) => item.id !== listId))
        if (worldIds.length) {
            setCachedWorlds((prev) => prev.filter((world) => !worldIds.includes(world.id)))
        }
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) return
            await fetch("/api/storage/lists/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ listId }),
            })
        } catch {
            // ignore delete errors
        }
    }

    return (
        <div className="min-h-screen bg-[#F6F2EB] font-sans text-[#3A3A3A] pb-20">
            <div className="sticky top-0 z-40 bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-sm border-b border-[rgb(var(--vocado-divider-rgb)/0.2)] h-[56px] flex items-center justify-between px-5">
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
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] text-[14px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)]"
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
                                className="w-full px-3 py-2 rounded-lg border border-[#3A3A3A]/10 bg-[#F6F2EB] text-[14px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)]"
                                onKeyDown={(e) => e.key === "Enter" && handleCreateWorld()}
                            />
                            {promptError && (
                                <div className="mt-2 text-[11px] text-[#B45353]">{promptError}</div>
                            )}
                            <button
                                onClick={handleCreateWorld}
                                disabled={isGenerating || !promptText.trim()}
                                className="mt-3 w-full py-2 rounded-xl bg-[rgb(var(--vocado-accent-rgb))] text-white text-[14px] font-medium disabled:opacity-50 transition-colors hover:bg-[rgb(var(--vocado-accent-dark-rgb))]"
                            >
                                {isGenerating ? ui.newWorldLoading : ui.newWorldAction}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lists Section */}
            <div className="px-4 pt-4 space-y-3">
                {isLoadingRemote && (
                    <div className="text-[12px] text-[#3A3A3A]/50 px-1">
                        {ui.loadingLabel}
                    </div>
                )}
                {filteredLists.length === 0 ? (
                    <div className="text-center py-12 text-[#3A3A3A]/50 text-[14px]">
                        {searchQuery ? ui.emptySearch : ui.emptyDefault}
                    </div>
                ) : (
                    filteredLists.map(list => (
                        <div key={list.id} className="bg-[#FAF7F2] rounded-2xl border border-[#3A3A3A]/5 shadow-sm overflow-visible">
                            {/* List Header */}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => handleListClick(list.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") handleListClick(list.id)
                                }}
                                className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#F6F2EB] transition-colors"
                            >
                                <div className="w-10 h-10 rounded-xl bg-[#E3EBC5]/40 flex items-center justify-center">
                                    {expandedListId === list.id ? (
                                        <ChevronDown className="w-5 h-5 text-[rgb(var(--vocado-accent-rgb))]" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-[rgb(var(--vocado-accent-rgb))]" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="text-[15px] font-medium text-[#3A3A3A]">{list.name}</div>
                                    <div className="text-[12px] text-[#3A3A3A]/50">
                                        {formatTemplate(ui.listWorldCount, {
                                            count: String((list.worldIds ?? []).length),
                                        })}
                                    </div>
                                </div>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setOpenListMenuId((prev) => (prev === list.id ? null : list.id))
                                        }}
                                        className="h-8 w-8 rounded-full border border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/60 flex items-center justify-center hover:text-[#3A3A3A]"
                                    >
                                        <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                    {openListMenuId === list.id && (
                                        <div className="absolute right-0 mt-2 w-36 rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] shadow-sm overflow-hidden z-30">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setRenameListId(list.id)
                                                    setRenameValue(list.name)
                                                    setOpenListMenuId(null)
                                                }}
                                                className="w-full px-3 py-2 text-[12px] text-left text-[#3A3A3A] hover:bg-[#F6F2EB]"
                                            >
                                                {ui.listMenuRename}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setConfirmListAction({ type: "empty", listId: list.id })
                                                    setOpenListMenuId(null)
                                                }}
                                                className="w-full px-3 py-2 text-[12px] text-left text-[#3A3A3A] hover:bg-[#F6F2EB]"
                                            >
                                                {ui.listMenuEmpty}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setConfirmListAction({ type: "delete", listId: list.id })
                                                    setOpenListMenuId(null)
                                                }}
                                                className="w-full px-3 py-2 text-[12px] text-left text-[#B45353] hover:bg-[#F6F2EB]"
                                            >
                                                {ui.listMenuDelete}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

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
                                                                        <div className="w-6 h-6 rounded-full bg-[rgb(var(--vocado-accent-rgb)/0.2)] flex items-center justify-center">
                                                                            <Play className="w-3 h-3 text-[rgb(var(--vocado-accent-rgb))]" />
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
                                    <BookOpen className="w-4 h-4 text-[rgb(var(--vocado-accent-rgb))]" />
                                    <span className="text-[13px] font-medium text-[#3A3A3A]">{ui.libraryAction}</span>
                                </button>
                                <button
                                    onClick={handleUpload}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-lg border border-[#3A3A3A]/10"
                                >
                                    <Upload className="w-4 h-4 text-[rgb(var(--vocado-accent-rgb))]" />
                                    <span className="text-[13px] font-medium text-[#3A3A3A]">{ui.uploadAction}</span>
                                </button>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                <motion.button
                    onClick={() => setIsMenuOpen(prev => !prev)}
                    animate={{ rotate: isMenuOpen ? 45 : 0 }}
                    className="w-14 h-14 rounded-full bg-[rgb(var(--vocado-accent-rgb))] shadow-lg flex items-center justify-center"
                >
                    <Plus className="w-6 h-6 text-white" />
                </motion.button>
            </div>

            {/* Navigation Footer */}
            <NavFooter labels={ui.nav} />

            <AnimatePresence>
                {confirmListAction && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-sm rounded-2xl bg-[#FAF7F2] border border-[#3A3A3A]/10 p-4 space-y-3"
                        >
                            {(() => {
                                const list = cachedLists.find((item) => item.id === confirmListAction.listId)
                                const count = list?.worldIds.length ?? 0
                                const message =
                                    confirmListAction.type === "empty"
                                        ? formatTemplate(ui.listMenuConfirmEmpty, { count: String(count) })
                                        : formatTemplate(ui.listMenuConfirmDelete, { count: String(count) })
                                return (
                                    <>
                                        <div className="text-[14px] text-[#3A3A3A]">{message}</div>
                                        <div className="flex items-center gap-2 justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setConfirmListAction(null)}
                                                className="px-3 py-1.5 text-[12px] rounded-full border border-[#3A3A3A]/10 text-[#3A3A3A]/70"
                                            >
                                                {ui.listMenuConfirmCancel}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const listId = confirmListAction.listId
                                                    if (confirmListAction.type === "empty") {
                                                        await clearListWorlds(listId)
                                                    } else {
                                                        await handleDeleteList(listId)
                                                    }
                                                    setConfirmListAction(null)
                                                }}
                                                className="px-3 py-1.5 text-[12px] rounded-full bg-[#B45353] text-white"
                                            >
                                                {ui.listMenuConfirmYes}
                                            </button>
                                        </div>
                                    </>
                                )
                            })()}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {renameListId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-sm rounded-2xl bg-[#FAF7F2] border border-[#3A3A3A]/10 p-4 space-y-3"
                        >
                            <div className="text-[13px] text-[#3A3A3A]/70">{ui.listMenuRename}</div>
                            <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-[#3A3A3A]/10 bg-[#F6F2EB] text-[14px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/40 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--vocado-accent-rgb)/0.4)]"
                                placeholder={ui.listMenuRenamePlaceholder}
                            />
                            <div className="flex items-center gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setRenameListId(null)}
                                    className="px-3 py-1.5 text-[12px] rounded-full border border-[#3A3A3A]/10 text-[#3A3A3A]/70"
                                >
                                    {ui.listMenuConfirmCancel}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRenameList}
                                    className="px-3 py-1.5 text-[12px] rounded-full bg-[rgb(var(--vocado-accent-rgb))] text-white"
                                >
                                    {ui.listMenuConfirmYes}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
