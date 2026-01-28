"use client"

import { Leaf, Camera, ChevronLeft, ChevronRight, Check, Briefcase, User, BookOpen, Star, MoreHorizontal, Users, Trophy, Play, Plus, FileText, BookmarkPlus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import WorldReviewOverlay, { type ReviewWord } from "./WorldReviewOverlay"
import NavFooter from "@/components/ui/NavFooter"
import { supabase } from "@/lib/supabase/client"
import type { VocabWorld } from "@/types/worlds"
import { getUiSettings } from "@/lib/ui-settings"
import { formatTemplate } from "@/lib/ui"
import { calculateNextReview, initializeSRS } from "@/lib/srs"
import TutorialOverlay, { type TutorialStep } from "@/components/tutorial/TutorialOverlay"

// --- THEME CONSTANTS ---
const COLORS = {
    bg: "#F6F2EB",       // Main Cream
    bgDark: "#FAF7F2",   // Secondary (slightly lighter/different tone per spec, but spec said 'minimal dunkleres Beige' which usually means slightly more defined. Let's use F2EFE8 for inset areas if needed, or stick to spec hexes)
    // Actually spec says: Main: #F6F2EB / #FAF7F2. Secondary: minimal dark beige.
    // Let's interpret: Screen BG = #F6F2EB. Cards/Input = #FAF7F2 (or slightly distinct).
    accent: "rgb(var(--vocado-accent-rgb))",   // Desaturated Avocado
    text: "#3A3A3A",     // Warm Dark Grey
}

const LAST_PLAYED_STORAGE_KEY = "vocado-last-played"
const FALLBACK_AVATAR = "/profilepictures/happy_vocado.png"
const PENDING_WORLDS_KEY = "vocado-pending-worlds"

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
    avatarUrl?: string
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
    pos?: "verb" | "noun" | "adj" | "other"
    syllables?: string
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

const hashString = (value: string) => {
    let hash = 5381
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 33) ^ value.charCodeAt(i)
    }
    return (hash >>> 0).toString(36)
}

const normalizeNewsUrl = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ""
    try {
        const url = new URL(trimmed)
        const params = url.searchParams
            ;["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) =>
                params.delete(key)
            )
        url.search = params.toString()
        return url.toString()
    } catch {
        return trimmed
    }
}

const buildNewsWorldId = (url: string) => `news-${hashString(normalizeNewsUrl(url))}`

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

const buildReviewWordsFromItems = (items: NewsReviewItem[]) =>
    items
        .filter((item) => item.source && item.target)
        .map((item, index) => ({
            id: `upload-${Date.now()}-${index}`,
            source: item.source,
            target: item.target,
            status: "new" as const,
            emoji: item.emoji,
            explanation: item.explanation,
            example: item.example,
            pos: item.pos,
            syllables: item.syllables,
        }))

