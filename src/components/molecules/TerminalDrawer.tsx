'use client'

/**
 * The PondComposer card (`PondComposer.dc.html` `glass`, board 2f): one
 * floating sheet of glass — 560 wide (360 below md), padding 14, gap 14, radius
 * 20 — holding the thread, then the line and toolbar, 24px off the bottom.
 * At rest it is as tall as the line and toolbar. Once it holds a thread it does
 * NOT grow with it: it sits at `COMPOSER_DEFAULT_HEIGHT` and the thread scrolls
 * inside. Only the person changes that, with `ComposerHandle` on its top edge,
 * and the card never rises past the ⌘K pill (`COMPOSER_MAX_HEIGHT_CSS`).
 *
 * Placement is the storyboards' `left:246px; right:20px; bottom:24px` (rail
 * 20+206+20): centred on the area right of the rail, i.e. `calc(50% + 113px)` of
 * the shell. Below md the rail is not beside it, so the card centres on the shell.
 *
 * The card publishes its real footprint on the shell (`COMPOSER_CLEARANCE_VAR`,
 * lib/layout/composer-clearance) and the page surfaces pad against it.
 *
 * Collapsed, the card itself stays mounted — grip, thread and footer intact —
 * and slides off screen (`.motion-resolve`, 280ms `--ease-mn`) while a tab
 * (`PondComposer` `collapsed`/`landed`) takes its place: 30px of the same glass
 * on the shell's bottom edge, a pill riding its top edge with the chevron, and
 * `⌘J` below it. When an answer arrived while it was closed the pill also says
 * `pond answered`, in a 6px dot and words — never a ping, badge or count.
 */

import { useCallback, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { ComposerHandle } from '@/components/molecules/ComposerHandle'
import {
  COMPOSER_BOTTOM_INSET,
  COMPOSER_CLEARANCE_VAR,
  COMPOSER_TAB_INSET,
  composerFootprintPx,
} from '@/lib/layout/composer-clearance'
import {
  COMPOSER_DEFAULT_HEIGHT,
  COMPOSER_MAX_HEIGHT_CSS,
  COMPOSER_TOP_CLEARANCE,
} from '@/lib/layout/composer-height'
import { RAIL_WIDTH_PX } from '@/lib/layout/rail-width'
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
  /** The user-set card height (`useComposerHeight`), or null for the default. */
  height?: number | null
  /** Live height during a handle drag. Without it the card draws no handle. */
  onHeightChange?: (height: number) => void
  /** A finished resize gesture; `null` returns the card to its default. */
  onHeightCommit?: (height: number | null) => void
  /** Fills the canvas beside the rail — a state, not a height: ignores `height`
   *  and the drag ceiling, and is never the stored or opening height. */
  maximized?: boolean
  /** The rail is hidden (WorkspaceShell/ZenChrome) — maximized fills to the
   *  shell's left edge too, the same 20px inset as the right, not the rail's
   *  246px gap. */
  zen?: boolean
  /** The board's one-line resting composer, on screen, with the thread kept
   *  mounted but hidden rather than unmounted — typing or focusing the line
   *  reopens it at its last height. */
  minimized?: boolean
  /** Content present but not a thread (KAN-179's made-page chip row, frame 5):
   *  the card sizes to it rather than `height`/the default, draws no resize
   *  handle, and gets no `data-sized` — the same shape as having no children at
   *  all, just with something to show. The style ternary checks `maximized`
   *  first, so this has no effect while maximized is also true — callers fold
   *  (AITerminal clears `maximized` the moment the fold for a made page begins). */
  unsized?: boolean
  /** The card itself (`data-part="composer-card"`, the one element carrying the
   *  glass in both states) — exposed so a sibling (the `@` picker, KAN-99) can
   *  anchor to the visible glass rather than a transparent child of it. */
  cardRef?: RefObject<HTMLElement | null>
}

const PLACEMENT =
  'absolute left-1/2 z-30 w-[360px] max-w-full -translate-x-1/2 md:left-[calc(50%_+_113px)] md:w-[560px]'
const CARD_PLACEMENT = cn(PLACEMENT, 'bottom-6')
const TAB_PLACEMENT = cn(PLACEMENT, 'bottom-0')
/** Maximized drops the centred placement for an absolute inset — position comes
 *  from style, not these classes. */
const MAXIMIZED_PLACEMENT = 'absolute z-30'

/** The canvas beside the rail — the rail's own 20px inset, its 206px width, and
 *  the 20px gap to the canvas (the board's `left:246px`). */
