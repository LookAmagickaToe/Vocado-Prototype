"use client"

import { useEffect, useState } from "react"
import uiSettings from "@/data/ui/settings.json"

const NEWS_STORAGE_KEY = "vocado-news-current"

type NewsPayload = {
  summary: string[]
  sourceUrl?: string
  title?: string
}

export default function NewsClient() {
  const [news, setNews] = useState<NewsPayload | null>(null)

  useEffect(() => {
    const raw = window.localStorage.getItem(NEWS_STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.summary && Array.isArray(parsed.summary)) {
        setNews(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  const title = uiSettings?.news?.summaryTitle ?? "Resumen"
  const sourceLabel = uiSettings?.news?.sourceLabel ?? "Fuente"

  if (!news) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-300">
        No hay un resumen de noticias disponible todavía.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-4">
      <div className="text-lg font-semibold">{news.title ?? title}</div>
      <div className="space-y-2 text-sm text-neutral-200">
        {news.summary.map((line, index) => (
          <div key={`${line}-${index}`} className="leading-relaxed">
            {line}
          </div>
        ))}
      </div>
      {news.sourceUrl && (
        <div className="pt-2 text-xs text-neutral-400">
          {sourceLabel}: {news.sourceUrl}
        </div>
      )}
    </div>
  )
}
