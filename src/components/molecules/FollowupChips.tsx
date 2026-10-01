'use client'

/**
 * FollowupChips (ticket-39 §3) — the quiet row of clickable follow-up chips
 * beneath a Pond reply, and the SHARED chip renderer for a question card's option
 * chips (spec: "Question-card options reuse the same chip molecule").
 *
 * Each chip is a short phrase; clicking it sends that text as the user's next
 * message. Deliberately calm — Press hairline pills in the muted kicker voice,
 * not shouting buttons. Purely presentational: the terminal owns "what happens on
 * click" (send the text) and passes it in; this molecule only lays the chips out.
 *
 * w2-design-brief aesthetics: warm paper, hairline rules (mn-line), sage
 * accent on hover, one calm authored moment (mn-rise on arrive), reduced-motion
 * guarded by the shared utility.
 */

import { cn } from '@/lib/utils'

export interface FollowupChipsProps {
  /** The chip labels; each is also the exact text sent on click. */
  chips: string[]
  /** Raised with the clicked chip's text. */
  onPick: (chip: string) => void
  /** A quiet leading kicker ("Next" for suggestions, omitted for options). */
  label?: string
  className?: string
  /** Disable every chip (e.g. while a message is streaming). */
  disabled?: boolean
}

export function FollowupChips({
  chips,
  onPick,
  label,
  className,
  disabled = false,
}: FollowupChipsProps) {
  if (chips.length === 0) return null
  return (
    <div
      role="group"
      aria-label={label ?? 'Follow-up suggestions'}
      className={cn('mn-rise flex flex-wrap items-center gap-2', className)}
    >
      {label && (
        <span className="font-sans text-[0.65rem] font-medium uppercase tracking-wide text-mn-text-secondary">
          {label}
        </span>
      )}
      {chips.map((chip, i) => (
        <button
          key={`${i}-${chip}`}
          type="button"
          disabled={disabled}
          onClick={() => onPick(chip)}
          className={cn(
            // Machine surface (composer follow-ups + question-card options): mono,
            // lowercase, tight tracking — a hairline pill, paper-not-frames.
            'rounded-mn-pill border border-mn-line bg-transparent px-3 py-1 font-mono lowercase text-[0.72rem] leading-none text-mn-text-meta',
            'transition-colors hover:border-mn-text hover:text-mn-text',
            'focus:outline-none focus-visible:border-mn-text focus-visible:ring-1 focus-visible:ring-mn-text',
            'disabled:opacity-40 disabled:hover:border-mn-line disabled:hover:text-mn-text-meta'
          )}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}
