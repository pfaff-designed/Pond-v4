'use client'

/**
 * The composer thread's frame (`PondComposer.dc.html` `thread`, board 2f): the head
 * that names the thread, the fold that keeps the long ones short, and the turn that
 * holds a question with everything that came of it. Presentational — the composer
 * owns the messages, and what a turn contains is its children.
 *
 * Machine surface: PP Neue Montreal Mono, lowercase, 11px. Every rule is ink at
 * .09 in both themes (`a(.09)` in the DC), so it reads off `mn-text` rather than
 * `--mn-line`, which dark lifts to .12.
 */

import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { ComposerCloseButton } from '@/components/molecules/ComposerCloseButton'

const RULE_CLASS = 'border-b border-mn-text/[0.09]'

export interface ThreadHeadProps {
  /** The area the thread was started in. */
  area: string
  turns: number
  /** Start over: clears the thread. */
  onNewThread: () => void
  /** Close the composer to its tab. */
  onClose: () => void
}

export const ThreadHead = ({ area, turns, onNewThread, onClose }: ThreadHeadProps) => (
  <div
    data-part="thread-head"
    className={cn(
      RULE_CLASS,
      'flex items-center gap-2 px-[6px] pb-[10px] text-[11px] text-mn-text-meta'
    )}
  >
    <span data-part="thread-area" className="min-w-0 truncate text-mn-text">
      thread · {area}
    </span>
    <span className="whitespace-nowrap text-mn-text-secondary">
      {turns} {turns === 1 ? 'turn' : 'turns'}
    </span>
    <div className="flex-1" />
    <button type="button" onClick={onNewThread} className="cursor-pointer hover:text-mn-text">
      new thread
    </button>
    <ComposerCloseButton onClick={onClose} />
  </div>
)

export interface EarlierTurnsProps {
  count: number
  onExpand: () => void
}

export const EarlierTurns = ({ count, onExpand }: EarlierTurnsProps) => (
  <button
    type="button"
    data-part="earlier-turns"
    onClick={onExpand}
    className="flex cursor-pointer items-center gap-[6px] px-[6px] text-left text-[11px] text-mn-text-secondary hover:text-mn-text"
  >
    <svg
      width="9"
      height="9"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="-rotate-90"
    >
      <path d="M3.5 2 7 5 3.5 8" />
    </svg>
    {count} earlier {count === 1 ? 'turn' : 'turns'}
  </button>
)

export interface TurnProps {
  children: ReactNode
}

export const Turn = ({ children }: TurnProps) => (
  <div
    data-part="turn"
    className={cn(RULE_CLASS, 'flex flex-col gap-3 px-[6px] pt-[6px] pb-[14px]')}
  >
    {children}
  </div>
)

export interface YouRowProps {
  text: string
  /** When it was said, already formatted — absent for a re-seeded line. */
  time?: string | null
}

/** The question, built like the answer under it: the `you` eyebrow (the same one as
 *  `pond`) with when it was said, then the line — mono 13px, the person's words in
 *  full ink and their own case. Departs from the board's one-line `youRow` at the
 *  user's call (2026-10-10). */
export const YouRow = ({ text, time }: YouRowProps) => (
  <div data-part="you-row" className="flex flex-col gap-[7px]">
    <div className="flex items-baseline gap-2">
      <span className={pageEyebrowClass}>you</span>
      {time && (
        <span className="font-mono text-[10.5px] tracking-[0.02em] text-mn-text-meta">{time}</span>
      )}
    </div>
    <p className="font-mono text-[13px] tracking-[0.02em] break-words whitespace-pre-wrap text-mn-text">
      {text}
    </p>
  </div>
)

export interface EarlierAnswerFoldProps {
  /** When the earlier answer was given, already formatted — absent for a re-seeded one. */
  time?: string | null
  /** The earlier answer as it was shown: its text and its own read chips. */
  children: ReactNode
}

/** An answer that `ask again` replaced, kept under the current one: a quiet meta line
 *  (the `YouRow` time's register) that opens the old answer in place. The board draws
 *  no fold, so it takes no card and no colour of its own. */
export const EarlierAnswerFold = ({ time, children }: EarlierAnswerFoldProps) => {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const handleToggle = () => setOpen((wasOpen) => !wasOpen)
  return (
    <div data-part="earlier-answer-fold" className="flex flex-col gap-[7px]">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        className="w-fit cursor-pointer text-left font-mono text-[10.5px] tracking-[0.02em] text-mn-text-secondary hover:text-mn-text"
      >
        earlier answer{time ? ` · ${time}` : ''}
      </button>
      {open && (
        <div id={bodyId} data-part="earlier-answer" className="flex flex-col gap-[7px]">
          {children}
        </div>
      )}
    </div>
  )
}

export interface AnswerErrorProps {
  /** Sends the question again — absent when there is no question to resend. */
  onAskAgain?: () => void
  /** Collapses the composer to its ⌘J tab. Omitted when a `ThreadHead` above
   *  this row already draws the close mark (turns > 1). */
  onClose?: () => void
}

/** `error` (`errRow`): the answer failed and the partial text was dropped, so the row
 *  says nothing was kept. 12px at ink .8, gap 10, `ask again` as the quiet chip, with
 *  the same far-end close × as `AnswerActions` when there's no `ThreadHead` for it. */
export const AnswerError = ({ onAskAgain, onClose }: AnswerErrorProps) => (
  <div
    role="alert"
    data-part="error-row"
    className="flex flex-wrap items-center gap-2.5 font-mono text-[12px] lowercase tracking-[0.02em] text-mn-text-meta"
  >
    <span>pond couldn’t finish this answer. nothing was kept.</span>
    {onAskAgain && (
      <button
        type="button"
        onClick={onAskAgain}
        className="rounded-mn-pill bg-mn-text/[0.07] px-[11px] py-1.5 text-[11px] text-mn-text-meta transition-colors hover:text-foreground"
      >
        ask again
      </button>
    )}
    {onClose && (
      <>
        <div className="flex-1" />
        <ComposerCloseButton onClick={onClose} />
      </>
    )}
  </div>
)
