"use client"

import { useLayoutEffect, useRef } from "react"

type AutoFitTextProps = {
  text: string
  className?: string
  maxPx?: number
  minPx?: number
  lineHeight?: number
}

export default function AutoFitText({
  text,
  className = "",
  maxPx = 18,
  minPx = 8,
  lineHeight = 1.1,
}: AutoFitTextProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  const fit = () => {
    const el = ref.current
    if (!el) return
    if (el.clientWidth === 0 || el.clientHeight === 0) return

    let size = maxPx
    el.style.fontSize = `${size}px`
    el.style.lineHeight = `${lineHeight}`

    let guard = 0
    let overflowing = false
    while (
      (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) &&
      size > minPx &&
      guard < 60
    ) {
      size -= 1
      el.style.fontSize = `${size}px`
      guard += 1
    }
    overflowing =
      el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
    el.style.overflow = overflowing ? "auto" : "hidden"
    ;(el.style as any).webkitOverflowScrolling = "touch"
  }

  useLayoutEffect(() => {
    fit()
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => fit())
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, maxPx, minPx, lineHeight])

  return (
    <div ref={ref} className={`break-words whitespace-nowrap ${className}`}>
      {text}
    </div>
  )
}
