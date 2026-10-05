'use client'

/**
 * The PondComposer card (`PondComposer.dc.html` `glass`, board 2f; ADR 0011): one
 * floating sheet of glass — 560 wide (360 below md), padding 14, gap 14, radius
 * 20 — holding the thread, then the line and toolbar. It is as tall as its
 * content and grows UPWARD from a fixed 24px inset, so nothing is resized by
 * hand: a longer thread simply makes a taller card, and the page scrolls behind
 * it.
 *
 * Placement is the storyboards' `left:246px; right:20px; bottom:24px` (rail
 * 20+206+20): centred on the area right of the rail, i.e. `calc(50% + 113px)` of
 * the shell. Below md the rail is not beside it, so the card centres on the shell.
 *
 * The card publishes its real footprint on the shell (`COMPOSER_CLEARANCE_VAR`,
 * lib/layout/composer-clearance) and the page surfaces pad against it.
 *
 * Collapse is held at its minimum: a bare tab that brings the card back. The
 * collapsed tab is KAN-62's to draw.
 */

import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { COMPOSER_CLEARANCE_VAR, composerFootprintPx } from '@/lib/layout/composer-clearance'

export interface TerminalDrawerProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** The thread — turns, proposal cards, the running answer. Empty at rest. */
  children: ReactNode
  /** Attachments, the line and the toolbar. */
  footer: ReactNode
}

const CARD_PLACEMENT =
  'absolute bottom-6 left-1/2 z-30 w-[360px] max-w-full -translate-x-1/2 md:left-[calc(50%_+_113px)] md:w-[560px]'

export const TerminalDrawer = ({
  collapsed,
  onToggleCollapsed,
  children,
  footer,
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
      shell.style.setProperty(COMPOSER_CLEARANCE_VAR, `${composerFootprintPx(card.offsetHeight)}px`)
    publish()
    // jsdom has no ResizeObserver; the first publish is all a unit test needs.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(card)
    return () => {
      observer?.disconnect()
      shell.style.removeProperty(COMPOSER_CLEARANCE_VAR)
    }
  }, [])

  if (collapsed) {
    return (
      <section
        ref={cardRef}
        aria-label="Pond terminal"
        data-part="composer-card"
        className={`${CARD_PLACEMENT} mn-glass flex h-[30px] items-center justify-center rounded-tl-[14px] rounded-tr-[16px] border-b-0 text-mn-text`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={false}
          aria-label="Expand terminal"
          className="flex size-full cursor-pointer items-center justify-center"
        >
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
        </button>
      </section>
    )
  }

  return (
    <section
      ref={cardRef}
      aria-label="Pond terminal"
      data-part="composer-card"
      className={`${CARD_PLACEMENT} mn-glass box-border flex flex-col gap-[14px] rounded-mn-card p-[14px] font-mono text-mn-text`}
    >
      {children}
      {footer}
    </section>
  )
}
