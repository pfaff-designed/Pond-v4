/**
 * The composer line's backdrop (`PondComposer.dc.html`'s `mention`, KAN-99):
 * mirrors the textarea's text behind it so each `@<title>` run that matches a
 * live whole-page reference paints the pill (padding 1px 6px, radius 6,
 * background ink .07) in the same spot the real, plain text sits on top of
 * it. This layer's own text is never shown — only the pill background is.
 */

import { mentionPillRuns } from '@/lib/references/mention-pill'

export interface MentionPillOverlayProps {
  value: string
  /** Titles of the live whole-page references (KAN-99's `@`-picker). */
  titles: readonly string[]
}

/** Mirrors `ComposerLine.tsx`'s textarea sizing/typography exactly, so the pill lands under the real text. */
const MIRROR =
  'pointer-events-none absolute inset-0 -z-10 block overflow-hidden px-1.5 py-0.5 font-mono text-[16px] leading-[1.5] tracking-[0.02em] whitespace-pre-wrap break-words text-transparent md:text-[14px]'

export function MentionPillOverlay({ value, titles }: MentionPillOverlayProps) {
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
    <div aria-hidden className={MIRROR}>
      {segments.map((seg, i) =>
        seg.pill ? (
          <span
            key={i}
            data-part="mention-pill"
            className="rounded-[6px] bg-mn-text/[0.07] px-[6px] py-[1px]"
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
