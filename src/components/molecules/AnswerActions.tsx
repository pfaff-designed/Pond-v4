/**
 * AnswerActions (#97, `Pond 06.01` 6a frames 2–3) — the row under the latest
 * answer: **make this a page** and **ask again** as quiet mono chips, with a
 * stop control at the right while the answer is still streaming. The window
 * controls live on the composer card, not in this row.
 *
 * There is no keep-as-note chip and no keep-in-thread chip (AUDIT § Decided
 * W4): the thread already keeps every answer, and a page is the only destination.
 *
 * Values read inline from the mockup's actions row and PondComposer's `chip`:
 * mono 11px, tracking .02em; chips 6px 11px, pill, ink .07 fill, ink .8 text;
 * the stop control a 24px round, ink .8, with the hand-drawn square (functional
 * marks are inline SVG at stroke 1.4 — PROJECT_RULES § Icons).
 */

import { chipBaseClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'

export interface AnswerActionsProps {
  /** True while the answer is still arriving — shows stop, hides the chips. */
  streaming: boolean
  onMakePage: () => void
  /** Omitted when the answer is not the thread's last message: regenerate() acts on that one. */
  onAskAgain?: () => void
  onStop: () => void
  /** Hide "make this a page" (e.g. a card for this answer is already open). */
  canMakePage?: boolean
  className?: string
}

const chipClass = cn(chipBaseClass, 'py-1.5 text-mn-text-meta hover:text-foreground')

export function AnswerActions({
  streaming,
  onMakePage,
  onAskAgain,
  onStop,
  canMakePage = true,
  className,
}: AnswerActionsProps) {
  return (
    <div
      data-part="answer-actions"
      className={cn(
        'flex items-center gap-[7px] font-mono text-[11px] lowercase tracking-[0.02em]',
        className
      )}
    >
      {!streaming && canMakePage && (
        <button type="button" className={chipClass} onClick={onMakePage}>
          make this a page
        </button>
      )}
      {!streaming && onAskAgain && (
        <button type="button" className={chipClass} onClick={onAskAgain}>
          ask again
        </button>
      )}
      {streaming && (
        <button
          type="button"
          aria-label="stop"
          title="stop — keeps what has arrived (esc)"
          onClick={onStop}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-mn-pill text-mn-text-meta transition-colors hover:bg-mn-text/[0.07] hover:text-foreground"
        >
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
            <rect x="1.5" y="1.5" width="7" height="7" rx="1.2" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  )
}
