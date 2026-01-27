"use client"

import { Leaf, RefreshCw, ChevronLeft, ChevronRight, Check, Briefcase, User, BookOpen, Star, MoreHorizontal } from "lucide-react"
import { motion } from "framer-motion"
import { useState } from "react"

export default function PrototypeClient() {
    const [activeNewsTab, setActiveNewsTab] = useState("World")
    const [newsIndex, setNewsIndex] = useState(0)

    return (
        <div className="min-h-screen bg-[#FDFCF8] font-sans text-[#3A3A3A] selection:bg-[#E3EBC5] selection:text-[#2C3E30] pb-24 relative overflow-hidden">
            {/* Texture Overlay */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0 mix-blend-multiply"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")` }}
            />

            <div className="relative z-10 max-w-md mx-auto px-5 pt-6">

                {/* Top Header Area */}
                <div className="flex justify-between items-center mb-6">
                    {/* Placeholder for Back/Menu if needed, currently empty or Chevron as in previous designs */}
                    <button className="p-2 -ml-2 text-[#9A9890] hover:text-[#7A7870] transition-colors opacity-0 pointer-events-none">
                        <ChevronLeft className="w-6 h-6" strokeWidth={1.5} />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-[#EAE8E0] border border-white/50 shadow-sm overflow-hidden relative">
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-[#8A8A8A]">ME</div>
                    </div>
                </div>

                {/* 1. Keyword Chips (Thought Starters) */}
                <div className="flex flex-wrap gap-3 mb-6 px-1">
                    {["phrases I heard today", "news about climate", "meeting vocabulary"].map((tag, i) => (
                        <span key={i} className="text-[14px] text-[#9A9890] bg-transparent hover:text-[#7A8C53] cursor-pointer transition-colors px-1">
                            {tag}
                        </span>
                    ))}
                </div>

                {/* 2. AI Input (Central Interaction) */}
                <div className="mb-4 relative group">
                    <div className="absolute inset-0 bg-white/60 rounded-[24px] shadow-[0_2px_15px_-8px_rgba(0,0,0,0.05)] transition-all group-hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.08)]" />
                    <div className="relative flex items-start gap-4 p-5 min-h-[110px]">
                        <Leaf className="w-5 h-5 text-[#9CB071] mt-1 shrink-0 opacity-80" strokeWidth={2} />
                        <textarea
                            className="w-full bg-transparent border-none resize-none outline-none text-[16px] leading-[1.6] text-[#4A4A4A] placeholder:text-[#A09E96] font-normal"
                            placeholder="Paste text, write what you want to learn, or drop a link or topic..."
                            rows={3}
                        />
                    </div>
                </div>

                {/* 3. Review Strip */}
                <button className="w-full mb-10 mx-auto max-w-[95%] flex items-center justify-center gap-2.5 py-2.5 rounded-full bg-[#FAF9F6] border border-[#EAE8E0]/60 text-[#8A8880] hover:text-[#5A5850] hover:border-[#D6D3CD] transition-all group">
                    <RefreshCw className="w-3.5 h-3.5 opacity-60 group-hover:rotate-180 transition-transform duration-500" />
                    <span className="text-[13px] font-medium tracking-wide">Review words from yesterday</span>
                    <ChevronRight className="w-3 h-3 opacity-40 ml-0.5" />
                </button>

                {/* 4. Today's News */}
                <div className="mb-10">
                    <h2 className="text-center font-serif text-[19px] text-[#4A4A4A] mb-4 opacity-90 tracking-tight">Today's News</h2>

                    <div className="bg-white/70 rounded-[28px] p-1 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.03)] border border-[#EAE8E0]/40 overflow-hidden">
                        {/* 4.1 Categories */}
                        <div className="flex items-center justify-center gap-6 pt-3 pb-2 border-b border-[#EAE8E0]/50 text-[13px] font-medium text-[#9A9890]">
                            {["World", "Economics", "Sport"].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveNewsTab(cat)}
                                    className={`pb-1.5 border-b-2 transition-all ${activeNewsTab === cat ? 'text-[#5A5850] border-[#9CB071]/50' : 'border-transparent hover:text-[#7A7870]'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                            <MoreHorizontal className="w-4 h-4 opacity-40" />
                        </div>

                        {/* 4.2 Newspaper Content */}
                        <div className="p-5 pt-6">
                            <h3 className="font-serif text-[20px] leading-[1.3] text-[#3A3A3A] mb-4 text-center">
                                Germany debates new climate policy
                            </h3>

                            <div className="w-full h-32 bg-[#EAE8E0]/50 rounded-[16px] mb-5 relative overflow-hidden grayscale opacity-80">
                                {/* Placeholder Image Feel */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {/* Simple newspaper icon placeholder */}
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CCCAC0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                                        <path d="M18 14h-8" />
                                        <path d="M15 18h-5" />
                                        <path d="M10 6h8v4h-8V6Z" />
                                    </svg>
                                </div>
                            </div>

                            <div className="space-y-2.5 mb-6 px-2">
                                <div className="h-1.5 w-full bg-[#EAE8E0]/60 rounded-full" />
                                <div className="h-1.5 w-[90%] bg-[#EAE8E0]/60 rounded-full" />
                                <div className="h-1.5 w-[95%] bg-[#EAE8E0]/60 rounded-full" />
                            </div>

                            {/* 4.3 Nav */}
                            <div className="flex items-center justify-between px-2 text-[#9A9890]">
                                <button className="p-1 hover:text-[#5A5850]"><ChevronLeft className="w-5 h-5" /></button>
                                <span className="text-[12px] font-medium tracking-widest opacity-60">1 / 3</span>
                                <button className="p-1 hover:text-[#5A5850]"><ChevronRight className="w-5 h-5" /></button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Continue Learning */}
                <div className="mb-8">
                    <h2 className="pl-4 font-serif text-[18px] text-[#4A4A4A] mb-3 opacity-90 tracking-tight">Continue Learning</h2>
                    <div className="bg-[#F7F5EF] rounded-[24px] p-5 flex items-center justify-between border border-[#EAE8E0]/60">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-[14px] bg-[#EAE8E0] flex items-center justify-center text-[#8A8880] shadow-inner">
                                <Briefcase className="w-5 h-5 opacity-70" strokeWidth={1.5} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[16px] font-medium text-[#4A4A4A]">Spanish Travel</span>
                                    <span className="text-xs opacity-60">🇪🇸</span>
                                </div>
                                <div className="text-[12px] text-[#9A9890]">59 sessions · 81 words</div>
                            </div>
                        </div>

                        <button className="bg-[#9CB071] text-white/95 px-6 py-2.5 rounded-[14px] text-[13px] font-semibold tracking-wide shadow-[0_2px_10px_-4px_rgba(156,176,113,0.4)] hover:bg-[#8A9C63] transition-colors">
                            Resume
                        </button>
                    </div>
                </div>

            </div>

            {/* 6. Footer (Bottom Nav) */}
            <nav className="fixed bottom-0 left-0 right-0 h-[80px] bg-[#FDFCF8]/95 backdrop-blur-md border-t border-[#EAE8E0]/60 flex items-start justify-between px-8 pt-4 z-50 text-[#9A9890]">
                <NavTab icon={Star} label="Home" active />
                <NavTab icon={Briefcase} label="Worlds" />
                <NavTab icon={BookOpen} label="Vocables" />
                <NavTab icon={User} label="Me" />
            </nav>
        </div>
    )
}

function NavTab({ icon: Icon, label, active }: any) {
    return (
        <button className={`flex flex-col items-center gap-1.5 transition-colors w-16 ${active ? 'text-[#7A8C53]' : 'text-[#A09E96] hover:text-[#7A7870]'}`}>
            <Icon size={22} strokeWidth={active ? 2 : 1.8} fill={active ? "currentColor" : "none"} className={active ? "opacity-20 translate-y-0.5" : ""} />
            <span className="text-[10px] font-medium tracking-wide">{label}</span>
            {active && <Icon size={22} strokeWidth={2} className="absolute text-[#7A8C53] translate-y-0.5" />}
        </button>
    )
}
