"use client"

import type { Conjugation } from "@/types/worlds"

export default function ConjugationCard({ conjugation }: { conjugation: Conjugation }) {
  return (
    // ✅ more spacing between the tables (sections)
    <div className="space-y-6">
      {(conjugation.infinitive || conjugation.translation) && (
        <div className="text-xs text-neutral-300">
          {conjugation.infinitive && (
            <>
              <span className="text-neutral-400">Infinitivo:</span>{" "}
              <span className="font-semibold text-neutral-100">
                {conjugation.infinitive}
              </span>
            </>
          )}
        </div>
      )}

      {conjugation.sections?.map((sec) => (
        <div
          key={sec.title}
          // ✅ colored outline + a bit more contrast
          className="rounded-xl border border-green-500/25 bg-neutral-950/30 shadow-sm"

          //className="rounded-xl border border-sky-500/25 bg-neutral-950/30 shadow-sm"
        >
          <div className="px-3 py-2 text-xs font-semibold text-neutral-100 border-b border-sky-500/15">
            {sec.title}
          </div>

          <div className="divide-y divide-neutral-800">
            {sec.rows?.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-3 px-4 py-2.5 text-xs">
                <div className="text-neutral-200">{row[0]}</div>
                <div className="text-neutral-50 font-semibold">{row[1]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
