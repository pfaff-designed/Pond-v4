'use client'

/**
 * PondBlock (#237, 1/4) — the card every block on a page renders in, measured off
 * `PondBlock.dc.html` (inline `style` for geometry, computed styles for type):
 *
 *   block    width W · padding 16px 18px · radius 20 · gap 12 · card paper ·
 *            --mn-shadow-card · sans · full ink
 *   W        list 400 · checklist 400 · table 500 · gallery 580 · number 400 ·
 *            log 460 · properties 400
 *   head     flex · baseline · space-between · gap 12
 *   eyebrow  10.5 / 500 / .1em / uppercase / ink .68 — `pageEyebrowClass` (#220)
 *   headMeta mono 10.5 / ink .68
 *
 * This slice is the frame and the head only. The states (hover / selected /
 * disabled) are #238, the empty + loading states #239, the tombstone #240 — none
 * of them live here yet. The module view renders as `children`, untouched: the
 * card is chrome AROUND the engine, never a rewrite of it.
 */

import type { ReactNode } from 'react'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import type { PondBlockKind } from '@/lib/modules/block-frame'
import { cn } from '@/lib/utils'

export { POND_BLOCK_KINDS, POND_BLOCK_WIDTHS, type PondBlockKind } from '@/lib/modules/block-frame'

/**
 * Literal class strings per kind (Tailwind scans source for arbitrary values, so
 * these can't be built from the number). `POND_BLOCK_WIDTHS` is the one source;
 * the stories assert each computed width equals it.
 */
const WIDTH_CLASS: Record<PondBlockKind, string> = {
  list: 'w-[400px]',
  checklist: 'w-[400px]',
  table: 'w-[500px]',
  gallery: 'w-[580px]',
  number: 'w-[400px]',
  log: 'w-[460px]',
  properties: 'w-[400px]',
}

/** The board's `headMeta`: the mono note on the right of the head row. */
export const blockHeadNoteClass = 'font-mono text-[10.5px] text-mn-text-secondary'

export interface PondBlockProps {
  kind: PondBlockKind
  /** The eyebrow — sans uppercase, the block's name or kind. */
  heading: string
  /** The mono note — a count, a source, a status. Omit for the board's `number`. */
  headNote?: string
  children: ReactNode
  className?: string
}

export function PondBlock({ kind, heading, headNote = '', children, className }: PondBlockProps) {
  return (
    <div
      data-block-kind={kind}
      className={cn(
        // The column can be narrower than the kind (mobile, a dragged-in editor
        // width): clamp to it rather than overflow. Mobile's own 360 is a later slice.
        'relative flex max-w-full flex-col gap-mn-3 rounded-mn-card bg-mn-card px-[18px] py-mn-4 font-sans text-mn-text shadow-mn-card',
        WIDTH_CLASS[kind],
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-mn-3">
        <span className={pageEyebrowClass}>{heading}</span>
        <span className={blockHeadNoteClass}>{headNote}</span>
      </div>
      {children}
    </div>
  )
}
