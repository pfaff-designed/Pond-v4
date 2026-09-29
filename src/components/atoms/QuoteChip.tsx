'use client'

/**
 * Removable quote chip that shows a text excerpt above the composer input.
 * Used by highlight-to-ask (ticket-40 F20) to show the quoted selection
 * before the message is sent. Press language: a quiet pull-quote in the
 * composer threshold, matching the user message's aside style in the transcript.
 */

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
    <div
      className={cn(
        'flex items-start gap-2 border-l-2 border-press-accent/40 bg-press-accent-wash',
        'pl-3 pr-2 py-1.5 rounded-r-mn-row text-xs font-serif font-extralight italic text-press-muted',
        className
      )}
    >
      <span className="flex-1 leading-snug">{display}</span>
      <button
        type="button"
        aria-label="Remove quoted context"
        onClick={onRemove}
        className="flex-shrink-0 text-press-faint hover:text-press-body transition-colors mt-0.5"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
