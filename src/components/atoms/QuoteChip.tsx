'use client'

/**
 * Removable quote chip that shows a text excerpt above the composer input.
 * Used by highlight-to-ask (ticket-40 F20) to show the quoted selection
 * before the message is sent. The excerpt renders through
 * `<PondAtom kind="quote">` (#93) — the Make Noise quote register (Editorial
 * 200 italic) — while this wrapper owns only the × removal affordance.
 */

import { PondAtom } from '@/components/atoms/PondAtom'
import { cn } from '@/lib/utils'

export interface QuoteChipProps {
  text: string
  onRemove: () => void
  className?: string
}

export function QuoteChip({ text, onRemove, className }: QuoteChipProps) {
  const MAX_DISPLAY = 120
  const display = text.length > MAX_DISPLAY ? text.slice(0, MAX_DISPLAY) + '…' : text

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <PondAtom kind="quote" value={display} className="min-w-0 flex-1" />
      <button
        type="button"
        aria-label="Remove quoted context"
        onClick={onRemove}
        className="flex-shrink-0 text-mn-text/30 transition-colors hover:text-mn-text-meta"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
