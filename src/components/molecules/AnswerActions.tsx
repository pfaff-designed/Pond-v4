/**
 * AnswerActions (#97, `Pond 06.01` 6a frames 2–3) — the row under the latest
 * answer: **make this a page** and **ask again** as quiet mono chips, with a
 * stop control at the right while the answer is still streaming, and a close ×
 * at the far end in every state (PondComposer DC chips-row `close: true`).
 *
 * There is no keep-as-note chip and no keep-in-thread chip (AUDIT § Decided
 * W4): the thread already keeps every answer, and a page is the only destination.
 *
 * Values read inline from the mockup's actions row and PondComposer's `chip`:
 * mono 11px, tracking .02em; chips 6px 11px, pill, ink .07 fill, ink .8 text;
 * the stop control a 24px round, ink .8, with the hand-drawn square (functional
 * marks are inline SVG at stroke 1.4 — PROJECT_RULES § Icons).
 *
 * The close × only belongs here when there's no `ThreadHead` to draw it: a
 * multi-turn thread's head already carries the one close mark, so `onClose`
 * is omitted there (KAN-318).
 */

import { chipBaseClass } from '@/components/atoms/kicker'
import { ComposerWindowControls } from '@/components/molecules/ComposerWindowControls'
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
  /** Draws the window controls. Omitted when a `ThreadHead` above this row
   *  already draws them (turns > 1). */
  onClose?: () => void
  /** Fills the canvas, or restores — paired with `onClose` (KAN-323). Required
   *  alongside `onClose` so there is nothing for a stub fallback to cover. */
  maximized?: boolean
  onMaximize: () => void
  onMinimize: () => void
  className?: string
}

const chipClass = cn(chipBaseClass, 'py-1.5 text-mn-text-meta hover:text-foreground')

export function AnswerActions({
  streaming,
  onMakePage,
  onAskAgain,
  onStop,
  canMakePage = true,
  onClose,
  maximized = false,
  onMaximize,
  onMinimize,
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
      {onClose && (
        <>
          <div className="flex-1" />
          <ComposerWindowControls
            maximized={maximized}
            onMinimize={onMinimize}
            onMaximize={onMaximize}
            onClose={onClose}
          />
        </>
      )}
    </div>
  )
}
