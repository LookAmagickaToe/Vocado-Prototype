"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Check, ArrowRight, BookOpen, PartyPopper, Gamepad2, Plus, Newspaper } from "lucide-react"
import { Button } from "@/components/ui/button"

export type TutorialStep =
    | "welcome"
    | "tour_intro"
    | "play_intro"
    | "playing_game"
    | "post_game"
    | "create_instruction"
    | "creating"
    | "final"
    | "done"

interface TutorialOverlayProps {
    step: TutorialStep
    onNext: () => void
    onTerminate: () => void // Terminate tutorial completely
    onSaveProfile: (data: { source: string; target: string; level: string; news: string }) => Promise<void>
    initialSource?: string
    initialTarget?: string
    initialLevel?: string
    initialNews?: string
    savingProfile?: boolean
    profileError?: string | null
    ui: any
}

export default function TutorialOverlay({
    step,
    onNext,
    onTerminate,
    onSaveProfile,
    initialSource,
    initialTarget,
    initialLevel,
    initialNews,
    savingProfile,
    profileError,
    ui,
}: TutorialOverlayProps) {
    const [source, setSource] = useState(initialSource || "Español")
    const [target, setTarget] = useState(initialTarget || "English") // Default to English for broader appeal if auto
    const [level, setLevel] = useState(initialLevel || "A2")
    const [news, setNews] = useState(initialNews || "world")

    // Sync state if props change (e.g. from existing profile)
    useEffect(() => {
        if (initialSource) setSource(initialSource)
        if (initialTarget) setTarget(initialTarget)
        if (initialLevel) setLevel(initialLevel)
        if (initialNews) setNews(initialNews)
    }, [initialSource, initialTarget, initialLevel, initialNews])

    const handleProfileSave = () => {
        onSaveProfile({ source, target, level, news })
    }

    // Common wrapper for modal style content
    const ModalWrapper = ({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle?: string }) => (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950/95 p-6 shadow-2xl text-neutral-50 overflow-hidden"
            >
                <div className="absolute top-4 right-4">
                    <button onClick={onTerminate} className="text-xs text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors">
                        <X size={14} /> Terminate Tutorial
                    </button>
                </div>

                <div className="mb-6">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent mb-2">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="text-neutral-400 text-sm leading-relaxed">
                            {subtitle}
                        </p>
                    )}
                </div>

                {children}
            </motion.div>
        </div>
    )

    // Floating tooltip style for "in-app" guidance steps
    const TooltipWrapper = ({ children, position = "center" }: { children: React.ReactNode, position?: "center" | "bottom-right" | "top-right" }) => {
        const posClass = position === "center" ? "items-center justify-center" :
            position === "bottom-right" ? "items-end justify-end pb-12 pr-12" : "items-start justify-end pt-24 pr-12"

        return (
            <div className={`fixed inset-0 z-[90] pointer-events-none flex ${posClass} p-6`}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="pointer-events-auto max-w-md rounded-2xl border border-green-500/30 bg-neutral-950/90 p-5 shadow-2xl backdrop-blur text-neutral-50"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                            {children}
                        </div>
                        <button onClick={onTerminate} className="ml-4 text-neutral-600 hover:text-neutral-400">
                            <X size={16} />
                        </button>
                    </div>
                </motion.div>
            </div>
        )
    }

    if (step === "welcome") {
        return (
            <ModalWrapper title={ui.tutorial.welcomeTitle} subtitle={ui.tutorial.welcomeSubtitle}>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 block">{ui.tutorial.sourceLabel}</label>
                            <select
                                value={source}
                                onChange={(e) => setSource(e.target.value)}
                                className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                            >
                                {["Español", "Deutsch", "English", "Français", "Português"].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 block">{ui.tutorial.targetLabel}</label>
                            <select
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                            >
                                {["Español", "Deutsch", "English", "Français", "Português"].filter(l => l !== source).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 block">{ui.tutorial.levelLabel}</label>
                        <div className="grid grid-cols-6 gap-2">
                            {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                                <button
                                    key={lvl}
                                    onClick={() => setLevel(lvl)}
                                    className={`rounded-lg py-2 text-xs font-semibold transition-all ${level === lvl
                                        ? "bg-green-600/20 text-green-400 border border-green-500/50"
                                        : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                                        }`}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1.5 block">{ui.tutorial.newsLabel}</label>
                        <select
                            value={news}
                            onChange={(e) => setNews(e.target.value)}
                            className="w-full rounded-xl bg-neutral-900/50 border border-neutral-800 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
                        >
                            <option value="world">{ui.news.categoryOptions.world}</option>
                            <option value="wirtschaft">{ui.news.categoryOptions.wirtschaft}</option>
                            <option value="sport">{ui.news.categoryOptions.sport}</option>
                        </select>
                    </div>

                    {profileError && (
                        <p className="text-red-400 text-xs">{profileError}</p>
                    )}

                    <div className="pt-2 flex justify-end">
                        <Button
                            onClick={handleProfileSave}
                            disabled={savingProfile}
                            className="bg-neutral-100 text-neutral-900 hover:bg-white font-semibold rounded-xl px-6"
                        >
                            {savingProfile ? ui.tutorial.saving : ui.tutorial.startJourney}
                        </Button>
                    </div>
                </div>
            </ModalWrapper>
        )
    }

    if (step === "tour_intro") {
        return (
            <ModalWrapper title="Welcome Aboard! 🚀" subtitle="Vocado is not just a flashcard app. It's an immersive world-based learning experience.">
                <div className="space-y-6">
                    <div className="space-y-4 text-sm text-neutral-300">
                        <div className="flex gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                                <Gamepad2 size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-100">Worlds</h3>
                                <p className="text-neutral-400">Your vocabulary sets are "Worlds". Each world is a memory game that helps you master words through play.</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                                <Newspaper size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-100">Smart Content</h3>
                                <p className="text-neutral-400">Generate worlds from daily news, themes, or your own files using AI.</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button
                            onClick={onNext}
                            className="bg-neutral-100 text-neutral-900 hover:bg-white font-semibold rounded-xl px-6 flex items-center gap-2"
                        >
                            Let's Play <ArrowRight size={16} />
                        </Button>
                    </div>
                </div>
            </ModalWrapper>
        )
    }

    // Steps that are overlaying the actual app
    if (step === "play_intro") {
        return (
            <TooltipWrapper position="center">
                <h3 className="text-lg font-bold text-green-400 mb-2">{ui.tutorial.playIntroTitle}</h3>
                <p className="text-sm text-neutral-300 mb-4" dangerouslySetInnerHTML={{ __html: ui.tutorial.playIntroDesc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                <div className="h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 w-1/4 animate-pulse" />
                </div>
            </TooltipWrapper>
        )
    }

    if (step === "playing_game") {
        return (
            <TooltipWrapper position="bottom-right">
                <h3 className="text-lg font-bold text-blue-400 mb-2">{ui.tutorial.playingTitle}</h3>
                <p className="text-sm text-neutral-300">
                    {ui.tutorial.playingDesc}
                </p>
            </TooltipWrapper>
        )
    }

    if (step === "post_game") {
        return (
            <ModalWrapper title={ui.tutorial.postGameTitle} subtitle={ui.tutorial.postGameSubtitle}>
                <div className="space-y-6">
                    <p className="text-neutral-300">
                        {ui.tutorial.postGameDesc}
                    </p>

                    <div className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
                        <h4 className="font-medium text-neutral-200 mb-2 flex items-center gap-2">
                            <Plus size={16} className="text-green-400" /> {ui.tutorial.createTitle}
                        </h4>
                        <p className="text-xs text-neutral-400 whitespace-pre-line">
                            {ui.tutorial.createExamples}
                        </p>
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={onNext} className="bg-neutral-100 text-neutral-900 hover:bg-white rounded-xl">
                            {ui.tutorial.tryCreating}
                        </Button>
                    </div>
                </div>
            </ModalWrapper>
        )
    }

    if (step === "create_instruction") {
        return (
            <TooltipWrapper position="top-right">
                <h3 className="font-semibold text-neutral-100 mb-1">{ui.tutorial.createInstructionTitle}</h3>
                <p className="text-sm text-neutral-400" dangerouslySetInnerHTML={{ __html: ui.tutorial.createInstructionDesc }} />
            </TooltipWrapper>
        )
    }

    if (step === "creating") {
        // Hidden, waiting for user to finish creation
        return null
    }

    if (step === "final") {
        return (
            <ModalWrapper title={ui.tutorial.finalTitle} subtitle={ui.tutorial.finalSubtitle}>
                <div className="text-center space-y-6 py-4">
                    <div className="mx-auto w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 mb-4">
                        <PartyPopper size={40} />
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-3 bg-neutral-900/50 rounded-xl">
                            <div className="text-xl font-bold text-neutral-100">50</div>
                            <div className="text-[10px] uppercase font-bold text-neutral-500 mt-1">{ui.tutorial.pointsAwarded}</div>
                        </div>
                        <div className="p-3 bg-neutral-900/50 rounded-xl opacity-50">
                            <div className="text-xl font-bold text-neutral-100">Daily</div>
                            <div className="text-[10px] uppercase font-bold text-neutral-500 mt-1">{ui.tutorial.dailyChallenge}</div>
                        </div>
                        <div className="p-3 bg-neutral-900/50 rounded-xl opacity-50">
                            <div className="text-xl font-bold text-neutral-100">News</div>
                            <div className="text-[10px] uppercase font-bold text-neutral-500 mt-1">{ui.tutorial.newsReader}</div>
                        </div>
                    </div>

                    <p className="text-lg text-neutral-200">
                        {ui.tutorial.finalDesc}
                    </p>

                    <Button size="lg" onClick={onNext} className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl text-lg font-semibold h-12">
                        {ui.tutorial.finish}
                    </Button>
                </div>
            </ModalWrapper>
        )
    }

    return null
}
