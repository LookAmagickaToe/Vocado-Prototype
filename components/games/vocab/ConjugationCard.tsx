"use client"

import type { Conjugation } from "@/types/worlds"
import { motion } from "framer-motion"

export default function ConjugationCard({ conjugation }: { conjugation: Conjugation }) {
  // Logic simplified: All cards now share the same consistent layout.

  return (
    <div className="w-full max-w-[400px] mx-auto space-y-8 pb-8">
      {/* Main Header Information */}
      <div className="text-center space-y-1">
        <h2 className="text-3xl font-bold text-[#3A3A3A] tracking-tight">
          {conjugation.infinitive || "Conjugation"}
        </h2>
        {conjugation.translation && (
          <p className="text-[#3A3A3A]/60 font-medium text-[15px]">
            {conjugation.translation}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {conjugation.sections?.map((sec, secIdx) => {
          return (
            <motion.div
              key={sec.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: secIdx * 0.1 }}
              className="bg-white rounded-2xl shadow-[0_4px_20px_-8px_rgba(0,0,0,0.08)] border border-[#3A3A3A]/5 overflow-hidden"
            >
              {/* Card Header */}
              <div className="px-6 pt-5 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[14px] font-bold text-[#3A3A3A] uppercase tracking-wide">
                    {sec.title}
                  </h3>
                  {/* Accent Line */}
                  <div className="h-px bg-[rgb(var(--vocado-accent-rgb))] flex-1 opacity-30 mt-0.5"></div>
                </div>
              </div>

              {/* Rows */}
              <div className="px-6 pb-6 pt-1 space-y-1">
                {sec.rows?.map((row, idx) => {
                  // Standard 2-Column Layout for ALL tenses
                  return (
                    <div
                      key={idx}
                      className="flex items-center py-3 group hover:bg-[#FAF7F2]/50 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      {/* Fixed Gutter / Pronoun Column */}
                      <div className="w-20 shrink-0 text-[13px] text-[#6B7280] font-medium">
                        {row[0]}
                      </div>

                      {/* Verb Column */}
                      <div className="flex-1 text-[15px] font-bold text-[#3A3A3A] group-hover:text-[rgb(var(--vocado-accent-rgb))] transition-colors">
                        {row[1]}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
