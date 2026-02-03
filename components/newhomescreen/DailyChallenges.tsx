"use client"

import { CheckCircle2, Circle, ChevronRight, Newspaper, BookOpen, Trophy } from "lucide-react"
import { useRouter } from "next/navigation"

type Challenge = {
    id: "newspaper" | "vocab" | "perfect"
    title: string
    description: string
    icon: typeof Newspaper
    completed: boolean
    reward: number
    linkTo: string
    progress?: number
    maxProgress?: number
}

type DailyChallengesProps = {
    challenges: {
        newspaper: boolean
        vocab: boolean
        perfect: boolean
        points_earned: number
        vocab_progress?: number
    }
    onChallengeClick: (id: string) => void
    sourceLanguage: string
    ripenessLevel?: number
}

function ProgressRing({ progress, total, completed }: { progress: number; total: number; completed: boolean }) {
    if (completed) {
        return <CheckCircle2 className="w-5 h-5 text-[rgb(var(--vocado-accent-rgb))]" />
    }

    if (progress <= 0) {
        return <Circle className="w-5 h-5 text-[#3A3A3A]/30" />
    }

    const radius = 9
    const circumference = 2 * Math.PI * radius
    const percentage = Math.min(100, (progress / total) * 100)
    const offset = circumference - (percentage / 100) * circumference

    return (
        <div className="relative w-5 h-5">
            {/* Background Circle */}
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 24 24">
                <circle
                    cx="12"
                    cy="12"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-[#3A3A3A]/10"
                />
                {/* Progress Circle */}
                <circle
                    cx="12"
                    cy="12"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="text-[rgb(var(--vocado-accent-rgb))] transition-all duration-500 ease-out"
                />
            </svg>
        </div>
    )
}

export default function DailyChallenges({
    challenges,
    onChallengeClick,
    sourceLanguage,
    ripenessLevel = 0,
}: DailyChallengesProps) {
    const router = useRouter()

    // Get UI text based on language
    const getUI = (lang: string) => {
        const ui = {
            Español: {
                title: "Desafíos Diarios",
                streak: "Racha",
                days: "días",
                ripenessTitle: "🥑 El Ciclo de Madurez",
                seedPhase: "Semilla",
                sproutPhase: "Brote",
                treePhase: "Árbol",
                fruitfulPhase: "Fructífero",
                needsWater: "Riega tu planta completando los 3 desafíos diarios",
                keepGrowing: "Nutre tu planta completando los 3 desafíos diarios",
                harvestSuccess: "Cosecha completando los 3 desafíos diarios",
                newspaper: "Leer el periódico",
                newspaperDesc: "Juega el artículo de noticias de hoy",
                vocab: "Repasar 20 palabras",
                vocabDesc: "Practica vocabulario antiguo",
                perfect: "Puntuación perfecta",
                perfectDesc: "8 pares en ≤14 movimientos",
                play: "JUGAR",
                practice: "PRACTICAR",
                total: "Total",
                today: "hoy",
                points: "puntos",
            },
            Deutsch: {
                title: "Tägliche Herausforderungen",
                streak: "Serie",
                days: "Tage",
                ripenessTitle: "🥑 Der Reifezyklus",
                seedPhase: "Samen",
                sproutPhase: "Keimling",
                treePhase: "Baum",
                fruitfulPhase: "Fruchtbar",
                needsWater: "Gieße deine Pflanze, indem du alle 3 täglichen Herausforderungen meisterst",
                keepGrowing: "Nähre deine Pflanze, indem du alle 3 täglichen Herausforderungen meisterst",
                harvestSuccess: "Ernte, indem du alle 3 täglichen Herausforderungen meisterst",
                newspaper: "Zeitung lesen",
                newspaperDesc: "Spiele den heutigen Nachrichtenartikel",
                vocab: "20 Wörter wiederholen",
                vocabDesc: "Übe alte Vokabeln",
                perfect: "Perfekte Punktzahl",
                perfectDesc: "8 Paare in ≤14 Zügen",
                play: "SPIELEN",
                practice: "ÜBEN",
                total: "Gesamt",
                today: "heute",
                points: "Punkte",
            },
            English: {
                title: "Daily Challenges",
                streak: "Streak",
                days: "days",
                ripenessTitle: "🥑 The Ripeness Cycle",
                seedPhase: "Seed",
                sproutPhase: "Sprout",
                treePhase: "Tree",
                fruitfulPhase: "Fruitful",
                needsWater: "Water your plant by accomplishing all 3 daily challenges",
                keepGrowing: "Nurture your plant by accomplishing all 3 daily challenges",
                harvestSuccess: "Harvest by accomplishing all 3 daily challenges",
                newspaper: "Read the Newspaper",
                newspaperDesc: "Play today's news article",
                vocab: "Revise 20 Words",
                vocabDesc: "Practice old vocabulary",
                perfect: "Perfect Score",
                perfectDesc: "8 pairs in ≤14 moves",
                play: "PLAY",
                practice: "PRACTICE",
                total: "Total",
                today: "today",
                points: "points",
            },
            Français: {
                title: "Défis Quotidiens",
                streak: "Série",
                days: "jours",
                ripenessTitle: "🥑 Le Cycle de Maturité",
                seedPhase: "Graine",
                sproutPhase: "Pousse",
                treePhase: "Arbre",
                fruitfulPhase: "Fructueux",
                needsWater: "Arrosez votre plante en accomplissant les 3 défis quotidiens",
                keepGrowing: "Nourrissez votre plante en accomplissant les 3 défis quotidiens",
                harvestSuccess: "Récoltez en accomplissant les 3 défis quotidiens",
                newspaper: "Lire le journal",
                newspaperDesc: "Jouez l'article d'actualité du jour",
                vocab: "Réviser 20 mots",
                vocabDesc: "Pratiquez l'ancien vocabulaire",
                perfect: "Score parfait",
                perfectDesc: "8 paires en ≤14 mouvements",
                play: "JOUER",
                practice: "PRATIQUER",
                total: "Total",
                today: "aujourd'hui",
                points: "points",
            },
            Português: {
                title: "Desafios Diários",
                streak: "Sequência",
                days: "dias",
                ripenessTitle: "🥑 O Ciclo de Maturação",
                seedPhase: "Semente",
                sproutPhase: "Broto",
                treePhase: "Árvore",
                fruitfulPhase: "Frutífero",
                needsWater: "Regue sua planta completando todos os 3 desafios diários",
                keepGrowing: "Nutra sua planta completando todos os 3 desafios diários",
                harvestSuccess: "Colha completando todos os 3 desafios diários",
                newspaper: "Ler o jornal",
                newspaperDesc: "Jogue o artigo de notícias de hoje",
                vocab: "Revisar 20 palavras",
                vocabDesc: "Pratique vocabulário antigo",
                perfect: "Pontuação perfeita",
                perfectDesc: "8 pares em ≤14 movimentos",
                play: "JOGAR",
                practice: "PRATICAR",
                total: "Total",
                today: "hoje",
                points: "pontos",
            },
        }
        return ui[lang as keyof typeof ui] || ui.English
    }

    const ui = getUI(sourceLanguage)

    // Get ripeness phase based on streak days
    const getRipenessPhase = (days: number) => {
        // Global progress for the 7-day cycle
        const progress = Math.min(days, 7)
        const maxProgress = 7

        if (days < 2) {
            // Seed Phase: Days 0-1
            return {
                emoji: "🫘",
                phase: ui.seedPhase,
                status: ui.needsWater,
                progress,
                maxProgress,
                color: "rgb(139, 69, 19)" // Brown for seed
            }
        } else if (days < 5) {
            // Sprout Phase: Days 2-4
            return {
                emoji: "🌱",
                phase: ui.sproutPhase,
                status: ui.keepGrowing,
                progress,
                maxProgress,
                color: "rgb(107, 142, 35)" // Olive/Green for sprout
            }
        } else if (days < 7) {
            // Tree Phase: Days 5-6
            return {
                emoji: "🌳",
                phase: ui.treePhase,
                status: ui.keepGrowing,
                progress,
                maxProgress,
                color: "rgb(34, 139, 34)" // Forest green for tree
            }
        } else {
            // Fruitful Phase: Days 7+
            return {
                emoji: "🥑",
                phase: ui.fruitfulPhase,
                status: ui.harvestSuccess,
                progress: 7, // Full
                maxProgress: 7,
                color: "rgb(var(--vocado-accent-rgb))" // Avocado green for fruitful
            }
        }
    }

    const ripenessPhase = getRipenessPhase(ripenessLevel)

    const challengeList: Challenge[] = [
        {
            id: "newspaper",
            title: ui.newspaper,
            description: ui.newspaperDesc,
            icon: Newspaper,
            completed: challenges.newspaper,
            reward: 10,
            linkTo: "/news",
        },
        {
            id: "vocab",
            title: ui.vocab,
            description: ui.vocabDesc,
            icon: BookOpen,
            completed: challenges.vocab,
            reward: 15,
            linkTo: "/vocables",
            progress: challenges.vocab_progress ?? 0,
            maxProgress: 20,
        },
        {
            id: "perfect",
            title: ui.perfect,
            description: ui.perfectDesc,
            icon: Trophy,
            completed: challenges.perfect,
            reward: 20,
            linkTo: "/play",
        },
    ]

    return (
        <section className="space-y-2">
            <h2 className="font-serif text-[16px] text-[#3A3A3A] pl-1 tracking-tighter">
                {ui.title}
            </h2>

            <div className="bg-[#FAF7F2] rounded-[24px] p-4 border border-[#3A3A3A]/5 shadow-[0_4px_20px_-8px_rgba(58,58,58,0.03)] space-y-3">
                {/* Ripeness Cycle Progression */}
                <div className="pb-3 border-b border-[#3A3A3A]/5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[18px]">{ripenessPhase.emoji}</span>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold text-[#3A3A3A]">
                                    {ripenessPhase.phase}
                                </span>
                                <span className="text-[10px] text-[#3A3A3A]/60">
                                    {Math.min(ripenessLevel, 7)} / 7 {ui.days}
                                </span>
                            </div>
                            {/* Progress Bar with Avocado */}
                            <div className="flex items-center gap-2 w-full">
                                <div className="flex-1 h-1.5 bg-[#3A3A3A]/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${(ripenessPhase.progress / ripenessPhase.maxProgress) * 100}%`,
                                            backgroundColor: ripenessPhase.color
                                        }}
                                    />
                                </div>
                                <span className="text-[16px] leading-none select-none">🥑</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-[11px] text-[#3A3A3A]/70 pl-7">
                        {ripenessPhase.status}
                    </div>
                </div>
                {challengeList.map((challenge) => {
                    const Icon = challenge.icon
                    return (
                        <button
                            key={challenge.id}
                            onClick={() => {
                                onChallengeClick(challenge.id)
                                router.push(challenge.linkTo)
                            }}
                            className={[
                                "w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left",
                                challenge.completed
                                    ? "bg-[rgb(var(--vocado-accent-rgb)/0.1)] border-[rgb(var(--vocado-accent-rgb)/0.3)]"
                                    : "bg-white border-[#3A3A3A]/10 hover:border-[#3A3A3A]/20",
                            ].join(" ")}
                        >
                            {/* Icon & Checkmark / Progress */}
                            <div className="flex-shrink-0">
                                <ProgressRing
                                    progress={challenge.progress ?? 0}
                                    total={challenge.maxProgress ?? 1}
                                    completed={challenge.completed}
                                />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Icon className="w-3.5 h-3.5 text-[#3A3A3A]/60" />
                                    <span className="text-[13px] font-semibold text-[#3A3A3A]">
                                        {challenge.title}
                                    </span>
                                </div>
                                <div className="text-[11px] text-[#3A3A3A]/60">
                                    {challenge.description}
                                </div>
                            </div>

                            {/* Reward & Arrow */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[12px] font-semibold text-[rgb(var(--vocado-accent-rgb))]">
                                    +{challenge.reward} 🌱
                                </span>
                                <ChevronRight className="w-4 h-4 text-[#3A3A3A]/30" />
                            </div>
                        </button>
                    )
                })}

                {/* Total Progress */}
                <div className="pt-2 border-t border-[#3A3A3A]/5">
                    <div className="flex items-center justify-between text-[12px]">
                        <span className="text-[#3A3A3A]/60">
                            {ui.total}: {challenges.points_earned}/45 {ui.points} {ui.today}
                        </span>
                        <div className="flex gap-1">
                            {[challenges.newspaper, challenges.vocab, challenges.perfect].map((done, i) => (
                                <div
                                    key={i}
                                    className={[
                                        "w-2 h-2 rounded-full",
                                        done ? "bg-[rgb(var(--vocado-accent-rgb))]" : "bg-[#3A3A3A]/10",
                                    ].join(" ")}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
