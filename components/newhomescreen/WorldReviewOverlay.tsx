"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, Minus, Play } from "lucide-react"
import type { VocabPair } from "@/types/worlds"
import { initializeSRS } from "@/lib/srs"

// Design system colors
const COLORS = {
    bg: "#F6F2EB",
    bgCard: "#FAF7F2",
    accent: "#9FB58E",
    text: "#3A3A3A",
    textMuted: "rgba(58, 58, 58, 0.5)",
    border: "rgba(58, 58, 58, 0.05)",
}

type WordStatus = "new" | "known" | "unsure"

export type ReviewWord = {
    id: string
    source: string
    target: string
    status: WordStatus
    emoji?: string
    explanation?: string
}

type WorldReviewOverlayProps = {
    isOpen: boolean
    onClose: () => void
    onSave: (words: ReviewWord[], worldId: string | null, title: string) => void
    onPlayNow: (words: ReviewWord[], worldId: string | null, title: string) => void
    initialWords?: ReviewWord[]
    initialTitle?: string
    existingWorlds?: { id: string; title: string }[]
    onGenerateMore?: (count: number, existingWords: ReviewWord[]) => Promise<ReviewWord[]>
}

export default function WorldReviewOverlay({
    isOpen,
    onClose,
    onSave,
    onPlayNow,
    initialWords = [],
    initialTitle = "",
    existingWorlds = [],
    onGenerateMore,
}: WorldReviewOverlayProps) {
    const [words, setWords] = useState<ReviewWord[]>(initialWords)
    const [title, setTitle] = useState(initialTitle)
    const [selectedWorldId, setSelectedWorldId] = useState<string | null>(null)
    const [isNewWorld, setIsNewWorld] = useState(true)
    const [generateCount, setGenerateCount] = useState(10)
    const [isGenerating, setIsGenerating] = useState(false)

    // Sync props to state when overlay opens with new data
    useEffect(() => {
        if (isOpen) {
            setWords(initialWords)
            setTitle(initialTitle)
        }
    }, [isOpen, initialWords, initialTitle])

    const handleStatusChange = (wordId: string, status: WordStatus) => {
        setWords(prev =>
            prev.map(w => (w.id === wordId ? { ...w, status } : w))
        )
    }

    const handleRemoveWord = (wordId: string) => {
        setWords(prev => prev.filter(w => w.id !== wordId))
    }

    const handleGenerateMore = async () => {
        if (!onGenerateMore || isGenerating) return
        setIsGenerating(true)
        try {
            const newWords = await onGenerateMore(generateCount, words)
            // Filter out duplicates by source word
            const existingSources = new Set(words.map(w => w.source.toLowerCase()))
            const uniqueNewWords = newWords.filter(
                w => !existingSources.has(w.source.toLowerCase())
            )
            setWords(prev => [...prev, ...uniqueNewWords])
        } catch (e) {
            console.error("Failed to generate more words:", e)
        } finally {
            setIsGenerating(false)
        }
    }

    const handleSave = () => {
        onSave(words, isNewWorld ? null : selectedWorldId, title)
    }

    const handlePlayNow = () => {
        onPlayNow(words, isNewWorld ? null : selectedWorldId, title)
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                style={{ backgroundColor: COLORS.bg }}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between" style={{ backgroundColor: `${COLORS.bg}F5` }}>
                    <div className="w-8" /> {/* Spacer for centering */}

                    {/* Editable Title */}
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Untitled World"
                        className="text-center text-[18px] font-medium bg-transparent border-none outline-none"
                        style={{ color: COLORS.text }}
                    />

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                        style={{ color: COLORS.textMuted }}
                    >
                        <X size={20} strokeWidth={1.5} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 pb-32 max-w-lg mx-auto">
                    {/* World Classification */}
                    <section className="mb-6">
                        <p className="text-[12px] font-medium mb-2 px-1" style={{ color: COLORS.textMuted }}>
                            Diese Wörter gehören zu:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setIsNewWorld(true)}
                                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${isNewWorld
                                    ? "text-white"
                                    : ""
                                    }`}
                                style={{
                                    backgroundColor: isNewWorld ? COLORS.accent : COLORS.bgCard,
                                    color: isNewWorld ? "white" : COLORS.textMuted,
                                    border: `1px solid ${isNewWorld ? COLORS.accent : COLORS.border}`,
                                }}
                            >
                                + Neue Welt
                            </button>
                            {existingWorlds.map(world => (
                                <button
                                    key={world.id}
                                    onClick={() => {
                                        setSelectedWorldId(world.id)
                                        setIsNewWorld(false)
                                    }}
                                    className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
                                    style={{
                                        backgroundColor: !isNewWorld && selectedWorldId === world.id ? COLORS.accent : COLORS.bgCard,
                                        color: !isNewWorld && selectedWorldId === world.id ? "white" : COLORS.textMuted,
                                        border: `1px solid ${!isNewWorld && selectedWorldId === world.id ? COLORS.accent : COLORS.border}`,
                                    }}
                                >
                                    {world.title}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Words Table */}
                    <section className="mb-6">
                        <div
                            className="rounded-[16px] overflow-hidden"
                            style={{
                                backgroundColor: COLORS.bgCard,
                                border: `1px solid ${COLORS.border}`,
                            }}
                        >
                            {/* Table Header */}
                            <div
                                className="grid grid-cols-[1fr_1fr_auto] gap-2 px-4 py-2 text-[11px] font-medium"
                                style={{
                                    color: COLORS.textMuted,
                                    borderBottom: `1px solid ${COLORS.border}`,
                                }}
                            >
                                <span>Wort</span>
                                <span>Übersetzung</span>
                                <span className="w-16 text-center">Status</span>
                            </div>

                            {/* Table Rows */}
                            {words.map((word, index) => (
                                <div
                                    key={word.id}
                                    className="grid grid-cols-[1fr_1fr_auto] gap-2 px-4 py-2.5 items-center"
                                    style={{
                                        borderBottom: index < words.length - 1 ? `1px solid ${COLORS.border}` : undefined,
                                    }}
                                >
                                    <span className="text-[13px]" style={{ color: COLORS.text }}>
                                        {word.emoji && <span className="mr-1.5">{word.emoji}</span>}
                                        {word.source}
                                    </span>
                                    <span className="text-[13px]" style={{ color: COLORS.text }}>
                                        {word.target}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <select
                                            value={word.status}
                                            onChange={(e) => handleStatusChange(word.id, e.target.value as WordStatus)}
                                            className="text-[10px] bg-transparent border-none outline-none w-14"
                                            style={{ color: COLORS.textMuted }}
                                        >
                                            <option value="new">neu</option>
                                            <option value="known">bekannt</option>
                                            <option value="unsure">unsicher</option>
                                        </select>
                                        <button
                                            onClick={() => handleRemoveWord(word.id)}
                                            className="p-0.5 rounded opacity-40 hover:opacity-70 transition-opacity"
                                            style={{ color: COLORS.text }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {words.length === 0 && (
                                <div className="px-4 py-8 text-center text-[13px]" style={{ color: COLORS.textMuted }}>
                                    Keine Wörter vorhanden
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Generate More */}
                    {onGenerateMore && (
                        <section className="mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setGenerateCount(prev => Math.max(5, prev - 5))}
                                        className="w-7 h-7 flex items-center justify-center rounded-full"
                                        style={{
                                            backgroundColor: COLORS.bgCard,
                                            color: COLORS.textMuted,
                                            border: `1px solid ${COLORS.border}`,
                                        }}
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="text-[14px] font-medium w-8 text-center" style={{ color: COLORS.text }}>
                                        {generateCount}
                                    </span>
                                    <button
                                        onClick={() => setGenerateCount(prev => Math.min(50, prev + 5))}
                                        className="w-7 h-7 flex items-center justify-center rounded-full"
                                        style={{
                                            backgroundColor: COLORS.bgCard,
                                            color: COLORS.textMuted,
                                            border: `1px solid ${COLORS.border}`,
                                        }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={handleGenerateMore}
                                    disabled={isGenerating}
                                    className="flex-1 py-2 rounded-full text-[13px] font-medium transition-all disabled:opacity-50"
                                    style={{
                                        backgroundColor: COLORS.bgCard,
                                        color: COLORS.text,
                                        border: `1px solid ${COLORS.border}`,
                                    }}
                                >
                                    {isGenerating ? "Generieren..." : "Mehr generieren"}
                                </button>
                            </div>
                        </section>
                    )}
                </div>

                {/* Bottom Actions */}
                <div
                    className="fixed bottom-0 left-0 right-0 px-5 py-4 flex items-center justify-between gap-4"
                    style={{
                        backgroundColor: `${COLORS.bg}F8`,
                        backdropFilter: "blur(8px)",
                        borderTop: `1px solid ${COLORS.border}`,
                    }}
                >
                    <button
                        onClick={handleSave}
                        className="flex-1 py-3 rounded-full text-[14px] font-medium transition-all"
                        style={{
                            backgroundColor: COLORS.bgCard,
                            color: COLORS.text,
                            border: `1px solid ${COLORS.border}`,
                        }}
                    >
                        Speichern
                    </button>
                    <button
                        onClick={handlePlayNow}
                        className="flex-1 py-3 rounded-full text-[14px] font-medium text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                        style={{ backgroundColor: COLORS.accent }}
                    >
                        <Play size={16} fill="white" />
                        Jetzt spielen
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
