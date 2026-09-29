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
 * w2-design-brief aesthetics: warm paper, hairline rules (press-line), sage
 * accent on hover, one calm authored moment (press-rise on arrive), reduced-motion
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
      className={cn('press-rise flex flex-wrap items-center gap-2', className)}
    >
      {label && (
        <span className="font-sans text-[0.65rem] font-medium uppercase tracking-[0.06em] text-press-faint">
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
            'rounded-mn-pill border border-press-line bg-transparent px-3 py-1 font-mono lowercase tracking-[0.1em] text-[0.72rem] leading-none text-press-body',
            'transition-colors hover:border-press-accent hover:text-press-ink',
            'focus:outline-none focus-visible:border-press-accent focus-visible:ring-1 focus-visible:ring-press-accent',
            'disabled:opacity-40 disabled:hover:border-press-line disabled:hover:text-press-body'
          )}
        >
          {chip}
        </button>
      ))}
    </div>
  )
}