const buildWorldFromItems = (
    items: NewsReviewItem[],
    sourceLabel: string,
    targetLabel: string,
    ui: any,
    worldId?: string
): VocabWorld => {
    const id = worldId || `news-${Date.now()}`
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

const buildWorldFromReviewWords = (
    words: ReviewWord[],
    title: string,
    sourceLabel: string,
    targetLabel: string,
    baseWorld?: VocabWorld | null
): VocabWorld => {
    const id = baseWorld?.id ?? `upload-${Date.now()}`
    const cleanTitle = baseWorld?.title ?? (title.trim() || "New world")
    const existingKeys = new Set(
        (baseWorld?.pool ?? []).map((pair) =>
            `${pair.es.toLowerCase()}::${pair.de.toLowerCase()}`
        )
    )
    const newPairs = words
        .map((word, index) => {
            const source = word.source.trim()
            const target = word.target.trim()
            if (!source || !target) return null
            const key = `${source.toLowerCase()}::${target.toLowerCase()}`
            if (existingKeys.has(key)) return null
            const baseSrs = initializeSRS()
            const srs =
                word.status === "known"
                    ? calculateNextReview(baseSrs, "easy")
                    : word.status === "unsure"
                        ? calculateNextReview(baseSrs, "difficult")
                        : baseSrs
            const explanation =
                word.explanation?.trim() || `Meaning of ${source}.`
            const example =
                word.example?.trim() || `Example: ${source}.`
            const syllables = word.syllables?.trim()
            const explanationWithSyllables =
                word.pos === "verb" && syllables && target
                    ? `${explanation}\n${target}\n${syllables}`
                    : explanation
            return {
                id: `${id}-${Date.now()}-${index}`,
                es: source,
                de: target,
                pos: word.pos ?? ("other" as const),
                image: { type: "emoji", value: word.emoji ?? "📝" } as any,
                explanation: explanationWithSyllables,
                example,
                srs,
            }
        })
        .filter(Boolean) as any[]
    const pool = [...(baseWorld?.pool ?? []), ...newPairs]
    return {
        ...(baseWorld ?? {}),
        id,
        title: cleanTitle,
        description: cleanTitle,
        mode: "vocab",
        pool,
        chunking: { itemsPerGame: 8 },
        source_language: sourceLabel,
        target_language: targetLabel,
        ui: {
            ...(baseWorld?.ui ?? {}),
            vocab: {
                ...(baseWorld?.ui?.vocab ?? {}),
                carousel: {
                    primaryLabel: `${sourceLabel}:`,
                    secondaryLabel: `${targetLabel}:`,
                },
            },
        },
    } as VocabWorld
}

const buildConjugationWorld = (
    conjugations: any[],
    title: string,
    sourceLabel: string,
    targetLabel: string,
    uiSettings: any
): VocabWorld => {
    const id = `upload-${Date.now()}-conjugation`
    const conjugationMap: Record<string, any> = {}
    const pool: Array<any> = []

    conjugations.forEach((entry) => {
        const verb = entry?.verb
        if (!verb) return
        const sections = Array.isArray(entry?.sections) ? entry.sections : []
        const translation = typeof entry?.translation === "string" ? entry.translation : ""
        conjugationMap[verb] = {
            infinitive: verb,
            translation,
            sections,
        }
        const firstSection = sections[0]
        const rows = Array.isArray(firstSection?.rows) ? firstSection.rows : []
        rows.forEach((row: any, idx: number) => {
            if (!Array.isArray(row) || row.length < 2) return
            pool.push({
                id: `${verb}_${idx + 1}`,
                es: row[0],
                de: row[1],
                image: { type: "emoji", value: "📝" },
            })
        })
    })

    return {
        id,
        title: `${title.trim() || "Conjugation"} ${uiSettings?.conjugationWorld?.titleSuffix ?? ""}`.trim(),
        description: "Custom conjugation list.",
        mode: "vocab",
        submode: "conjugation",
        pool,
        conjugations: conjugationMap,
        chunking: { itemsPerGame: 6 },
        source_language: sourceLabel,
        target_language: targetLabel,
        ui: {
            header: { levelLabelTemplate: "{verb}", levelItemTemplate: "{verb}" },
            page: { instructions: uiSettings?.conjugationWorld?.instructions },
            vocab: {
                carousel: {
                    primaryLabel: uiSettings?.conjugationWorld?.primaryLabel,
                    secondaryLabel: uiSettings?.conjugationWorld?.secondaryLabel,
                },
                rightPanel: {
                    title: uiSettings?.conjugationWorld?.rightTitle,
                    emptyHint: uiSettings?.conjugationWorld?.emptyHint,
                },
            },
        },
    } as VocabWorld
}

export default function NewHomeClient({ profile }: { profile: ProfileSettings }) {
    const router = useRouter()
    const [activeNewsTab, setActiveNewsTab] = useState<"world" | "wirtschaft" | "sport">("world")
    const [activeTab, setActiveTab] = useState("Home")
    const [seeds, setSeeds] = useState(profile.seeds ?? 0)
    const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "")
    const [leaderboardScope, setLeaderboardScope] = useState<"weekly" | "overall">("weekly")
    const [leaderboardEntries, setLeaderboardEntries] = useState<
        Array<{ username: string; score: number; avatarUrl?: string | null }>
    >([])
    const [failedAvatarEntries, setFailedAvatarEntries] = useState<Set<string>>(new Set())

    // Profile & UserMenu state
    const [profileSettings, setProfileSettings] = useState({
        level: profile.level,
        sourceLanguage: profile.sourceLanguage,
        targetLanguage: profile.targetLanguage,
        newsCategory: profile.newsCategory,
        onboardingDone: profile.onboardingDone,
    })
    const [showTutorial, setShowTutorial] = useState(!profile.onboardingDone)
    const [tutorialStep, setTutorialStep] = useState<TutorialStep>("welcome")
    const [savingProfile, setSavingProfile] = useState(false)
    const [profileError, setProfileError] = useState<string | null>(null)

    // Logic States
    const [newsItems, setNewsItems] = useState<Array<{ title: string, teaser?: string }>>([])
    const [newsWorlds, setNewsWorlds] = useState<VocabWorld[]>([])
    const [currentNewsIndex, setCurrentNewsIndex] = useState(0)
    const [isNewsLoading, setIsNewsLoading] = useState(true)
    const [inputText, setInputText] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [isTranslating, setIsTranslating] = useState(false)
    const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null)
    const [translateError, setTranslateError] = useState<string | null>(null)
    const [translateMode, setTranslateMode] = useState(false)
    const [lastPlayed, setLastPlayed] = useState<LastPlayed | null>(null)
    const [showAttachMenu, setShowAttachMenu] = useState(false)
    const [createWorldError, setCreateWorldError] = useState<string | null>(null)

    const cameraInputRef = useRef<HTMLInputElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const attachMenuRef = useRef<HTMLDivElement | null>(null)

    // Overlay State
    const [isOverlayOpen, setIsOverlayOpen] = useState(false)
    const [generatedWords, setGeneratedWords] = useState<ReviewWord[]>([])
    const [generatedTitle, setGeneratedTitle] = useState("")
    const [lastPromptTheme, setLastPromptTheme] = useState("")
    const [storedWorlds, setStoredWorlds] = useState<VocabWorld[]>([])
    const [storedLists, setStoredLists] = useState<Array<{ id: string; name: string; worldIds?: string[] }>>([])
    const [worldMetaMap, setWorldMetaMap] = useState<Record<string, { listId: string | null }>>({})
    const [savedNewsUrls, setSavedNewsUrls] = useState<Set<string>>(new Set())
    const [selectedOverlayListId, setSelectedOverlayListId] = useState<string | null>(null)
    const [reviewStats, setReviewStats] = useState<{ bucket: "hard" | "new" | null; count: number }>({
        bucket: null,
        count: 0,
    })

    // Derived news values
    const currentNews = newsItems[currentNewsIndex] || null
    const currentNewsTeaser = currentNews?.teaser || ""
    const currentNewsBody = currentNewsTeaser || currentNews?.title || ""
    const currentNewsWorld = newsWorlds[currentNewsIndex]
    const currentNewsSource = currentNewsWorld?.news?.sourceUrl
    const normalizedNewsSource = currentNewsSource ? normalizeNewsUrl(currentNewsSource) : ""
    const isCurrentNewsSaved = Boolean(
        currentNewsWorld &&
        (savedNewsUrls.has(normalizedNewsSource) ||
            storedWorlds.some(
                (world) =>
                    world.news?.sourceUrl &&
                    normalizeNewsUrl(world.news.sourceUrl) === normalizedNewsSource
            ))
    )

    const uiSettings = useMemo(
        () => getUiSettings(profileSettings.sourceLanguage),
        [profileSettings.sourceLanguage]
    )
    const ui = useMemo(
        () => ({
            translateTitle: uiSettings?.home?.translateTitle ?? "Translate",
            translatePlaceholder: uiSettings?.home?.translatePlaceholder ?? "Type a word...",
            translateAction: uiSettings?.home?.translateAction ?? "Translate",
            playNow: uiSettings?.news?.playNow ?? "Play now",
            profileSave: uiSettings?.profile?.save ?? "Save",
            sourceLabel: uiSettings?.onboarding?.sourceLabel ?? "Source",
            targetLabel: uiSettings?.onboarding?.targetLabel ?? "Target",
            levelLabel: uiSettings?.onboarding?.levelLabel ?? "Level",
            noWordsError: uiSettings?.errors?.newsNoWords ?? "No words found.",
            createWorldTitle: uiSettings?.home?.createWorldTitle ?? "What would you like to learn today?",
            createWorldPlaceholder: uiSettings?.home?.createWorldPlaceholder ?? "Create your world...",
            createWorldLoading: uiSettings?.home?.createWorldLoading ?? "Creating world...",
            promptHelp: uiSettings?.home?.promptHelp ?? "Paste text, write what you want to learn or drop a link, photo, or file",
            todaysNewsTitle: uiSettings?.home?.todaysNewsTitle ?? "Today's News",
            newsLoading: uiSettings?.home?.newsLoading ?? "Loading...",
            noNewsAvailable: uiSettings?.home?.noNewsAvailable ?? "No News Available",
            continueLearningTitle: uiSettings?.home?.continueLearningTitle ?? "Continue Learning",
            resumeLabel: uiSettings?.home?.resumeLabel ?? "Resume",
            noRecentSession: uiSettings?.home?.noRecentSession ?? "No recent session",
            reviewTitle: uiSettings?.home?.reviewTitle ?? "Review",
            reviewSubtitle: uiSettings?.home?.reviewSubtitle ?? "{count} words to review",
            logout: uiSettings?.home?.logout ?? "Log out",
            leaderboardTitle: uiSettings?.home?.leaderboardTitle ?? "Leaderboard",
            leaderboardWeekly: uiSettings?.home?.leaderboardWeekly ?? "Weekly",
            leaderboardOverall: uiSettings?.home?.leaderboardOverall ?? "Overall",
            readNow: uiSettings?.news?.readNow ?? "Leer periódico",
            nav: uiSettings?.nav ?? {},
            newsTabs: uiSettings?.news?.categoryOptions ?? {},
            overlay: uiSettings?.overlay ?? {},
            tutorial: uiSettings?.tutorial ?? {},
            news: uiSettings?.news ?? {},
            allDone: uiSettings?.home?.allDone ?? "All Done! 🎉",
        }),
        [uiSettings]
    )
    const translationWorldName = useMemo(() => {
        const value = (profileSettings.sourceLanguage || "").toLowerCase()
        if (value.includes("deutsch") || value.includes("german")) return "Übersetzung"
        if (value.includes("english")) return "Translation"
        if (value.includes("français") || value.includes("french")) return "Traduction"
        return "Traducción"
    }, [profileSettings.sourceLanguage])

    const overlayLabels = useMemo(
        () => ({
            titlePlaceholder:
                uiSettings?.overlay?.titlePlaceholder ?? "Untitled world",
            belongsLabel:
                uiSettings?.overlay?.worldLabel ?? "These words belong to:",
            newWorldLabel:
                uiSettings?.overlay?.newWorld ?? "Create new world",
            listLabel:
                uiSettings?.overlay?.listLabel ??
                uiSettings?.home?.listSelectLabel ??
                "List",
            listUnlisted:
                uiSettings?.overlay?.listUnlisted ??
                uiSettings?.worldsOverlay?.unlisted ??
                "Unlisted",
            wordLabel:
                uiSettings?.overlay?.wordColumn ?? "Word",
            translationLabel:
                uiSettings?.overlay?.translationColumn ?? "Translation",
            statusLabel:
                uiSettings?.overlay?.statusColumn ?? "Status",
            statusNew:
                uiSettings?.overlay?.statusNew ?? "new",
            statusKnown:
                uiSettings?.overlay?.statusKnown ?? "known",
            statusUnsure:
                uiSettings?.overlay?.statusUnsure ?? "unsure",
            posVerb:
                uiSettings?.upload?.posVerb ?? "verb",
            posNoun:
                uiSettings?.upload?.posNoun ?? "noun",
            posAdj:
                uiSettings?.upload?.posAdj ?? "adj",
            posOther:
                uiSettings?.upload?.posOther ?? "other",
            emojiLabel:
                uiSettings?.upload?.reviewEmoji ?? "Emoji",
            posLabel:
                uiSettings?.upload?.reviewPos ?? "Type",
            explanationLabel:
                uiSettings?.upload?.reviewExplanation ?? "Explanation",
            exampleLabel:
                uiSettings?.upload?.reviewExample ?? "Example",
            syllablesLabel:
                uiSettings?.upload?.reviewSyllables ?? "Syllables",
            emptyLabel:
                uiSettings?.overlay?.emptyLabel ??
                uiSettings?.errors?.newsNoWords ??
                "No words yet",
            generateMoreLabel:
                uiSettings?.overlay?.generateMore ?? "Generate more",
            generateMorePlaceholder:
                uiSettings?.overlay?.generateMorePlaceholder ??
                uiSettings?.upload?.reviewMorePlaceholder ??
                "Count",
            generateMoreButton:
                uiSettings?.overlay?.generateMoreButton ??
                uiSettings?.upload?.reviewMoreButton ??
                "Generate",
            generateMoreLoading:
                uiSettings?.overlay?.generateMoreLoading ??
                uiSettings?.upload?.processing ??
                "Generating...",
            saveLabel:
                uiSettings?.overlay?.save ?? "Save",
            playNowLabel:
                uiSettings?.overlay?.playNow ?? "Play now",
        }),
        [uiSettings]
    )
    const unlistedListName = overlayLabels.listUnlisted?.trim() || "Without List"



    useEffect(() => {
        const initProfile = async () => {
            // Check tutorial persistence immediately
            if (typeof window !== "undefined" && window.localStorage.getItem("vocado-onboarding-done")) {
                setShowTutorial(false)
            }

            // 1. Get User Metadata
            const userRes = await supabase.auth.getUser()
            const userId = userRes.data.user?.id
            const metadata = userRes.data.user?.user_metadata as Record<string, unknown> | undefined

            // 2. Fetch DB Profile
            let dbRow: any = null
            if (userId) {
                const baseSelect = "level,source_language,target_language,news_category,seeds,username"
                const withAvatar = await supabase
                    .from("profiles")
                    .select(`${baseSelect},avatar_url`)
                    .eq("id", userId)
                    .maybeSingle()

                dbRow = withAvatar.data
                if (withAvatar.error?.message?.includes("avatar_url")) {
                    const fallback = await supabase.from("profiles").select(baseSelect).eq("id", userId).maybeSingle()
                    dbRow = fallback.data
                }
            }

            // 3. Read LocalStorage (prioritized settings)
            let localSettings: any = null
            if (typeof window !== "undefined") {
                try {
                    const raw = window.localStorage.getItem("vocado-profile-settings")
                    if (raw) localSettings = JSON.parse(raw)
                } catch { }
            }

            // 4. Update Seeds (Server wins for seeds typically, but we sync)
            if (dbRow?.seeds && typeof dbRow.seeds === "number") {
                setSeeds(dbRow.seeds)
            }

            // 5. Merge Settings (Local > DB > Prev)
            setProfileSettings((prev) => ({
                ...prev,
                level: localSettings?.level || dbRow?.level || prev.level,
                sourceLanguage: localSettings?.sourceLanguage || dbRow?.source_language || prev.sourceLanguage,
                targetLanguage: localSettings?.targetLanguage || dbRow?.target_language || prev.targetLanguage,
                newsCategory: localSettings?.newsCategory || dbRow?.news_category || prev.newsCategory,
            }))

            // 6. Handle Avatar (Local > DB > Google > Fallback)
            const googleAvatar =
                (typeof metadata?.avatar_url === "string" && metadata.avatar_url) ||
                (typeof metadata?.picture === "string" && metadata.picture) ||
                ""

            const finalAvatar = localSettings?.avatarUrl || dbRow?.avatar_url || googleAvatar || FALLBACK_AVATAR
            setAvatarUrl(finalAvatar)
        }

        initProfile()
    }, [])

    useEffect(() => {
        const loadWorlds = async () => {
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
                const entries = Array.isArray(data?.worlds) ? data.worlds : []
                const list: VocabWorld[] = []
                const meta: Record<string, { listId: string | null }> = {}
                const lists = Array.isArray(data?.lists)
                    ? data.lists.map((entry: any) => ({
                        id: entry.id,
                        name: entry.name,
                    }))
                    : []
                entries.forEach((entry: any) => {
                    const json = entry?.json
                    if (!json) return
                    const id = entry?.worldId || json.id
                    if (!id) return
                    json.id = id
                    if (entry?.title) json.title = entry.title
                    list.push(json as VocabWorld)
                    meta[id] = { listId: entry?.listId ?? null }
                })
                setStoredWorlds(list)
                setWorldMetaMap(meta)
                setStoredLists(lists)
                const reviewEntries = list.flatMap((world) =>
                    (world.pool ?? []).map((pair) => ({ world, pair }))
                )
                const hardCount = reviewEntries.filter(
                    (entry) => (entry.pair.srs?.bucket ?? "new") === "hard"
                ).length
                const newCount = reviewEntries.filter(
                    (entry) => (entry.pair.srs?.bucket ?? "new") === "new"
                ).length
                if (hardCount > 0) {
                    setReviewStats({ bucket: "hard", count: hardCount })
                } else if (newCount > 0) {
                    setReviewStats({ bucket: "new", count: newCount })
                } else {
                    setReviewStats({ bucket: null, count: 0 })
                }
            } catch {
                // ignore
            }
        }
        loadWorlds()
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem("vocado-seeds")
            if (!raw) return
            const localSeeds = Number(raw)
            if (Number.isFinite(localSeeds)) {
                setSeeds((prev) => Math.max(prev, localSeeds))
            }
        } catch {
            // ignore
        }
    }, [])

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
        if (!response.ok) {
            const fallbackId = generateUuid()
            const created = await fetch("/api/storage/state", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    lists: [{ id: fallbackId, name: "Vocado Diario", position: 0 }],
                }),
            })
            return created.ok ? fallbackId : ""
        }
        const data = await response.json()
        const lists = Array.isArray(data?.lists) ? data.lists : []
        const existing = lists.find((list: any) => list?.name === "Vocado Diario")
        if (existing?.id) return existing.id
        const listId = generateUuid()
        const created = await fetch("/api/storage/state", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                lists: [{ id: listId, name: "Vocado Diario", position: 0 }],
            }),
        })
        return created.ok ? listId : ""
    }

    const ensureUnlistedListId = async (token: string) => {
        const existingLocal = storedLists.find((list) => list.name === unlistedListName)
        if (existingLocal?.id) return existingLocal.id
        const response = await fetch("/api/storage/worlds/list", {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
            const data = await response.json().catch(() => ({}))
            const lists = Array.isArray(data?.lists) ? data.lists : []
            const existingRemote = lists.find((list: any) => list?.name === unlistedListName)
            if (existingRemote?.id) {
                setStoredLists((prev) => {
                    if (prev.some((item) => item.id === existingRemote.id)) return prev
                    return [...prev, { id: existingRemote.id, name: existingRemote.name || unlistedListName }]
                })
                return existingRemote.id
            }
        }
        const listId = generateUuid()
        await fetch("/api/storage/state", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                lists: [{ id: listId, name: unlistedListName, position: 0 }],
            }),
        })
        setStoredLists((prev) => [...prev, { id: listId, name: unlistedListName }])
        return listId
    }

    const loadCachedDailyNewsList = async (categoryValue: string) => {
        try {
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
            const matched: VocabWorld[] = []
            for (const entry of worlds) {
                const json = entry?.json
                if (!json || json.mode !== "vocab") continue
                const news = json.news
                if (!news?.summary?.length) continue
                if (news?.category !== categoryValue) continue
                if (!isSameDay(news?.date)) continue
                matched.push(json as VocabWorld)
            }
            if (!matched.length) return null
            matched.sort((a, b) => (a.news?.index ?? 0) - (b.news?.index ?? 0))
            const seen = new Set<string>()
            const unique = matched.filter((world) => {
                const url = world.news?.sourceUrl ? normalizeNewsUrl(world.news.sourceUrl) : ""
                if (!url) return true
                if (seen.has(url)) return false
                seen.add(url)
                return true
            })
            return unique
        } catch {
            return null
        }
    }

    const loadLocalCachedNewsList = (categoryValue: string) => {
        if (typeof window === "undefined") return null
        try {
            const sessionKey = `${categoryValue}|${profileSettings.level}|${profileSettings.sourceLanguage}|${profileSettings.targetLanguage}`
            const cacheKey = `vocado-news-cache:${sessionKey}`
            const raw = window.localStorage.getItem(cacheKey)
            if (!raw) return null
            const parsed = JSON.parse(raw)
            const cachedWorlds = Array.isArray(parsed?.worlds) ? parsed.worlds : []
            if (!cachedWorlds.length) return null
            const matched = cachedWorlds
                .filter((world: VocabWorld) => {
                    const news = world?.news
                    if (!news?.summary?.length) return false
                    if (news?.category !== categoryValue) return false
                    if (!isSameDay(news?.date)) return false
                    return true
                })
                .sort((a: VocabWorld, b: VocabWorld) => (a.news?.index ?? 0) - (b.news?.index ?? 0))
            const seen = new Set<string>()
            const unique = matched.filter((world: VocabWorld) => {
                const url = world?.news?.sourceUrl ? normalizeNewsUrl(world.news.sourceUrl) : ""
                if (!url) return true
                if (seen.has(url)) return false
                seen.add(url)
                return true
            })
                .slice(0, 5)
            return unique.length ? unique : null
        } catch {
            return null
        }
    }

    const saveLocalNewsCache = (categoryValue: string, worlds: VocabWorld[]) => {
        if (typeof window === "undefined") return
        try {
            const sessionKey = `${categoryValue}|${profileSettings.level}|${profileSettings.sourceLanguage}|${profileSettings.targetLanguage}`
            const cacheKey = `vocado-news-cache:${sessionKey}`
            window.localStorage.setItem(cacheKey, JSON.stringify({ worlds, updatedAt: Date.now() }))
        } catch {
            // ignore
        }
    }

    const hasNewsWorldInStorage = async (url: string) => {
        if (!url) return false
        if (savedNewsUrls.has(url)) return true
        if (storedWorlds.some((world) => world.news?.sourceUrl === url)) return true
        if (typeof window !== "undefined") {
            const sessionKey = `${activeNewsTab}|${profileSettings.level}|${profileSettings.sourceLanguage}|${profileSettings.targetLanguage}`
            const cacheKey = `vocado-news-cache:${sessionKey}`
            const raw = window.localStorage.getItem(cacheKey)
            if (raw) {
                try {
                    const parsed = JSON.parse(raw)
                    const cachedWorlds = Array.isArray(parsed?.worlds) ? parsed.worlds : []
                    if (
                        cachedWorlds.some(
                            (world: VocabWorld) =>
                                world?.news?.sourceUrl &&
                                normalizeNewsUrl(world.news.sourceUrl) === normalizeNewsUrl(url)
                        )
                    ) {
                        return true
                    }
                } catch {
                    // ignore
                }
            }
        }
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) return false
            const response = await fetch("/api/storage/worlds/list", {
                method: "GET",
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok) return false
            const data = await response.json()
            const worldRows = Array.isArray(data?.worlds) ? data.worlds : []
            return worldRows.some(
                (row: any) =>
                    row?.json?.news?.sourceUrl &&
                    normalizeNewsUrl(row.json.news.sourceUrl) === normalizeNewsUrl(url)
            )
        } catch {
            return false
        }
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
                const category = activeNewsTab
                const localList = loadLocalCachedNewsList(category)
                if (localList?.length) {
                    const baseItems = localList.map((item) => ({
                        title: item.news?.title || item.title,
                        teaser: item.news?.summary?.[0] || "",
                    }))
                    setNewsWorlds(localList)
                    setNewsItems(baseItems)
                    setCurrentNewsIndex(0)
                    setIsNewsLoading(false)
                    return
                }
                const cachedList = (await loadCachedDailyNewsList(category)) ?? []
                if (cachedList.length >= 5) {
                    const baseItems = cachedList.slice(0, 5).map((item) => ({
                        title: item.news?.title || item.title,
                        teaser: item.news?.summary?.[0] || "",
                    }))
                    setNewsWorlds(cachedList.slice(0, 5))
                    setNewsItems(baseItems)
                    setCurrentNewsIndex(0)
                    saveLocalNewsCache(category, cachedList.slice(0, 5))
                    setIsNewsLoading(false)
                    return
                }

                const res = await fetch(`/api/news/tagesschau?ressort=${category}`)
                const data = await res.json()
                const list = Array.isArray(data?.items) ? data.items : []
                if (!list.length) {
                    setNewsItems([])
                    setIsNewsLoading(false)
                    return
                }

                const worldsToSave: VocabWorld[] = []
                const usedUrls = new Set(
                    cachedList
                        .map((item) => item.news?.sourceUrl)
                        .filter((value): value is string => Boolean(value))
                        .map(normalizeNewsUrl)
                )
                for (let i = 0; i < list.length; i += 1) {
                    if (cachedList.length + worldsToSave.length >= 5) break
                    const headline = list[i]
                    if (!headline?.url) continue
                    const normalizedUrl = normalizeNewsUrl(headline.url)
                    if (!normalizedUrl || usedUrls.has(normalizedUrl)) continue
                    let nextSummary: string[] = []
                    let nextItems = [] as NewsReviewItem[]
                    try {
                        const result = await callAi({
                            task: "news",
                            url: headline.url,
                            level: profileSettings.level || undefined,
                            sourceLabel: profileSettings.sourceLanguage || "Español",
                            targetLabel: profileSettings.targetLanguage || "Alemán",
                        })
                        nextSummary = Array.isArray(result?.summary) ? result.summary : []
                        nextItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])
                    } catch {
                        const fallbackText = [headline.title, headline.teaser].filter(Boolean).join(". ")
                        if (fallbackText) {
                            try {
                                const result = await callAi({
                                    task: "news",
                                    text: fallbackText,
                                    level: profileSettings.level || undefined,
                                    sourceLabel: profileSettings.sourceLanguage || "Español",
                                    targetLabel: profileSettings.targetLanguage || "Alemán",
                                })
                                nextSummary = Array.isArray(result?.summary) ? result.summary : [fallbackText]
                                nextItems = buildReviewItemsFromAi(Array.isArray(result?.items) ? result.items : [])
                            } catch {
                                nextSummary = [fallbackText]
                                nextItems = []
                            }
                        }
                    }
                    if (!nextItems.length) continue
                    const newsWorld = {
                        ...buildWorldFromItems(
                            nextItems,
                            profileSettings.sourceLanguage || "Español",
                            profileSettings.targetLanguage || "Alemán",
                            ui,
                            normalizedUrl ? buildNewsWorldId(normalizedUrl) : undefined
                        ),
                        title: `Vocado Diario - ${headline.title || "Noticia"}`,
                        description: "Noticias del día.",
                        news: {
                            summary: nextSummary,
                            sourceUrl: normalizedUrl,
                            title: headline.title || "Noticia",
                            category,
                            date: headline.date || new Date().toISOString(),
                            index: cachedList.length + worldsToSave.length,
                        },
                    }
                    if (!usedUrls.has(normalizedUrl)) {
                        worldsToSave.push(newsWorld)
                        usedUrls.add(normalizedUrl)
                    }
                }

                const merged = [...cachedList, ...worldsToSave]
                const seenKeys = new Set<string>()
                const finalList = merged.filter((world) => {
                    const url = world.news?.sourceUrl ? normalizeNewsUrl(world.news.sourceUrl) : ""
                    const title = (world.news?.title || world.title || "").trim().toLowerCase()
                    const key = url || title
                    if (!key) return false
                    if (seenKeys.has(key)) return false
                    seenKeys.add(key)
                    return true
                }).slice(0, 5)

                const baseItems = finalList.map((item) => ({
                    title: item.news?.title || item.title,
                    teaser: item.news?.summary?.[0] || "",
                }))
                const padded = [
                    ...baseItems,
                    ...Array.from({ length: Math.max(0, 5 - baseItems.length) }, () => ({
                        title: "",
                        teaser: "",
                    })),
                ]
                setNewsWorlds(finalList)
                setNewsItems(padded)
                setCurrentNewsIndex(0)
                saveLocalNewsCache(category, finalList)
            } catch {
                // ignore network errors for cached news
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

    useEffect(() => {
        if (typeof window === "undefined") return
        const raw = window.localStorage.getItem("vocado-saved-news")
        if (!raw) return
        try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) {
                setSavedNewsUrls(
                    new Set(
                        parsed
                            .filter((item) => typeof item === "string")
                            .map((item) => normalizeNewsUrl(item))
                    )
                )
            }
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        if (!showAttachMenu) return
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (!attachMenuRef.current || !target) return
            if (attachMenuRef.current.contains(target)) return
            setShowAttachMenu(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [showAttachMenu])

    // Handle Create World
    const handleSaveOnboardingProfile = async (data: { source: string; target: string; level: string; news: string; name: string; avatarUrl: string }) => {
        setSavingProfile(true)
        setProfileError(null)
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) throw new Error("No session")

            const nextProfile = {
                level: data.level || "A2",
                sourceLanguage: data.source,
                targetLanguage: data.target,
                newsCategory: data.news,
                onboardingDone: true,
                avatarUrl: data.avatarUrl,
                name: data.name,
            }

            const res = await fetch("/api/auth/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(nextProfile),
            })

            if (!res.ok) {
                const resData = await res.json().catch(() => null)
                throw new Error(resData?.error ?? "Save failed")
            }

            // Update local state
            setProfileSettings(prev => ({ ...prev, ...nextProfile }))
            setAvatarUrl(data.avatarUrl)

            // Persist locally
            if (typeof window !== "undefined") {
                window.localStorage.setItem("vocado-onboarding-done", "true")
            }

            // Advance tutorial
            setTutorialStep("tour_intro")
        } catch (err) {
            console.error(err)
            setProfileError((err as Error).message)
        } finally {
            setSavingProfile(false)
        }
    }

    const handleCreateWorld = async () => {
        const theme = inputText.trim()
        if (!theme) return
        setIsGenerating(true)
        setCreateWorldError(null)
        try {
            const lowerTheme = theme.toLowerCase()
            const isConjugationRequest = /conjug|konjug/.test(lowerTheme)
            if (isConjugationRequest) {
                const parseResult = await callAi({
                    task: "parse_text",
                    text: theme,
                    mode: "conjugation",
                    level: profileSettings.level || "A2",
                    sourceLabel: profileSettings.sourceLanguage || "Español",
                    targetLabel: profileSettings.targetLanguage || "Alemán",
                })
                const items = Array.isArray(parseResult?.items) ? parseResult.items : []
                const verbs = items
                    .filter((item: any) => (item?.pos === "verb") || item?.lemma)
                    .map((item: any) => ({
                        lemma: (item?.lemma || item?.target || "").trim(),
                        translation: (item?.source || "").trim(),
                    }))
                    .filter((item: any) => item.lemma)
                if (!verbs.length) {
                    setCreateWorldError(ui.noWordsError)
                    return
                }
                const conjugationResult = await callAi({
                    task: "conjugate",
                    verbs,
                    sourceLabel: profileSettings.sourceLanguage || "Español",
                    targetLabel: profileSettings.targetLanguage || "Alemán",
                })
                const conjugations = Array.isArray(conjugationResult?.conjugations)
                    ? conjugationResult.conjugations
                    : []
                if (!conjugations.length) {
                    setCreateWorldError(ui.noWordsError)
                    return
                }
                const title =
                    typeof parseResult?.title === "string" && parseResult.title.trim()
                        ? parseResult.title.trim()
                        : theme
                const sourceLabel = profileSettings.sourceLanguage || "Español"
                const targetLabel = profileSettings.targetLanguage || "Alemán"
                const conjugationWorld = buildConjugationWorld(
                    conjugations,
                    title,
                    sourceLabel,
                    targetLabel,
                    uiSettings
                )
                let listId = selectedOverlayListId ?? null
                const session = await supabase.auth.getSession()
                const token = session.data.session?.access_token
                if (!token) throw new Error("Missing auth token")
                if (!listId) {
                    listId = await ensureUnlistedListId(token)
                }
                const response = await fetch("/api/storage/worlds/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        worlds: [conjugationWorld],
                        listId,
                        positions: { [conjugationWorld.id]: 0 },
                    }),
                })
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}))
                    throw new Error(data?.error || "Save failed")
                }
                setStoredWorlds((prev) => [...prev, conjugationWorld])
                setWorldMetaMap((prev) => ({ ...prev, [conjugationWorld.id]: { listId } }))
                setInputText("")
                router.push(`/play?world=${encodeURIComponent(conjugationWorld.id)}&level=0`)
                return
            }

            const result = await callAi({
                task: "theme_list",
                theme,
                count: 20,
                level: profileSettings.level || "A2",
                sourceLabel: profileSettings.sourceLanguage || "Español",
                targetLabel: profileSettings.targetLanguage || "Alemán",
            })
            const items = Array.isArray(result?.items) ? result.items : []
            const reviewItems = buildReviewItemsFromAi(items)
            const words = buildReviewWordsFromItems(reviewItems)
            if (!words.length) {
                setCreateWorldError(ui.noWordsError)
                return
            }
            const title =
                typeof result?.title === "string" && result.title.trim()
                    ? result.title.trim()
                    : theme
            setGeneratedTitle(title)
            setLastPromptTheme(theme)
            setGeneratedWords(words)
            setIsOverlayOpen(true)
            setInputText("")
        } catch (e) {
            setCreateWorldError((e as Error).message)
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

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        const bytes = new Uint8Array(buffer)
        let binary = ""
        bytes.forEach((b) => {
            binary += String.fromCharCode(b)
        })
        return btoa(binary)
    }

    const handleUploadFile = async (file: File | null) => {
        if (!file) return
        setTranslateError(null)
        setTranslateResult(null)
        setShowAttachMenu(false)
        setIsGenerating(true)
        try {
            let result: any = null
            if (file.type.startsWith("image/")) {
                const buffer = await file.arrayBuffer()
                const base64 = arrayBufferToBase64(buffer)
                result = await callAi({
                    task: "parse_image",
                    image: { data: base64, mimeType: file.type },
                    sourceLabel: profileSettings.sourceLanguage || "Español",
                    targetLabel: profileSettings.targetLanguage || "Alemán",
                    level: profileSettings.level || undefined,
                })
            } else {
                const text = await file.text()
                if (!text.trim()) {
                    throw new Error(ui.noWordsError)
                }
                result = await callAi({
                    task: "parse_text",
                    text,
                    sourceLabel: profileSettings.sourceLanguage || "Español",
                    targetLabel: profileSettings.targetLanguage || "Alemán",
                    level: profileSettings.level || undefined,
                })
            }

            const items = Array.isArray(result?.items) ? result.items : []
            const reviewItems = buildReviewItemsFromAi(items)
            const words = buildReviewWordsFromItems(reviewItems)
            if (!words.length) {
                setTranslateError(ui.noWordsError)
                return
            }
            const aiTitle =
                typeof result?.title === "string" ? result.title.trim() : ""
            const fallbackTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim()
            setGeneratedTitle(aiTitle || fallbackTitle || file.name)
            setGeneratedWords(words)
            setIsOverlayOpen(true)
        } catch (err) {
            setTranslateError((err as Error).message)
        } finally {
            setIsGenerating(false)
        }
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
                pos: normalizePos(item?.pos),
                syllables: normalizeText(item?.syllables) || undefined,
            })
        } catch (err) {
            setTranslateError((err as Error).message)
        } finally {
            setIsTranslating(false)
        }
    }

    const handleAddTranslation = async () => {
        if (!translateResult) return
        const word: ReviewWord = {
            id: `translate-${Date.now()}`,
            source: translateResult.source,
            target: translateResult.target,
            status: "new",
            emoji: translateResult.emoji,
            explanation: translateResult.explanation,
            example: translateResult.example,
            pos: translateResult.pos,
            syllables: translateResult.syllables,
        }
        const existing = storedWorlds.find(
            (world) =>
                world.title?.trim().toLowerCase() ===
                translationWorldName.trim().toLowerCase()
        )
        await saveOverlayWorld([word], existing?.id ?? null, translationWorldName, false)
        setTranslateResult(null)
        setInputText("")
    }

    const toggleTranslateMode = () => {
        if (translateMode) {
            setTranslateMode(false)
            setTranslateResult(null)
            setTranslateError(null)
            return
        }
        setTranslateMode(true)
        if (inputText.trim()) {
            handleTranslate()
        }
    }

    // Overlay handlers
    const handleOverlayClose = () => {
        setIsOverlayOpen(false)
        setSelectedOverlayListId(null)
    }

    const handleOverlaySave = (words: ReviewWord[], worldId: string | null, title: string) => {
        saveOverlayWorld(words, worldId, title, false)
    }

    const handleOverlayPlayNow = (words: ReviewWord[], worldId: string | null, title: string) => {
        saveOverlayWorld(words, worldId, title, true)
    }

    const handleGenerateMoreWords = async (count: number, existingWords: ReviewWord[]): Promise<ReviewWord[]> => {
        const theme = lastPromptTheme || generatedTitle || "Vocabulary"
        const exclude = existingWords
            .map((word) => word.source?.trim())
            .filter((word): word is string => Boolean(word))
        const result = await callAi({
            task: "theme_list",
            theme,
            count,
            level: profileSettings.level || "A2",
            sourceLabel: profileSettings.sourceLanguage || "Español",
            targetLabel: profileSettings.targetLanguage || "Alemán",
            exclude,
        })
        const items = Array.isArray(result?.items) ? result.items : []
        const reviewItems = buildReviewItemsFromAi(items)
        const words = buildReviewWordsFromItems(reviewItems)
        return words
    }

    const updateLocalWorldsCache = (
        userId: string,
        nextWorlds: VocabWorld[],
        nextLists: Array<{ id: string; name: string; worldIds?: string[] }>
    ) => {
        if (typeof window === "undefined") return
        const storedUserId = window.localStorage.getItem("vocado-user-id")
        const resolvedUserId = userId || storedUserId || "anon"
        const key = `vocado-worlds-cache:${resolvedUserId}`
        const fallbackKey = "vocado-worlds-cache"
        try {
            const payload = JSON.stringify({
                lists: nextLists,
                worlds: nextWorlds,
                updatedAt: Date.now(),
            })
            window.localStorage.setItem(key, payload)
            window.localStorage.setItem(fallbackKey, payload)
        } catch {
            // ignore cache write errors
        }
    }

    const queuePendingWorld = (world: VocabWorld, listId: string, remove = false) => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(PENDING_WORLDS_KEY)
            const parsed = raw ? JSON.parse(raw) : []
            const next = Array.isArray(parsed) ? parsed : []
            next.push({ world, listId, remove })
            window.localStorage.setItem(PENDING_WORLDS_KEY, JSON.stringify(next))
        } catch {
            // ignore
        }
    }

    const handleAddNewsToList = async () => {
        if (!currentNewsWorld || !currentNewsSource) return
        const normalizedSource = normalizeNewsUrl(currentNewsSource)
        const worldToSave = { ...currentNewsWorld, id: buildNewsWorldId(currentNewsSource) }

        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            const userId = session.data.session?.user?.id ?? ""
            if (!token) return

            if (typeof window !== "undefined" && userId) {
                window.localStorage.setItem("vocado-user-id", userId)
            }

            if (isCurrentNewsSaved) {
                // UNSAVE
                setSavedNewsUrls((prev) => {
                    const next = new Set(prev)
                    next.delete(normalizedSource)
                    if (typeof window !== "undefined") {
                        window.localStorage.setItem("vocado-saved-news", JSON.stringify(Array.from(next)))
                        window.localStorage.setItem("vocado-refresh-worlds", "1")
                    }
                    return next
                })

                // Remove from storedWorlds and storedLists locally
                setStoredWorlds((prev) => prev.filter((world) => world.id !== worldToSave.id))
                setStoredLists((prev) =>
                    prev.map((list) =>
                        list.worldIds?.includes(worldToSave.id)
                            ? { ...list, worldIds: list.worldIds.filter((id) => id !== worldToSave.id) }
                            : list
                    )
                )

                queuePendingWorld(worldToSave, "", true)
                updateLocalWorldsCache(
                    userId,
                    storedWorlds.filter((world) => world.id !== worldToSave.id),
                    storedLists.map((list) =>
                        list.worldIds?.includes(worldToSave.id)
                            ? { ...list, worldIds: list.worldIds.filter((id) => id !== worldToSave.id) }
                            : list
                    )
                )

                await fetch("/api/storage/worlds/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ worldIds: [worldToSave.id] }),
                }).catch(() => { })

            } else {
                // SAVE
                setSavedNewsUrls((prev) => {
                    const next = new Set(prev)
                    next.add(normalizedSource)
                    if (typeof window !== "undefined") {
                        window.localStorage.setItem("vocado-saved-news", JSON.stringify(Array.from(next)))
                        window.localStorage.setItem("vocado-refresh-worlds", "1")
                    }
                    return next
                })

                const listId = await ensureNewsListId(token)
                queuePendingWorld(worldToSave, listId, false)

                // Optimistic local insert
                setStoredWorlds((prev) => {
                    if (prev.some((item) => item.id === worldToSave.id)) return prev
                    return [...prev, worldToSave]
                })
                setStoredLists((prev) => {
                    if (!listId) return prev
                    if (prev.some((list) => list.id === listId)) {
                        return prev.map((list) =>
                            list.id === listId
                                ? {
                                    ...list,
                                    worldIds: list.worldIds
                                        ? list.worldIds.includes(worldToSave.id)
                                            ? list.worldIds
                                            : [...list.worldIds, worldToSave.id]
                                        : [worldToSave.id],
                                }
                                : list
                        )
                    }
                    return [...prev, { id: listId, name: "Vocado Diario", worldIds: [worldToSave.id] }]
                })

                if (listId) {
                    setWorldMetaMap((prev) => ({ ...prev, [worldToSave.id]: { listId } }))
                }

                await fetch("/api/storage/worlds/save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        worlds: [worldToSave],
                        listId: listId || null,
                        positions: { [worldToSave.id]: 0 },
                    }),
                })
            }
        } catch {
            // ignore
        }
    }

    const saveOverlayWorld = async (
        words: ReviewWord[],
        worldId: string | null,
        title: string,
        playNow: boolean
    ) => {
        setIsGenerating(true)
        try {
            const session = await supabase.auth.getSession()
            const token = session.data.session?.access_token
            if (!token) throw new Error("Missing auth token")
            const sourceLabel = profileSettings.sourceLanguage || "Español"
            const targetLabel = profileSettings.targetLanguage || "Alemán"
            const baseWorld = worldId ? storedWorlds.find((w) => w.id === worldId) ?? null : null
            const world = buildWorldFromReviewWords(words, title, sourceLabel, targetLabel, baseWorld)
            let listId = worldId
                ? worldMetaMap[worldId]?.listId ?? null
                : selectedOverlayListId ?? null
            if (!listId) {
                listId = await ensureUnlistedListId(token)
            }

            const response = await fetch("/api/storage/worlds/save", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    worlds: [world],
                    listId,
                    positions: { [world.id]: 0 },
                }),
            })
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data?.error || "Save failed")
            }

            setStoredWorlds((prev) => {
                const existing = prev.find((item) => item.id === world.id)
                if (existing) {
                    return prev.map((item) => (item.id === world.id ? world : item))
                }
                return [...prev, world]
            })
            setWorldMetaMap((prev) => ({ ...prev, [world.id]: { listId } }))
            setIsOverlayOpen(false)
            if (playNow) {
                router.push(`/play?world=${encodeURIComponent(world.id)}&level=0`)
            }
        } catch (err) {
            setCreateWorldError((err as Error).message)
        } finally {
            setIsGenerating(false)
        }
    }

    // Render Friends Page if active
    if (activeTab === "Friends") {
        return (
            <div className={`min-h-screen bg-[${COLORS.bg}] font-sans text-[${COLORS.text}] pb-16 relative overflow-hidden`}>
                <header className="px-5 h-[56px] flex items-center justify-between sticky top-0 bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-sm z-40 border-b border-[rgb(var(--vocado-divider-rgb)/0.2)]">
                    <h1 className="text-[18px] font-semibold text-[#3A3A3A]">{ui.leaderboardTitle}</h1>
                    <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">{seeds} 🌱</span>
                </header>
                <div className="px-4 py-4 space-y-3">
                    {leaderboard.map((user, i) => (
                        <div key={user.name} className={`flex items-center justify-between p-3 rounded-[16px] border ${user.isMe ? 'bg-[#E3EBC5]/30 border-[rgb(var(--vocado-accent-rgb)/0.3)]' : 'bg-white border-[#3A3A3A]/5'} shadow-sm`}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 flex items-center justify-center font-bold text-[#3A3A3A]/40 text-xs">
                                    {i === 0 ? <Trophy className="w-4 h-4 text-yellow-500" /> : i + 1}
                                </div>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${user.isMe ? 'bg-[rgb(var(--vocado-accent-rgb))] text-white' : 'bg-[#EAE8E0] text-[#3A3A3A]/60'}`}>
                                    {user.avatar}
                                </div>
                                <span className={`text-[14px] font-medium ${user.isMe ? 'text-[#3A3A3A]' : 'text-[#3A3A3A]/80'}`}>{user.name}</span>
                            </div>
                            <span className="text-[13px] font-semibold text-[#3A3A3A]/60">{user.score} 🌱</span>
                        </div>
                    ))}
                </div>
                {/* Navigation */}
                <nav className="fixed bottom-0 left-0 right-0 h-[56px] bg-[#FAF7F2]/95 backdrop-blur-md border-t border-[#3A3A3A]/5 flex items-center justify-between px-6 z-50 text-[#3A3A3A]/40">
                    <NavTab icon={Star} label={ui.nav?.home ?? "Home"} active={activeTab === "Home"} onClick={() => setActiveTab("Home")} />
                    <NavTab icon={Briefcase} label={ui.nav?.worlds ?? "Worlds"} active={activeTab === "Worlds"} onClick={() => setActiveTab("Worlds")} />
                    <NavTab icon={BookOpen} label={ui.nav?.vocables ?? "Vocables"} active={activeTab === "Vocables"} onClick={() => setActiveTab("Vocables")} />
                    <NavTab icon={Users} label={ui.nav?.friends ?? "Friends"} active={activeTab === "Friends"} onClick={() => setActiveTab("Friends")} />
                    <NavTab icon={User} label={ui.nav?.profile ?? "Me"} active={activeTab === "Me"} onClick={() => setActiveTab("Me")} />
                </nav>
            </div>
        )
    }

    return (
        <div className={`min-h-screen bg-[${COLORS.bg}] font-sans text-[${COLORS.text}] pb-16 relative overflow-hidden selection:bg-[#E3EBC5] selection:text-[#2C3E30]`}>

            {/* --- HEADER --- */}
            <header className="px-5 h-[56px] flex items-center justify-end fixed top-0 left-0 right-0 bg-[rgb(var(--vocado-footer-bg-rgb)/0.95)] backdrop-blur-sm z-40 border-b border-[rgb(var(--vocado-divider-rgb)/0.2)]">
                {/* Center: Title / Learned Today */}
                <div className="absolute left-1/2 -translate-x-1/2 text-center">
                    <h1 className="text-[20px] font-semibold tracking-tight text-[#3A3A3A]">
                        Voc<span className="text-[rgb(var(--vocado-accent-rgb))]">ado</span>
                    </h1>
                </div>

                {/* Right: Avatar & Seeds */}
                <div className="flex-1 flex justify-end items-center gap-2.5">
                    <span className="text-[12px] font-medium text-[#3A3A3A]/70 tracking-wide">{seeds} 🌱</span>
                    <div className="h-8 w-8 rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] overflow-hidden">
                        <img
                            src={avatarUrl || FALLBACK_AVATAR}
                            alt="Profile"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                                const target = e.currentTarget
                                if (target.src.endsWith(FALLBACK_AVATAR)) return
                                target.src = FALLBACK_AVATAR
                            }}
                        />
                    </div>
                </div>
            </header>

            <main className="px-4 pt-20 max-w-md mx-auto space-y-6">

                {/* --- 1. AI INPUT (Primary Focus) --- */}
                <section className="relative">
                    <div className="mb-1.5 pl-1 flex items-center justify-between">
                        <h2 className="font-serif text-[16px] text-[#3A3A3A] tracking-[0.02em]">
                            {ui.createWorldTitle}
                        </h2>
                        <button
                            type="button"
                            onClick={toggleTranslateMode}
                            disabled={isTranslating}
                            className={clsx(
                                "rounded-full border px-3 py-1 text-[10px] font-semibold shadow-sm transition-colors disabled:opacity-50",
                                translateMode
                                    ? "border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb)/0.2)] text-[#3A3A3A]"
                                    : "border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/70"
                            )}
                        >
                            {ui.translateAction}
                        </button>
                    </div>
                    <div className="relative group mb-1">
                        <div
                            className="absolute inset-0 rounded-[20px] border border-[rgb(var(--vocado-accent-rgb))] shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)] transition-all"
                            style={{ backgroundColor: "rgb(var(--vocado-section-bg-rgb))" }}
                        />
                        <div className="relative flex items-center gap-2 p-2.5">
                            <input
                                type="text"
                                className="bg-transparent border-none outline-none text-[15px] text-[#3A3A3A] placeholder:text-[#3A3A3A]/30 font-normal pr-8 w-[75%]"
                                placeholder={
                                    translateMode
                                        ? ui.translatePlaceholder
                                        : isGenerating
                                            ? ui.createWorldLoading
                                            : ui.createWorldPlaceholder
                                }
                                value={inputText}
                                onChange={(e) => {
                                    setInputText(e.target.value)
                                    setTranslateError(null)
                                    setTranslateResult(null)
                                    setCreateWorldError(null)
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
                            <div ref={attachMenuRef} className="absolute right-3.5 flex items-center gap-2">
                                <AnimatePresence>
                                    {showAttachMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9, x: 6 }}
                                            animate={{ opacity: 1, scale: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.9, x: 6 }}
                                            className="flex items-center gap-2"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => cameraInputRef.current?.click()}
                                                className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#3A3A3A]/10 flex items-center justify-center text-[#3A3A3A]/70 hover:text-[#3A3A3A]"
                                            >
                                                <Camera className="w-4 h-4" strokeWidth={1.8} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#3A3A3A]/10 flex items-center justify-center text-[#3A3A3A]/70 hover:text-[#3A3A3A]"
                                            >
                                                <FileText className="w-4 h-4" strokeWidth={1.8} />
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                {isGenerating && !translateMode && (
                                    <div className="h-5 w-5 rounded-full border-2 border-[rgb(var(--vocado-accent-rgb))] border-t-transparent animate-spin" />
                                )}
                                <button
                                    onClick={() => setShowAttachMenu((prev) => !prev)}
                                    disabled={isGenerating || isTranslating}
                                    className="text-[#3A3A3A]/40 hover:text-[#3A3A3A]/70 transition-colors disabled:opacity-50"
                                >
                                    <Plus className="w-4.5 h-4.5" strokeWidth={1.8} />
                                </button>
                                <input
                                    ref={cameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => handleUploadFile(e.target.files?.[0] ?? null)}
                                />
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="*/*"
                                    className="hidden"
                                    onChange={(e) => handleUploadFile(e.target.files?.[0] ?? null)}
                                />
                            </div>
                        </div>
                        {createWorldError && !translateMode && (
                            <div className="mt-2 text-[11px] text-[#B45353]">{createWorldError}</div>
                        )}
                    </div>
                    <div className="px-1.5">
                        <p className="text-[9px] leading-tight text-[#3A3A3A]/30 font-medium tracking-tight">
                            {ui.promptHelp}
                        </p>
                    </div>
                    <AnimatePresence>
                        {(translateResult || translateError) && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                className="mt-2 bg-[#FAF7F2] rounded-[16px] border border-[#3A3A3A]/5 p-3 shadow-[0_2px_10px_-6px_rgba(58,58,58,0.08)] relative"
                            >
                                {translateResult ? (
                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={handleAddTranslation}
                                            className="absolute right-3 top-3 h-7 w-7 rounded-full border border-[#3A3A3A]/10 bg-[#F6F2EB] text-[#3A3A3A]/70 hover:text-[#3A3A3A] flex items-center justify-center"
                                        >
                                            <Plus className="w-4 h-4" strokeWidth={1.8} />
                                        </button>
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
                <section className="space-y-2">
                    <h2 className="font-serif text-[16px] text-[#3A3A3A] pl-1 tracking-tighter">
                        {ui.todaysNewsTitle}
                    </h2>

                    {/* News Card */}
                    <div className="bg-[#FAF7F2] rounded-[24px] p-1 shadow-[0_4px_20px_-8px_rgba(58,58,58,0.03)] border border-[#3A3A3A]/5 overflow-hidden">

                        {/* Categories */}
                        <div className="flex items-center justify-center gap-6 pt-2 pb-1.5 text-[11px] font-medium text-[#3A3A3A]/50 border-b border-[#3A3A3A]/5">
                            {([
                                { id: "world", label: ui.newsTabs?.world ?? "World" },
                                { id: "wirtschaft", label: ui.newsTabs?.wirtschaft ?? "Economy" },
                                { id: "sport", label: ui.newsTabs?.sport ?? "Sport" },
                            ] as const).map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveNewsTab(cat.id)}
                                    className={`pb-0.5 relative transition-colors ${activeNewsTab === cat.id ? 'text-[#3A3A3A]' : 'hover:text-[#3A3A3A]/80'}`}
                                >
                                    {cat.label}
                                    {activeNewsTab === cat.id && (
                                        <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#3A3A3A]/20" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="p-2.5 pt-2 flex flex-col h-[180px]"> {/* Fixed height container */}
                            <div className="relative mb-4 h-[40px] flex items-center justify-center">
                                <h3 className="font-serif text-[16px] leading-[1.2] text-[#3A3A3A] text-center px-6 line-clamp-2 tracking-tighter">
                                    {isNewsLoading ? ui.newsLoading : (currentNews?.title || ui.noNewsAvailable)}
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddNewsToList}
                                    disabled={!currentNewsWorld}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/60 flex items-center justify-center hover:text-[#3A3A3A] disabled:opacity-60"
                                    aria-label={ui.overlay?.save ?? "Save"}
                                >
                                    {isCurrentNewsSaved ? (
                                        <Check className="w-4 h-4 text-[rgb(var(--vocado-accent-rgb))]" />
                                    ) : (
                                        <BookmarkPlus className="w-4 h-4" />
                                    )}
                                </button>
                            </div>

                            {/* Text Preview in Placeholder */}
                            <div className="relative flex-1 overflow-hidden bg-[#EBE7DF] rounded-[12px] px-3 py-2 mb-2">
                                <p className="text-[11px] leading-relaxed text-[#3A3A3A] font-serif">
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
                                        router.push(`/news?auto=1&category=${activeNewsTab}&index=${currentNewsIndex}`)
                                    }}
                                    className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[rgb(var(--vocado-accent-rgb))] hover:bg-[rgb(var(--vocado-accent-dark-rgb))] text-white px-3 py-1 rounded-full shadow-sm transition-all group scale-90"
                                >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span className="text-[10px] font-bold tracking-wide uppercase">{ui.readNow}</span>
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
                    <h2 className="font-serif text-[16px] text-[#3A3A3A] pl-1 tracking-tighter">
                        {ui.continueLearningTitle}
                    </h2>

                    <div className="bg-[#FAF7F2] rounded-[20px] p-2 border border-[#3A3A3A]/5 shadow-[0_2px_10px_-4px_rgba(58,58,58,0.02)]">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[14px] font-medium text-[#3A3A3A]">
                                        {lastPlayed?.title ?? "—"}
                                    </span>
                                </div>
                                <div className="text-[10px] text-[#3A3A3A]/50">
                                    {lastPlayed
                                        ? `${ui.levelLabel} ${Math.max(0, (lastPlayed.levelIndex ?? 0)) + 1}`
                                        : ui.noRecentSession}
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    if (!lastPlayed) return
                                    router.push(`/play?world=${encodeURIComponent(lastPlayed.id)}&level=${lastPlayed.levelIndex ?? 0}`)
                                }}
                                disabled={!lastPlayed}
                                className="bg-[rgb(var(--vocado-accent-rgb))] text-white/95 px-3 py-1 rounded-[10px] text-[11px] font-semibold tracking-wide shadow-sm hover:bg-[rgb(var(--vocado-accent-dark-rgb))] transition-colors disabled:opacity-50"
                            >
                                {ui.resumeLabel}
                            </button>
                        </div>

                        <div className="border-t border-[#3A3A3A]/10 my-2" />

                        <button
                            onClick={() =>
                                router.push(
                                    reviewStats.bucket === "hard"
                                        ? "/vocables?bucket=hard"
                                        : reviewStats.bucket === "new"
                                            ? "/vocables?bucket=new"
                                            : "/vocables"
                                )
                            }
                            className="w-full flex items-center justify-between group transition-colors text-left"
                        >
                            <div className="flex items-center gap-2.5">
                                <div>
                                    <div className="text-[14px] font-medium text-[#3A3A3A] mb-0.5">
                                        {reviewStats.count > 0 ? ui.reviewTitle : ui.allDone}
                                    </div>
                                    <div className="text-[10px] text-[#3A3A3A]/50">
                                        {formatTemplate(ui.reviewSubtitle, { count: String(reviewStats.count) })}
                                    </div>
                                </div>
                            </div>
                            <div className="w-6 h-6 rounded-full bg-[#EAE8E0] flex items-center justify-center text-[#3A3A3A]/40 group-hover:bg-[#EAE8E0]/80">
                                <ChevronRight className="w-3 h-3" />
                            </div>
                        </button>
                    </div>
                </section>

                {/* --- 4. LEADERBOARD --- */}
                <section className="space-y-2">
                    <h2 className="font-serif text-[16px] text-[#3A3A3A] pl-1 tracking-tighter">
                        {ui.leaderboardTitle}
                    </h2>
                    <div className="bg-[#FAF7F2] rounded-[24px] px-4 pt-2.5 pb-3 border border-[#3A3A3A]/5 shadow-[0_4px_20px_-8px_rgba(58,58,58,0.03)]">
                        <div className="flex items-center justify-center gap-2 mb-1.5">
                            {[
                                { id: "weekly", label: ui.leaderboardWeekly },
                                { id: "overall", label: ui.leaderboardOverall },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setLeaderboardScope(tab.id as "weekly" | "overall")}
                                    className={[
                                        "rounded-full px-4 py-1 text-[11px] font-medium border transition-colors",
                                        leaderboardScope === tab.id
                                            ? "border-[rgb(var(--vocado-accent-rgb))] bg-[rgb(var(--vocado-accent-rgb)/0.2)] text-[#3A3A3A]"
                                            : "border-[#3A3A3A]/10 bg-[#FAF7F2] text-[#3A3A3A]/70",
                                    ].join(" ")}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="space-y-0.5">
                            {leaderboardEntries.slice(0, 5).map((entry, index) => {
                                const entryKey = `${entry.username}-${index}`
                                const showImage =
                                    entry.avatarUrl && !failedAvatarEntries.has(entryKey)
                                return (
                                    <div
                                        key={entryKey}
                                        className="flex items-center justify-between px-1 py-1 text-[12px]"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-6 w-6 rounded-full border border-[#E3EBC5]/80 overflow-hidden bg-[#FFF] flex items-center justify-center">
                                                {showImage ? (
                                                    <img
                                                        src={entry.avatarUrl!}
                                                        alt={entry.username}
                                                        className="h-full w-full object-cover"
                                                        onError={() => {
                                                            setFailedAvatarEntries((prev) => {
                                                                const next = new Set(prev)
                                                                next.add(entryKey)
                                                                return next
                                                            })
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="text-[12px] font-semibold text-[#3A3A3A]">
                                                        {entry.username?.charAt(0)?.toUpperCase() ?? "U"}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[#3A3A3A] text-[13px]">{entry.username}</span>
                                        </div>
                                        <span className="font-semibold text-[#3A3A3A]/70">
                                            {entry.score} 🌱
                                        </span>
                                    </div>
                                )
                            })}
                            {leaderboardEntries.length === 0 && (
                                <div className="text-center text-[12px] text-[#3A3A3A]/50">
                                    —
                                </div>
                            )}
                        </div>
                    </div>
                </section>

            </main>


            {/* --- BOTTOM NAVIGATION --- */}
            <NavFooter labels={ui.nav} />

            {/* World Review Overlay */}
            <WorldReviewOverlay
                isOpen={isOverlayOpen}
                onClose={handleOverlayClose}
                onSave={handleOverlaySave}
                onPlayNow={handleOverlayPlayNow}
                initialWords={generatedWords}
                initialTitle={generatedTitle}
                labels={overlayLabels}
                existingWorlds={storedWorlds
                    .filter((world) => !world.news)
                    .map((world) => ({
                        id: world.id,
                        title: world.title,
                    }))}
                existingLists={storedLists}
                selectedListId={selectedOverlayListId}
                onSelectList={setSelectedOverlayListId}
                onGenerateMore={handleGenerateMoreWords}
            />
            {showTutorial && (
                <TutorialOverlay
                    step={tutorialStep}
                    ui={ui}
                    initialLevel={profileSettings.level}
                    initialSource={profileSettings.sourceLanguage}
                    initialTarget={profileSettings.targetLanguage}
                    initialNews={profileSettings.newsCategory}
                    initialAvatar={avatarUrl}
                    onNext={() => {
                        if (tutorialStep === "final") {
                            setShowTutorial(false)
                        } else {
                            if (tutorialStep === "tour_intro") {
                                setShowTutorial(false)
                            } else {
                                setTutorialStep("tour_intro")
                            }
                        }
                    }}
                    onTerminate={() => setShowTutorial(false)}
                    onSaveProfile={handleSaveOnboardingProfile}
                    savingProfile={savingProfile}
                    profileError={profileError}
                />
            )}
        </div >
    )
}

function NavTab({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
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
