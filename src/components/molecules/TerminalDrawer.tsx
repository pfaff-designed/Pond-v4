'use client'

/**
 * The PondComposer card (`PondComposer.dc.html` `glass`, board 2f): one
 * floating sheet of glass — 560 wide (360 below md), padding 14, gap 14, radius
 * 20 — holding the thread, then the line and toolbar. It is as tall as its
 * content and grows UPWARD from a fixed 24px inset; the page scrolls behind it.
 * While there is a thread, `ComposerHandle` on its top edge lets the person fix
 * the card's height instead — the thread then scrolls inside it, and the card
 * never rises past the ⌘K pill (`COMPOSER_MAX_HEIGHT_CSS`).
 *
 * Placement is the storyboards' `left:246px; right:20px; bottom:24px` (rail
 * 20+206+20): centred on the area right of the rail, i.e. `calc(50% + 113px)` of
 * the shell. Below md the rail is not beside it, so the card centres on the shell.
 *
 * The card publishes its real footprint on the shell (`COMPOSER_CLEARANCE_VAR`,
 * lib/layout/composer-clearance) and the page surfaces pad against it.
 *
 * Collapsed, the card becomes the tab (`PondComposer` `collapsed`/`landed`): 30px of
 * the same glass on the shell's bottom edge, a pill riding its top edge with the
 * chevron, and `⌘J` below it. When an answer arrived while it was closed the pill
 * also says `pond answered`, in a 6px dot and words — never a ping, badge or count.
 */

import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { ComposerHandle } from '@/components/molecules/ComposerHandle'
import {
  COMPOSER_CLEARANCE_VAR,
  COMPOSER_TAB_INSET,
  composerFootprintPx,
} from '@/lib/layout/composer-clearance'
import { COMPOSER_MAX_HEIGHT_CSS } from '@/lib/layout/composer-height'
import { cn } from '@/lib/utils'

export interface TerminalDrawerProps {
  collapsed: boolean
  /** An answer arrived while the composer was closed — the tab says so. */
  landed?: boolean
  onExpand: () => void
  /** The thread — turns, proposal cards, the running answer. Empty at rest. */
  children: ReactNode
  /** Attachments, the line and the toolbar. */
  footer: ReactNode
  /** The user-set card height (`useComposerHeight`), or null for content height. */
  height?: number | null
  /** Live height during a handle drag. Without it the card draws no handle. */
  onHeightChange?: (height: number) => void
  /** A finished resize gesture; `null` returns the card to content height. */
  onHeightCommit?: (height: number | null) => void
}

const PLACEMENT =
  'absolute left-1/2 z-30 w-[360px] max-w-full -translate-x-1/2 md:left-[calc(50%_+_113px)] md:w-[560px]'
const CARD_PLACEMENT = cn(PLACEMENT, 'bottom-6')
const TAB_PLACEMENT = cn(PLACEMENT, 'bottom-0')

/** The tab and its pill throw their shadow UP, off the bottom edge — the glass role
 *  reassigned for them alone, so the paper and ink values both come through `mn-glass`. */
const TAB_SHADOW =
  '[--mn-glass-shadow:inset_0_1px_0_rgba(255,255,255,0.7),0_-8px_28px_rgba(40,34,24,0.12)] dark:[--mn-glass-shadow:inset_0_1px_0_rgba(250,249,239,0.06),0_-8px_28px_rgba(0,0,0,0.3)]'

export const TerminalDrawer = ({
  collapsed,
  landed = false,
  onExpand,
  children,
  footer,
  height = null,
  onHeightChange,
  onHeightCommit,
}: TerminalDrawerProps) => {
  const cardRef = useRef<HTMLElement>(null)

  // Publish the card's real footprint on the shell so the page surfaces pad
  // against it as the thread grows. Layout effect: the padding lands in the same
  // frame as the card. Outside a shell (Storybook) there is nothing to publish to.
  useLayoutEffect(() => {
    const card = cardRef.current
    const shell = card?.closest<HTMLElement>('[data-part="shell"]')
    if (!card || !shell) return
    const publish = () =>
      shell.style.setProperty(
        COMPOSER_CLEARANCE_VAR,
        `${composerFootprintPx(card.offsetHeight, collapsed ? COMPOSER_TAB_INSET : undefined)}px`
      )
    publish()
    // jsdom has no ResizeObserver; the first publish is all a unit test needs.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(card)
    return () => {
      observer?.disconnect()
      shell.style.removeProperty(COMPOSER_CLEARANCE_VAR)
    }
  }, [collapsed])

  if (collapsed) {
    return (
      <section
        ref={cardRef}
        aria-label="composer"
        data-part="composer-card"
        data-state={landed ? 'landed' : 'collapsed'}
        className={cn(
          TAB_PLACEMENT,
          TAB_SHADOW,
          'mn-glass box-border flex h-[30px] justify-center rounded-[14px_16px_0_0] border-b-0 font-mono text-mn-text'
        )}
      >
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-keyshortcuts="Meta+J Control+J"
          aria-label={landed ? 'Open composer — pond answered' : 'Open composer'}
          className="relative flex size-full cursor-pointer justify-center"
        >
          <span
            data-part="tab-pill"
            className={cn(
              TAB_SHADOW,
              'mn-glass absolute left-1/2 top-[-13px] flex h-[26px] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full px-[14px] text-[11px]'
            )}
          >
            {landed && (
              <>
                <span
                  data-part="landed-dot"
                  aria-hidden
                  className="size-[6px] rounded-full bg-mn-text"
                />
                <span>pond answered</span>
              </>
            )}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2 6.5 5 3.5l3 3" />
            </svg>
          </span>
          <span
            data-part="tab-key"
            aria-hidden
            className="mt-3 text-[10.5px] text-mn-text-secondary"
          >
            ⌘J
          </span>
        </button>
      </section>
    )
  }

  // At rest there is nothing to resize, and a stored height would leave an empty slab.
  const hasThread = Boolean(children)
  const sized = hasThread && height !== null

  return (
    <section
      ref={cardRef}
      aria-label="composer"
      data-part="composer-card"
      data-sized={sized || undefined}
      style={sized ? { height, maxHeight: COMPOSER_MAX_HEIGHT_CSS } : undefined}
      className={`${CARD_PLACEMENT} group/composer mn-glass box-border flex flex-col gap-[14px] rounded-mn-card p-[14px] font-mono text-mn-text`}
    >
      {hasThread && onHeightChange && onHeightCommit && (
        <ComposerHandle
          cardRef={cardRef}
          height={height}
          onHeightChange={onHeightChange}
          onHeightCommit={onHeightCommit}
        />
      )}
      {children}
      {footer}
    </section>
  )
}
