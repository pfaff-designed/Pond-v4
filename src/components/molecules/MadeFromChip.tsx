'use client'

/**
 * MadeFromChip (#97, `Pond 06.01` 6a frame 5) — the provenance row on a page
 * made from a streamed answer: the "made from" eyebrow and a mono chip reading
 * "tuesday 07:12 — “the question”" that links back to the moment in the thread.
 * **It can be hidden, not removed**: the only control is hide / show; the stamp
 * stays on the page either way.
 *
 * Values read inline from the frame: eyebrow 500 · 10.5px · .1em · uppercase ·
 * ink .68 in the SANS — it lives on the page, not in the composer (PROJECT_RULES
 * § two registers, split by medium); chip 5px 11px, pill, ink .07 fill, mono 11px .02em, full ink.
 */

import { chipBaseClass, pageEyebrowClass } from '@/components/atoms/kicker'
import { madeFromLabel } from '@/lib/conversation/page-proposals'
import type { MadeFromThread } from '@/lib/pages/made-from'
import { cn } from '@/lib/utils'

export interface MadeFromChipProps {
  stamp: MadeFromThread
  /** Open the thread at the message the page came from. */
  onOpen: () => void
  /** Toggle the hidden flag — never a removal. */
  onToggleHidden: (hidden: boolean) => void
  className?: string
}

export function MadeFromChip({ stamp, onOpen, onToggleHidden, className }: MadeFromChipProps) {
  const label = madeFromLabel(stamp.askedAt, stamp.question)

  if (stamp.hidden) {
    return (
      <div data-part="made-from" data-hidden="true" className={cn('flex items-center', className)}>
        <button
          type="button"
          onClick={() => onToggleHidden(false)}
          className="font-mono text-[10.5px] lowercase tracking-[0.02em] text-mn-text-secondary transition-colors hover:text-mn-text"
        >
          made from · show
        </button>
      </div>
    )
  }

  return (
    <div data-part="made-from" className={cn('flex flex-wrap items-center gap-2.5', className)}>
      <span className={pageEyebrowClass}>made from</span>
      <button
        type="button"
        onClick={onOpen}
        title="open the thread at this moment"
        className={cn(
          chipBaseClass,
          'flex items-center gap-[7px] py-[5px] font-mono text-[11px] lowercase tracking-[0.02em] text-foreground'
        )}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => onToggleHidden(true)}
        className="font-mono text-[10.5px] lowercase tracking-[0.02em] text-mn-text-secondary transition-colors hover:text-mn-text"
      >
        hide
      </button>
    </div>
  )
}
