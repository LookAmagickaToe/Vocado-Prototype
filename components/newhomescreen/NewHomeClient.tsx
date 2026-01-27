"use client"

import { Leaf, Camera, ChevronLeft, ChevronRight, Check, Briefcase, User, BookOpen, Star, MoreHorizontal, Users, Trophy, Play } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import WorldReviewOverlay, { type ReviewWord } from "./WorldReviewOverlay"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import type { VocabWorld } from "@/types/worlds"
import { getUiSettings } from "@/lib/ui-settings"

// --- THEME CONSTANTS ---
const COLORS = {
    bg: "#F6F2EB",       // Main Cream
    bgDark: "#FAF7F2",   // Secondary (slightly lighter/different tone per spec, but spec said 'minimal dunkleres Beige' which usually means slightly more defined. Let's use F2EFE8 for inset areas if needed, or stick to spec hexes)
    // Actually spec says: Main: #F6F2EB / #FAF7F2. Secondary: minimal dark beige.
    // Let's interpret: Screen BG = #F6F2EB. Cards/Input = #FAF7F2 (or slightly distinct).
    accent: "#9FB58E",   // Desaturated Avocado
    text: "#3A3A3A",     // Warm Dark Grey
}

const LAST_PLAYED_STORAGE_KEY = "vocado-last-played"

const getLastPlayedKey = (source?: string, target?: string) => {
    const src = source?.trim() || "auto"
    const tgt = target?.trim() || "auto"
    return `${LAST_PLAYED_STORAGE_KEY}:${src}:${tgt}`
}

// Profile settings type (matches HomeClient)
type ProfileSettings = {
    level: string
    sourceLanguage: string
    targetLanguage: string
    newsCategory?: string
    seeds?: number
    weeklySeeds?: number
    weeklySeedsWeekStart?: string
    weeklyWords?: number
    weeklyWordsWeekStart?: string
    dailyState?: { date: string; games: number; upload: boolean; news: boolean } | null
    dailyStateDate?: string
    onboardingDone?: boolean
}

type LastPlayed = {
    id: string
    title: string
    levelIndex?: number
}

type TranslateResult = {
    source: string
    target: string
    emoji?: string
    explanation?: string
    example?: string
}

type NewsReviewItem = {
    source: string
    target: string
    pos: "verb" | "noun" | "adj" | "other"
    emoji?: string
    explanation?: string
    example?: string
    syllables?: string
}

const normalizeText = (value: unknown) =>
    typeof value === "string" ? value.trim() : ""

const normalizePos = (value: unknown): NewsReviewItem["pos"] =>
    value === "verb" || value === "noun" || value === "adj" ? value : "other"

const normalizeEmoji = (value: unknown, fallback = "📰") => {
    if (typeof value !== "string") return fallback
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
}

const buildReviewItemsFromAi = (items: any[]) =>
    items.map((item) => ({
        source: normalizeText(item?.source),
        target: normalizeText(item?.target),
        pos: normalizePos(item?.pos),
        emoji: normalizeEmoji(item?.emoji, "📰"),
        explanation: normalizeText(item?.explanation) || undefined,
        example: normalizeText(item?.example) || undefined,
        syllables: normalizeText(item?.syllables) || undefined,
    })) as NewsReviewItem[]

const buildWorldFromItems = (
    items: NewsReviewItem[],
    sourceLabel: string,
    targetLabel: string,
    ui: any
): VocabWorld => {
    const id = `news-${Date.now()}`
    const pool = items.map((item, index) => {
        const explanation =
            item.explanation?.trim() || `Meaning of ${item.source}.`
        const example =
            item.example?.trim() || `Example: ${item.source}.`
        const syllables = item.syllables?.trim()
        const explanationWithSyllables =
            item.pos === "verb" && syllables && item.target
                ? `${explanation}\n${item.target}\n${syllables}`
                : explanation
        return {
            id: `${id}-${index}`,
            es: item.source,
            de: item.target,
            image: { type: "emoji", value: item.emoji?.trim() || "📰" } as any,
            pos: item.pos,
            explanation: explanationWithSyllables,
            example,
        }
    })
    return {
        id,
        title: "Noticias",
        description: "Noticias del día.",
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
    }
}

