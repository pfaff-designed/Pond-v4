/**
 * The composer line's backdrop (`PondComposer.dc.html`'s `mention`, KAN-99):
 * mirrors the textarea's text behind it so each `@<title>` run that matches a
 * live whole-page reference paints the pill (padding 1px 6px, radius 6,
 * background ink .07) in the same spot the real, plain text sits on top of
 * it. This layer's own text is never shown — only the pill background is.
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { mentionPillRuns } from '@/lib/references/mention-pill'

export interface MentionPillOverlayProps {
  value: string
  /** Titles of the live whole-page references (KAN-99's `@`-picker). */
  titles: readonly string[]
  /** The textarea this overlay sits behind — its scroll position drives the overlay's own. */
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

/** Mirrors `ComposerLine.tsx`'s textarea sizing/typography exactly, so the pill lands under the real text. */
const MIRROR =
  'pointer-events-none absolute inset-0 -z-10 block overflow-hidden px-1.5 py-0.5 font-mono text-[16px] leading-[1.5] tracking-[0.02em] whitespace-pre-wrap break-words text-transparent [scrollbar-gutter:stable] md:text-[14px]'

export function MentionPillOverlay({ value, titles, textareaRef }: MentionPillOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // The textarea scrolls past six lines (`max-h-[calc(6*1.5em_+_4px)]`); the
  // overlay has no scrollbar of its own, so its scrollTop has to be driven
  // from the textarea's rather than left to track it on its own.
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current
    if (!textarea || !overlay) return
    const syncScroll = () => {
      overlay.scrollTop = textarea.scrollTop
    }
    syncScroll()
    textarea.addEventListener('scroll', syncScroll)
    return () => textarea.removeEventListener('scroll', syncScroll)
  }, [textareaRef, value])

  const runs = mentionPillRuns(value, titles)
  if (runs.length === 0) return null

  const segments: { text: string; pill: boolean }[] = []
  let cursor = 0
  for (const run of runs) {
    if (run.start > cursor) segments.push({ text: value.slice(cursor, run.start), pill: false })
    segments.push({ text: value.slice(run.start, run.end), pill: true })
    cursor = run.end
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), pill: false })

  return (
    <div ref={overlayRef} aria-hidden className={MIRROR}>
      {segments.map((seg, i) =>
        seg.pill ? (
          // The pill's own text metrics must match the textarea's run exactly
          // (no padding/margin on this span), or the two drift and the
          // backdrop stops landing under the real text. The 1px/6px pill box
          // is instead painted by a `::before` sized past this span's edges.
          <span
            key={i}
            data-part="mention-pill"
            className="relative before:absolute before:-top-[1px] before:-bottom-[1px] before:-left-[6px] before:-right-[6px] before:rounded-[6px] before:bg-mn-text/[0.07] before:content-['']"
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  )
}