const COMPOSER_MAXIMIZED_LEFT_PX = 20 + RAIL_WIDTH_PX + 20
/** The canvas's own inset from the shell's right edge (the board's `right:20px`). */
const COMPOSER_MAXIMIZED_RIGHT_PX = 20

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
  maximized = false,
  zen = false,
  minimized = false,
  unsized = false,
  cardRef: externalCardRef,
}: TerminalDrawerProps) => {
  const innerCardRef = useRef<HTMLElement>(null)
  const tabRef = useRef<HTMLElement>(null)
  const setCardRef = useCallback(
    (node: HTMLElement | null) => {
      innerCardRef.current = node
      if (externalCardRef) externalCardRef.current = node
    },
    [externalCardRef]
  )

  // Publish the real footprint on the shell so the page surfaces pad against it.
  // Layout effect: the padding lands in the same frame as the card. Outside a
  // shell (Storybook) there is nothing to publish to. Collapsed, the card itself
  // stays mounted but slides off screen — the tab is what's on screen, so it's
  // what gets measured.
  // `maximized`/`minimized` are in the dependency array too: both resize the card
  // without changing `collapsed`, and a synchronous republish on the prop change
  // itself — not a wait on ResizeObserver — is what keeps `composerBottomBound`
  // (the KAN-100 `/` menu) correct the instant either toggles.
  useLayoutEffect(() => {
    const node = collapsed ? tabRef.current : innerCardRef.current
    const shell = node?.closest<HTMLElement>('[data-part="shell"]')
    if (!node || !shell) return
    const publish = () =>
      shell.style.setProperty(
        COMPOSER_CLEARANCE_VAR,
        `${composerFootprintPx(node.offsetHeight, collapsed ? COMPOSER_TAB_INSET : undefined)}px`
      )
    publish()
    // A card hidden with the shell's chrome (zen) keeps its last footprint: the
    // page is not re-padded beneath it, so a scroll restored as it returns lands
    // against the clearance it was read under.
    const handleResize = () => {
      if (node.getClientRects().length > 0) publish()
    }
    // jsdom has no ResizeObserver; the first publish is all a unit test needs.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleResize)
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      shell.style.removeProperty(COMPOSER_CLEARANCE_VAR)
    }
  }, [collapsed, maximized, minimized])

  // The chevron pill, the "pond answered" landed state, the ⌘J key and the
  // "Open composer" button — a standalone element, always mounted, so it can
  // sit beside the card rather than take its place. `collapsed` only toggles its
  // opacity/pointer-events; its name is distinct from the card's so the two can
  // be mounted — and both read as regions — at once with no duplicate name.
  const tab = (
    <section
      ref={tabRef}
      aria-label="Composer tab"
      data-part="composer-tab"
      data-state={landed ? 'landed' : 'collapsed'}
      aria-hidden={collapsed ? undefined : true}
      // Real boolean attribute (React 19): the open card owns the tab order while
      // the tab sits on screen but out of it, and vice versa when collapsed below.
      inert={collapsed ? undefined : true}
      className={cn(
        TAB_PLACEMENT,
        TAB_SHADOW,
        'mn-glass box-border flex h-[30px] justify-center rounded-[14px_16px_0_0] border-b-0 font-mono text-mn-text',
        collapsed ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
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

  // At rest there is nothing to size, and a fixed height would leave an empty slab.
  // Minimized is rest too — the thread stays mounted (its state survives) but hidden.
  // `unsized` content (KAN-179's made-page chip row) is shown the same way but never
  // sized: it takes the `data-sized`/height/handle path out of the equation entirely.
  const hasThread = Boolean(children)
  const showThread = hasThread && !minimized && !unsized

  // Collapsed slides the whole card off screen rather than swapping it for the
  // tab: grip, thread and footer all stay mounted, so reopening needs no rebuild.
  // The shell itself has no overflow clip (WorkspaceShell's `[data-part="shell"]`
  // is a plain `relative` box), so the slid-off card would otherwise inflate the
  // page's scrollable area by its own height. This layer clips that off without
  // creating a stacking context of its own — `inset-0` alone matches the shell's
  // box exactly, so the card and tab's `absolute` placement reads the same
  // coordinates it always did (maximized's top/left/right/bottom included).
  return (
    <div className="absolute inset-0 overflow-clip pointer-events-none">
      {tab}
      <section
        ref={setCardRef}
        aria-label="composer"
        data-part="composer-card"
        data-sized={showThread || undefined}
        data-maximized={maximized || undefined}
        data-minimized={minimized || undefined}
        data-collapsed={collapsed || undefined}
        aria-hidden={collapsed || undefined}
        // Collapsed, the slid-off card is still mounted (its thread survives) but
        // must not steal Tab from the tab that replaces it — `inert` (React 19's
        // real boolean attribute) pulls the whole subtree out of the tab order,
        // not just the hand-set tabIndex this used to need on each control.
        inert={collapsed || undefined}
        style={
          maximized
            ? {
                top: COMPOSER_TOP_CLEARANCE,
                bottom: COMPOSER_BOTTOM_INSET,
                left: zen ? COMPOSER_MAXIMIZED_RIGHT_PX : COMPOSER_MAXIMIZED_LEFT_PX,
                right: COMPOSER_MAXIMIZED_RIGHT_PX,
              }
            : showThread
              ? { height: height ?? COMPOSER_DEFAULT_HEIGHT, maxHeight: COMPOSER_MAX_HEIGHT_CSS }
              : undefined
        }
        className={cn(
          maximized ? MAXIMIZED_PLACEMENT : CARD_PLACEMENT,
          'motion-resolve group/composer mn-glass box-border flex flex-col gap-[14px] rounded-mn-card p-[14px] font-mono text-mn-text',
          collapsed
            ? 'pointer-events-none invisible translate-y-[calc(100%+24px)] opacity-0'
            : 'pointer-events-auto visible'
        )}
      >
        {showThread && !maximized && onHeightChange && onHeightCommit && (
          <ComposerHandle
            cardRef={innerCardRef}
            height={height}
            onHeightChange={onHeightChange}
            onHeightCommit={onHeightCommit}
          />
        )}
        {hasThread && (
          <div
            data-part="composer-thread"
            hidden={minimized}
            className="flex min-h-0 flex-1 flex-col gap-[14px]"
          >
            {children}
          </div>
        )}
        {footer}
      </section>
    </div>
  )
}
