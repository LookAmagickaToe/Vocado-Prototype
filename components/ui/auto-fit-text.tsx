"use client"

import { useLayoutEffect, useRef } from "react"

type AutoFitTextProps = {
  text: string
  className?: string
  maxPx?: number
  minPx?: number
  lineHeight?: number
  /** Fraction of the parent's height this text may occupy (e.g. 0.35 for a subtitle). */
  heightRatio?: number
  /**
   * Allow the browser to wrap long text instead of only breaking at explicit
   * newlines. Off by default so existing single-line call sites keep their
   * shrink-to-fit behaviour.
   */
  wrap?: boolean
}

export default function AutoFitText({
  text,
  className = "",
  maxPx = 18,
  minPx = 8,
  lineHeight = 1.1,
  heightRatio = 1,
  wrap = false,
}: AutoFitTextProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  const fit = () => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return

    // Measure against the parent's content box rather than the element's own.
    // The element is height-auto, so its scrollHeight can never exceed its
    // clientHeight and the height check used to be dead — only the width ever
    // constrained anything, which is why long text shrank instead of wrapping.
    const style = getComputedStyle(parent)
    const availWidth =
      parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const availHeight =
      (parent.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) *
      heightRatio

    if (availWidth <= 0 || availHeight <= 0) return

    // Bounding the width is what makes wrapping (and the overflow check) meaningful.
    el.style.maxWidth = `${availWidth}px`
    el.style.lineHeight = `${lineHeight}`

    let size = maxPx
    el.style.fontSize = `${size}px`

    let guard = 0
    while (
      (el.scrollHeight > availHeight + 1 || el.scrollWidth > availWidth + 1) &&
      size > minPx &&
      guard < 60
    ) {
      size -= 1
      el.style.fontSize = `${size}px`
      guard += 1
    }

    const overflowing =
      el.scrollHeight > availHeight + 1 || el.scrollWidth > availWidth + 1
    el.style.overflow = overflowing ? "auto" : "hidden"
      ; (el.style as any).webkitOverflowScrolling = "touch"
  }

  useLayoutEffect(() => {
    fit()
    const el = ref.current
    const parent = el?.parentElement
    if (!parent || typeof ResizeObserver === "undefined") return
    // Observe the parent, not the element: the element resizes as a *result* of
    // fitting, which would retrigger the observer on every pass.
    const observer = new ResizeObserver(() => fit())
    observer.observe(parent)
    return () => observer.disconnect()
  }, [text, maxPx, minPx, lineHeight, heightRatio, wrap])

  return (
    <div
      ref={ref}
      // Set via inline style rather than a utility class so a `whitespace-*` class
      // passed in `className` cannot win on stylesheet order.
      // No `overflow-wrap: break-word` on purpose: it splits words without a
      // hyphen ("Gebärm/utter"). formatCardText already hyphenates anything too
      // long, so wrapping here only ever happens at spaces and explicit breaks.
      style={wrap ? { whiteSpace: "pre-wrap" } : { whiteSpace: "pre" }}
      className={className}
    >
      {text}
    </div>
  )
}
