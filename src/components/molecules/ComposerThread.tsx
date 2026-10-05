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

import type { ReactNode } from 'react'
import { Caret } from '@/components/atoms/Caret'
import { cn } from '@/lib/utils'

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
    <button
      type="button"
      onClick={onClose}
      aria-label="Close composer"
      className="flex size-8 cursor-pointer items-center justify-center hover:text-mn-text md:size-[18px]"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    </button>
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
    <Caret className="-rotate-90" />
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

/** The question (`youRow`): `you` · the line · when it was said, 13px at ink .8, the
 *  words themselves in full ink. The chrome is lowercase; the person's words keep
 *  their own case. */
export const YouRow = ({ text, time }: YouRowProps) => (
  <div
    data-part="you-row"
    className="flex items-baseline gap-2 font-mono text-[13px] tracking-[0.02em] text-mn-text-meta"
  >
    <span className="font-medium lowercase">you</span>
    <span className="min-w-0 flex-1 text-mn-text break-words whitespace-pre-wrap">{text}</span>
    {time && <span className="text-[10.5px]">{time}</span>}
  </div>
)