export default function NewHomeClient({ profile }: { profile: ProfileSettings }) {
    const router = useRouter()
    const [activeNewsTab, setActiveNewsTab] = useState("World")
    const [activeTab, setActiveTab] = useState("Home")
    const [seeds, setSeeds] = useState(profile.seeds ?? 0)

    // Profile & UserMenu state
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [profileSettings, setProfileSettings] = useState({
        level: profile.level,
        sourceLanguage: profile.sourceLanguage,
        targetLanguage: profile.targetLanguage,
        newsCategory: profile.newsCategory,
    })

    // Logic States
    const [newsItems, setNewsItems] = useState<Array<{ title: string, teaser?: string }>>([])
    const [currentNewsIndex, setCurrentNewsIndex] = useState(0)
    const [isNewsLoading, setIsNewsLoading] = useState(true)
    const [inputText, setInputText] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [isTranslating, setIsTranslating] = useState(false)
    const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null)
    const [translateError, setTranslateError] = useState<string | null>(null)
    const [translateMode, setTranslateMode] = useState(false)
    const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null)

    // Overlay State
    const [isOverlayOpen, setIsOverlayOpen] = useState(false)
    const [generatedWords, setGeneratedWords] = useState<ReviewWord[]>([])
    const [generatedTitle, setGeneratedTitle] = useState("")

    // Derived news values
    const currentNews = newsItems[currentNewsIndex] || null
    const currentNewsTeaser = currentNews?.teaser || ""
    const currentNewsBody = currentNewsTeaser || currentNews?.title || ""

    const uiSettings = useMemo(
        () => getUiSettings(profileSettings.sourceLanguage),
        [profileSettings.sourceLanguage]
    )
    const ui = useMemo(
        () => ({
            translateTitle: uiSettings?.home?.translateTitle ?? "Translate",
            translatePlaceholder: uiSettings?.home?.translatePlaceholder ?? "Type a word...",
            translateAction: uiSettings?.home?.translateAction ?? "Translate",
            profileSave: uiSettings?.profile?.save ?? "Save",
            sourceLabel: uiSettings?.onboarding?.sourceLabel ?? "Source",
            targetLabel: uiSettings?.onboarding?.targetLabel ?? "Target",
            levelLabel: uiSettings?.onboarding?.levelLabel ?? "Level",
            noWordsError: uiSettings?.errors?.newsNoWords ?? "No words found.",
        }),
        [uiSettings]
    )

    // Friends / Leaderboard Data
    const leaderboard = [
        { name: "Maxime", score: 1240, avatar: "M" },
        { name: "Sarah", score: 980, avatar: "S" },
        { name: "Tom", score: 850, avatar: "T" },
        { name: "You", score: 452, avatar: "ME", isMe: true },
        { name: "Anna", score: 320, avatar: "A" },
    ]

    const generateUuid = () => {
        if (typeof crypto !== "undefined") {
            if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
            if (typeof crypto.getRandomValues === "function") {
                const bytes = new Uint8Array(16)
                crypto.getRandomValues(bytes)
                bytes[6] = (bytes[6] & 0x0f) | 0x40
                bytes[8] = (bytes[8] & 0x3f) | 0x80
                const toHex = (b: number) => b.toString(16).padStart(2, "0")
                const hex = Array.from(bytes, toHex).join("")
                return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
                    16,
                    20
                )}-${hex.slice(20)}`
            }
        }
        return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`
    }

    const todayKey = new Date().toISOString().slice(0, 10)
    const isSameDay = (value?: string) => (value || "").slice(0, 10) === todayKey

    const ensureNewsListId = async (token: string) => {
        const response = await fetch("/api/storage/worlds/list", {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return ""
        const data = await response.json()
        const lists = Array.isArray(data?.lists) ? data.lists : []
        const existing = lists.find((list: any) => list?.name === "Vocado Diario")
        if (existing?.id) return existing.id
        const listId = generateUuid()
        await fetch("/api/storage/state", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                lists: [{ id: listId, name: "Vocado Diario", position: 0 }],
            }),
        })
        return listId
    }

    const loadCachedDailyNews = async (categoryValue: string) => {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) return null
        const response = await fetch("/api/storage/worlds/list", {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return null
        const data = await response.json()
        const worlds = Array.isArray(data?.worlds) ? data.worlds : []
        for (const entry of worlds) {
            const json = entry?.json
            if (!json || json.mode !== "vocab") continue
            const news = json.news
            if (!news?.summary?.length) continue
            if (news?.category !== categoryValue) continue
            if (!isSameDay(news?.date)) continue
            return json as VocabWorld
        }
        return null
    }

    // Fetch News (cached daily summary first)
    const newsDepsKey = useMemo(
        () =>
            `${activeNewsTab}|${profileSettings.level}|${profileSettings.sourceLanguage}|${profileSettings.targetLanguage}`,
        [activeNewsTab, profileSettings.level, profileSettings.sourceLanguage, profileSettings.targetLanguage]
    )

    useEffect(() => {
        const fetchNews = async () => {
            setIsNewsLoading(true)
            try {
                const categoryMap: Record<string, string> = {
                    World: "world",
                    Economics: "wirtschaft",
                    Sport: "sport",
                }
                const category = categoryMap[activeNewsTab] || "world"
                const cached = await loadCachedDailyNews(category)
                if (cached) {
                    const summaryLine = cached.news?.summary?.[0] || ""
                    setNewsItems([{ title: cached.news?.title || cached.title, teaser: summaryLine }])
                    setCurrentNewsIndex(0)
                    setIsNewsLoading(false)
                    return
                }

                const res = await fetch(`/api/news/tagesschau?ressort=${category}`)
                const data = await res.json()
                const list = Array.isArray(data?.items) ? data.items : []
                const topHeadline = list[0]
                if (!topHeadline?.url) {
                    setNewsItems([])
                    setIsNewsLoading(false)
                    return
                }

                const result = await callAi({
                    task: "news",
                    url: topHeadline.url,
                    level: profileSettings.level || undefined,
                    sourceLabel: profileSettings.sourceLanguage || "Español",
                    targetLabel: profileSettings.targetLanguage || "Alemán",
                })

                const nextSummary = Array.isArray(result?.summary) ? result.summary : []
                const nextItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])
                const newsWorld = {
                    ...buildWorldFromItems(nextItems, profileSettings.sourceLanguage || "Español", profileSettings.targetLanguage || "Alemán", ui),
                    title: `Vocado Diario - ${topHeadline.title || "Noticia"}`,
                    description: "Noticias del día.",
                    news: {
                        summary: nextSummary,
                        sourceUrl: topHeadline.url,
                        title: topHeadline.title || "Noticia",
                        category,
                        date: new Date().toISOString(),
                    },
                }

                const session = await supabase.auth.getSession()
                const token = session.data.session?.access_token
                if (token) {
                    const listId = await ensureNewsListId(token)
                    await fetch("/api/storage/worlds/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            worlds: [newsWorld],
                            listId: listId || null,
                            positions: { [newsWorld.id]: 0 },
                        }),
                    })
                }

                const summaryLine = nextSummary[0] || ""
                setNewsItems([{ title: topHeadline.title || "Noticia", teaser: summaryLine }])
                setCurrentNewsIndex(0)
            } catch (e) {
                console.error("News fetch error", e)
            } finally {
                setIsNewsLoading(false)
            }
        }
        fetchNews()
    }, [newsDepsKey])

    // News navigation handlers
    const handlePrevNews = () => {
        setCurrentNewsIndex(prev => (prev > 0 ? prev - 1 : newsItems.length - 1))
    }

    const handleNextNews = () => {
        setCurrentNewsIndex(prev => (prev < newsItems.length - 1 ? prev + 1 : 0))
    }

    useEffect(() => {
        if (typeof window === "undefined") return
        const key = getLastPlayedKey(profileSettings.sourceLanguage, profileSettings.targetLanguage)
        const raw = window.localStorage.getItem(key)
        if (!raw) {
            setLastPlayed(null)
            return
        }
        try {
            const parsed = JSON.parse(raw)
            if (parsed?.id && parsed?.title) {
                setLastPlayed(parsed)
            } else {
                setLastPlayed(null)
            }
        } catch {
            setLastPlayed(null)
        }
    }, [profileSettings.sourceLanguage, profileSettings.targetLanguage])

    // Handle Create World
    const handleCreateWorld = async () => {
        if (!inputText.trim()) return
        setIsGenerating(true)
        try {
            // TODO: Replace with actual AI integration
            // For now, simulate generating words
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Simulated generated words
            const mockWords: ReviewWord[] = [
                { id: "1", source: "hola", target: "Hallo", status: "new", emoji: "👋" },
                { id: "2", source: "gracias", target: "Danke", status: "new", emoji: "🙏" },
                { id: "3", source: "por favor", target: "Bitte", status: "new", emoji: "🙂" },
                { id: "4", source: "adiós", target: "Tschüss", status: "new", emoji: "👋" },
                { id: "5", source: "buenos días", target: "Guten Morgen", status: "new", emoji: "🌅" },
            ]

            setGeneratedTitle(inputText.trim())
            setGeneratedWords(mockWords)
            setIsOverlayOpen(true)
            setInputText("")
        } catch (e) {
            console.error(e)
        } finally {
            setIsGenerating(false)
        }
    }

    const callAi = async (payload: Record<string, unknown>) => {
        const response = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        })
        let data: any = null
        try {
            data = await response.json()
        } catch {
            const text = await response.text().catch(() => "")
            data = { error: text }
        }
        if (!response.ok) {
            throw new Error(data?.error || "AI request failed")
        }
        return data
    }

    const handleTranslate = async () => {
        if (!inputText.trim()) return
        setTranslateError(null)
        setIsTranslating(true)
        try {
            const result = await callAi({
                task: "parse_text",
                text: inputText,
                sourceLabel: profileSettings.sourceLanguage || "Español",
                targetLabel: profileSettings.targetLanguage || "Alemán",
                level: profileSettings.level || undefined,
            })
            const items = Array.isArray(result?.items) ? result.items : []
            if (!items.length) {
                setTranslateError(ui.noWordsError)
                setTranslateResult(null)
                return
            }
            const item = items[0]
            setTranslateResult({
                source: normalizeText(item?.source),
                target: normalizeText(item?.target),
                explanation: normalizeText(item?.explanation) || undefined,
                example: normalizeText(item?.example) || undefined,
                emoji: normalizeEmoji(item?.emoji, "📝"),
            })
        } catch (err) {
            setTranslateError((err as Error).message)
        } finally {
            setIsTranslating(false)
        }
    }

    const toggleTranslateMode = () => {
        if (translateMode) {
            if (inputText.trim()) {
                handleTranslate()
                return
            }
            setTranslateMode(false)
            return
        }
        setTranslateMode(true)
        if (inputText.trim()) {
            handleTranslate()
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push("/login")
    }

    // Overlay handlers
    const handleOverlayClose = () => {
        setIsOverlayOpen(false)
    }

    const handleOverlaySave = (words: ReviewWord[], worldId: string | null, title: string) => {
        // TODO: Save to Supabase
        console.log("Saving world:", { words, worldId, title })
        setIsOverlayOpen(false)
    }

    const handleOverlayPlayNow = (words: ReviewWord[], worldId: string | null, title: string) => {
        // TODO: Save to Supabase and navigate to game
        console.log("Play now:", { words, worldId, title })
        setIsOverlayOpen(false)
        // router.push("/play")
    }

    const handleGenerateMoreWords = async (count: number, existingWords: ReviewWord[]): Promise<ReviewWord[]> => {
        // TODO: Replace with actual AI call
        await new Promise(resolve => setTimeout(resolve, 1500))

        const newWords: ReviewWord[] = Array.from({ length: count }, (_, i) => ({
            id: `gen-${Date.now()}-${i}`,
            source: `palabra ${existingWords.length + i + 1}`,
            target: `Wort ${existingWords.length + i + 1}`,
            status: "new" as const,
        }))

        return newWords
    }

    // Render Friends Page if active
    if (activeTab === "Friends") {
        return (
            <div className={`min-h-screen bg-[${COLORS.bg}] font-sans text-[${COLORS.text}] pb-16 relative overflow-hidden`}>
                <header className="px-5 py-4 flex items-center justify-between sticky top-0 bg-[#FAF7F2]/95 backdrop-blur-sm z-40 border-b border-[#3A3A3A]/5">
                    <h1 className="text-[18px] font-semibold text-[#3A3A3A]">Leaderboard</h1>
                    <div className="w-[32px] h-[32px] rounded-full bg-[#EAE8E0] border border-white/40 flex items-center justify-center text-[10px] text-[#8A8A8A]">ME</div>
                </header>
                <div className="px-4 py-4 space-y-3">
                    {leaderboard.map((user, i) => (
                        <div key={user.name} className={`flex items-center justify-between p-3 rounded-[16px] border ${user.isMe ? 'bg-[#E3EBC5]/30 border-[#9FB58E]/30' : 'bg-white border-[#3A3A3A]/5'} shadow-sm`}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 flex items-center justify-center font-bold text-[#3A3A3A]/40 text-xs">
                                    {i === 0 ? <Trophy className="w-4 h-4 text-yellow-500" /> : i + 1}
                                </div>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${user.isMe ? 'bg-[#9FB58E] text-white' : 'bg-[#EAE8E0] text-[#3A3A3A]/60'}`}>
                                    {user.avatar}
                                </div>
                                <span className={`text-[14px] font-medium ${user.isMe ? 'text-[#3A3A3A]' : 'text-[#3A3A3A]/80'}`}>{user.name}</span>
                            </div>
                            <span className="text-[13px] font-semibold text-[#3A3A3A]/60">{user.score} 🌱</span>
                        </div>
                    ))}
                </div>
                {/* Navigation */}
                <nav className="fixed bottom-0 left-0 right-0 h-[40px] bg-[#FAF7F2]/95 backdrop-blur-md border-t border-[#3A3A3A]/5 flex items-start justify-between px-6 pt-1.5 z-50 text-[#3A3A3A]/40">
                    <NavTab icon={Star} label="Home" active={activeTab === "Home"} onClick={() => setActiveTab("Home")} />
                    <NavTab icon={Briefcase} label="Worlds" active={activeTab === "Worlds"} onClick={() => setActiveTab("Worlds")} />
                    <NavTab icon={BookOpen} label="Vocables" active={activeTab === "Vocables"} onClick={() => setActiveTab("Vocables")} />
                    <NavTab icon={Users} label="Friends" active={activeTab === "Friends"} onClick={() => setActiveTab("Friends")} />
                    <NavTab icon={User} label="Me" active={activeTab === "Me"} onClick={() => setActiveTab("Me")} />
                </nav>
            </div>
        )
    }

    return (
        <div className={`min-h-screen bg-[${COLORS.bg}] font-sans text-[${COLORS.text}] pb-16 relative overflow-hidden selection:bg-[#E3EBC5] selection:text-[#2C3E30]`}>

            {/* --- HEADER --- */}
            <header className="px-5 py-2 flex items-center justify-between sticky top-0 bg-[#FAF7F2]/95 backdrop-blur-sm z-40">
                {/* Center: Title / Learned Today */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center">
                    <h1 className="text-[18px] font-semibold tracking-tight text-[#3A3A3A]">
                        Voc<span className="text-[#9FB58E]">ado</span>
                    </h1>
                </div>

                {/* Right: Avatar & Seeds */}
                <div className="flex-1 flex justify-end items-center gap-2.5 relative">
                    <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">{seeds} 🌱</span>
                    <button
                        onClick={() => setShowUserMenu(prev => !prev)}
                        className="w-[32px] h-[32px] rounded-full bg-[#EAE8E0] border border-white/40 shadow-sm overflow-hidden relative focus:outline-none focus:ring-2 focus:ring-[#9FB58E]/40"
                    >
                        {/* Placeholder Avatar */}
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[#8A8A8A]">ME</div>
                    </button>

                    {showUserMenu && (
                        <div className="absolute top-full right-0 mt-2 z-50">
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="rounded-xl border border-[#3A3A3A]/10 bg-[#FAF7F2] px-4 py-2 text-[12px] text-[#3A3A3A] shadow-sm"
                            >
                                Log out
                            </button>
                        </div>
                    )}
                </div>
            </header>


            <main className="px-4 pt-4 max-w-md mx-auto space-y-2">

                {/* --- 1. AI INPUT (Primary Focus) --- */}
                <section className="relative mt-1.5">
                    <div className="mb-1.5 pl-1 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-[#3A3A3A]/60">Create your World with AI</span>
                        <button
                            type="button"
                            onClick={toggleTranslateMode}
                            disabled={isTranslating}
                            className={clsx(
                                "rounded-full border px-3 py-1 text-[10px] font-semibold shadow-sm transition-colors disabled:opacity-50",
                                translateMode
                                    ? "border-[#9FB58E] bg-[#9FB58E]/20 text-[#3A3A3A]"
                                    : "border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/70"
                            )}
                        >
                            {ui.translateAction}
                        </button>
                    </div>
                    <div className="relative group mb-1">
                        <div className="absolute inset-0 bg-[#EFEBE4] rounded-[20px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)] transition-all" />
                        <div className="relative flex items-center gap-2 p-2.5">
                            <input
                                type="text"
                                className="bg-transparent border-none outline-none text-[15px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/30 font-normal pr-8 w-[75%]"
                                placeholder={isGenerating ? "Creating world..." : ui.translatePlaceholder}
                                value={inputText}
                                onChange={(e) => {
                                    setInputText(e.target.value)
                                    setTranslateError(null)
                                    setTranslateResult(null)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter") return
                                    if (translateMode) {
                                        handleTranslate()
                                    } else {
                                        handleCreateWorld()
                                    }
                                }}
                                disabled={isGenerating}
                            />
                            {/* Camera Icon - Part of field */}
                            <button
                                onClick={() => {
                                    if (translateMode) {
                                        handleTranslate()
                                    } else {
                                        handleCreateWorld()
                                    }
                                }}
                                disabled={isGenerating || isTranslating}
                                className="absolute right-3.5 text-[#3A3A3A]/40 hover:text-[#3A3A3A]/70 transition-colors disabled:opacity-50"
                            >
                                <Camera className="w-4.5 h-4.5" strokeWidth={1.8} />
                            </button>
                        </div>
                    </div>
                    <div className="px-1.5">
                        <p className="text-[9px] leading-tight text-[#3A3A3A]/30 font-medium tracking-tight">
                            Paste text, write what you want to learn or drop a link, photo, or file
                        </p>
                    </div>
                    <AnimatePresence>
                        {(translateResult || translateError) && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                className="mt-2 bg-[#FAF7F2] rounded-[16px] border border-[#3A3A3A]/5 p-3 shadow-[0_2px_10px_-6px_rgba(58,58,58,0.08)]"
                            >
                                {translateResult ? (
                                    <div className="space-y-1">
                                        <div className="text-[13px] font-medium text-[#3A3A3A]">
                                            {translateResult.emoji ? `${translateResult.emoji} ` : ""}{translateResult.source} → {translateResult.target}
                                        </div>
                                        {translateResult.explanation && (
                                            <div className="text-[11px] text-[#3A3A3A]/60">
                                                {translateResult.explanation}
                                            </div>
                                        )}
                                        {translateResult.example && (
                                            <div className="text-[10px] text-[#3A3A3A]/50">
                                                {translateResult.example}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-[#B45353]">{translateError}</div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>

                {/* --- 2. TODAY'S NEWS --- */}
                <section className="my-3">
                    <h2 className="font-serif text-[16px] text-[#3A3A3A] mb-1.5 pl-1 tracking-tight">Today's News</h2>

                    {/* News Card */}
                    <div className="bg-[#FAF7F2] rounded-[24px] p-1 shadow-[0_4px_20px_-8px_rgba(58,58,58,0.03)] border border-[#3A3A3A]/5 overflow-hidden">

                        {/* Categories */}
                        <div className="flex items-center justify-center gap-6 pt-2 pb-1.5 text-[11px] font-medium text-[#3A3A3A]/50 border-b border-[#3A3A3A]/5">
                            {["World", "Economics", "Sport"].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveNewsTab(cat)}
                                    className={`pb-0.5 relative transition-colors ${activeNewsTab === cat ? 'text-[#3A3A3A]' : 'hover:text-[#3A3A3A]/80'}`}
                                >
                                    {cat}
                                    {activeNewsTab === cat && (
                                        <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#3A3A3A]/20" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="p-2.5 pt-2 flex flex-col h-[180px]"> {/* Fixed height container */}
                            <h3 className="font-serif text-[16px] leading-[1.2] text-[#3A3A3A]/40 mb-4 text-center px-1 line-clamp-2 h-[40px] flex items-center justify-center">
                                {isNewsLoading ? "Loading..." : (currentNews?.title || "No News Available")}
                            </h3>

                            {/* Text Preview in Placeholder */}
                            <div className="relative flex-1 overflow-hidden bg-[#EBE7DF] rounded-[12px] px-3 py-2 mb-2">
                                <p className="text-[11px] leading-relaxed text-[#3A3A3A]/70 font-serif">
                                    {isNewsLoading ? "" : currentNewsBody}
                                </p>
                                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#FAF7F2] to-transparent" />
                            </div>

                            {/* Nav & Controls */}
                            <div className="relative flex items-center justify-between px-1 text-[#3A3A3A]/40 mt-auto">
                                {/* Left Arrow */}
                                <div className="flex gap-4">
                                    <button
                                        onClick={handlePrevNews}
                                        className="hover:text-[#3A3A3A]/70 transition-colors p-1 -ml-1"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Play Button (Center) */}
                                <button
                                    onClick={() => {
                                        const categoryMap: Record<string, string> = {
                                            World: "world",
                                            Economics: "wirtschaft",
                                            Sport: "sport",
                                        }
                                        const category = categoryMap[activeNewsTab] || "world"
                                        router.push(`/news?auto=1&category=${category}`)
                                    }}
                                    className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#9FB58E] hover:bg-[#8F9F7E] text-white px-3 py-1 rounded-full shadow-sm transition-all group scale-90"
                                >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span className="text-[10px] font-bold tracking-wide uppercase">Play Now</span>
                                </button>

                                {/* Right Arrow & Count */}
                                <div className="flex gap-3 items-center">
                                    <span className="text-[10px] font-medium tracking-widest opacity-80">
                                        {newsItems.length > 0 ? currentNewsIndex + 1 : 0} / {newsItems.length}
                                    </span>
                                    <button
                                        onClick={handleNextNews}
                                        className="hover:text-[#3A3A3A]/70 transition-colors p-1 -mr-1"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>


                {/* --- 3. CONTINUE & REVIEW --- */}
                <section className="space-y-2">
                    <h2 className="font-serif text-[16px] text-[#3A3A3A] pl-1 tracking-tight">Continue Learning</h2>

                    {/* Continue Card */}
                    <div className="bg-[#FAF7F2] rounded-[20px] p-2 flex items-center justify-between border border-[#3A3A3A]/5 shadow-[0_2px_10px_-4px_rgba(58,58,58,0.02)]">
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[14px] font-medium text-[#3A3A3A]">
                                    {lastPlayed?.title ?? "—"}
                                </span>
                            </div>
                            <div className="text-[10px] text-[#3A3A3A]/50">
                                {lastPlayed ? `Level ${Math.max(0, (lastPlayed.levelIndex ?? 0)) + 1}` : "No recent session"}
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                if (!lastPlayed) return
                                router.push(`/play?world=${encodeURIComponent(lastPlayed.id)}&level=${lastPlayed.levelIndex ?? 0}`)
                            }}
                            disabled={!lastPlayed}
                            className="bg-[#9FB58E] text-white/95 px-3 py-1 rounded-[10px] text-[11px] font-semibold tracking-wide shadow-sm hover:bg-[#8F9F7E] transition-colors disabled:opacity-50"
                        >
                            Resume
                        </button>
                    </div>

                    {/* Review Card */}
                    <button
                        onClick={() => router.push("/vocables")}
                        className="w-full bg-[#FAF7F2] rounded-[20px] p-2 flex items-center justify-between border border-[#3A3A3A]/5 shadow-[0_2px_10px_-4px_rgba(58,58,58,0.02)] group hover:bg-[#EAE8E0]/30 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2.5">
                            {/* Icon could be here, but spec says "Sachliche Tabelle" style content inside. Card itself text based */}
                            <div>
                                <div className="text-[14px] font-medium text-[#3A3A3A] mb-0.5">Review</div>
                                <div className="text-[10px] text-[#3A3A3A]/50">14 wörter zum Wiederholen</div>
                            </div>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-[#EAE8E0] flex items-center justify-center text-[#3A3A3A]/40 group-hover:bg-[#EAE8E0]/80">
                            <ChevronRight className="w-3 h-3" />
                        </div>
                    </button>
                </section>

            </main>


            {/* --- BOTTOM NAVIGATION --- */}
            <NavFooter />

            {/* World Review Overlay */}
            <WorldReviewOverlay
                isOpen={isOverlayOpen}
                onClose={handleOverlayClose}
                onSave={handleOverlaySave}
                onPlayNow={handleOverlayPlayNow}
                initialWords={generatedWords}
                initialTitle={generatedTitle}
                existingWorlds={[
                    { id: "1", title: "Spanish Travel" },
                    { id: "2", title: "German Basics" },
                ]}
                onGenerateMore={handleGenerateMoreWords}
            />
        </div>
    )
}

function NavTab({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
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
