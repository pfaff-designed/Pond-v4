'use client'

/**
 * The presentational shell for the AI terminal (ticket-24). Owns the drawer
 * ergonomics — collapse, user-resize with a drag handle, and remembered height —
 * so the AITerminal organism can stay focused on chat/proposal data.
 *
 * #96 (BUILD-BRIEF-float-chat-over-content): the drawer FLOATS over the bottom
 * of the content column as an absolute overlay — the page scrolls behind it and
 * `WorkspaceShell` pads the content so the last lines can clear the card. The
 * flanks either side of the card click through to the page beneath.
 *
 * Height is controlled by the parent (persisted to localStorage there); this
 * molecule reports drag deltas and toggles via callbacks. Purely presentational
 * and prop-driven so its states are exercisable in Storybook.
 *
 * ticket-42: the terminal's visible chrome now lives entirely within the same
 * centered column the transcript uses. The outer section is transparent so paper
 * shows through outside the column — no full-width beige slab. The card itself
 * is floating glass (`mn-glass`, composer radius 20 — handoff README § Surfaces).
 * The shared RAIL_WIDTH_PX constant is the single source of truth for the
 * rail-width coupling (Rail.tsx also uses w-[206px]).
 */

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const TERMINAL_MIN_HEIGHT = 160
export const TERMINAL_MAX_HEIGHT = 640
export const TERMINAL_DEFAULT_HEIGHT = 288 // 18rem — the incumbent fixed height
/** Header height shown when collapsed (just the grab/context strip). */
export const TERMINAL_COLLAPSED_HEIGHT = 40

/**
 * The rail card's width in px (`PondRail`: 206 at desktop). Rail (w-[206px]) and
 * the Storybook column offsets couple to this value — if Rail's width ever
 * changes, updating this constant fixes both. The card is inset 20px from the
 * shell's edges (WorkspaceShell), so the content column begins at 246.
 */
export const RAIL_WIDTH_PX = 206

export function clampTerminalHeight(h: number): number {
  return Math.min(TERMINAL_MAX_HEIGHT, Math.max(TERMINAL_MIN_HEIGHT, h))
}

export interface TerminalDrawerProps {
  /** Context label shown in the header strip (e.g. the open page name). */
  contextLabel: string
  /** Body height in px when expanded (excludes the header strip). */
  height: number
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Live height updates during a resize gesture (clamped before delivery). */
  onHeightChange: (height: number) => void
  /** Fired once when a resize gesture ends — persist here, not per move. */
  onHeightCommit?: (height: number) => void
  /** Wired to the existing /clear behavior — a visible affordance, not just placeholder text. */
  onClear: () => void
  /** The transcript / proposal region. */
  children: ReactNode
  /** The input row (textarea + send). */
  footer: ReactNode
  /** True while there is any transcript to clear (disables the Clear control when empty). */
  canClear?: boolean
}

export function TerminalDrawer({
  contextLabel,
  height,
  collapsed,
  onToggleCollapsed,
  onHeightChange,
  onHeightCommit,
  onClear,
  children,
  footer,
  canClear = true,
}: TerminalDrawerProps) {
  // Drag-to-resize via pointer capture on the handle: captured move/up/cancel
  // events are routed to the handle even when the cursor leaves the thin strip,
  // and pointerId matching keeps a second pointer (multi-touch) from jittering
  // an in-flight drag. `lastHeight` is what a cancel/up commits — pointercancel
  // events can carry garbage coordinates, so we never recompute from them.
  const dragState = useRef<{
    pointerId: number
    startY: number
    startHeight: number
    lastHeight: number
  } | null>(null)

  const releaseBodyStyles = () => {
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }

  // If the drawer unmounts mid-drag, don't leave the page stuck in ns-resize/no-select.
  useEffect(
    () => () => {
      if (dragState.current) releaseBodyStyles()
    },
    []
  )

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed || dragState.current) return
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* capture can fail for already-released pointers; the drag still works while over the handle */
      }
      dragState.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: height,
        lastHeight: height,
      }
      // Kill text selection + show the resize cursor for the whole drag.
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'
    },
    [collapsed, height]
  )

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      if (!st || e.pointerId !== st.pointerId) return
      // Drag up (negative deltaY) grows the drawer.
      const next = clampTerminalHeight(st.startHeight + (st.startY - e.clientY))
      st.lastHeight = next
      onHeightChange(next)
    },
    [onHeightChange]
  )

  // Shared end for pointerup AND pointercancel (touch-scroll takeover, OS
  // interrupt): clear the drag, release body styles, commit the last height the
  // user actually saw.
  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const st = dragState.current
      if (!st || e.pointerId !== st.pointerId) return
      dragState.current = null
      releaseBodyStyles()
      onHeightCommit?.(st.lastHeight)
    },
    [onHeightCommit]
  )

  // Keyboard resize on the handle for accessibility (↑/↓ nudge by 24px). Each
  // press is a complete gesture, so it commits immediately.
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (collapsed) return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = clampTerminalHeight(height + (e.key === 'ArrowUp' ? 24 : -24))
        onHeightChange(next)
        onHeightCommit?.(next)
      }
    },
    [collapsed, height, onHeightChange, onHeightCommit]
  )

  // ticket-42: the outer section is transparent — no full-width bg-card slab.
  // #96: it is an absolute overlay anchored to the bottom of the content column
  // (z-30, above the page), with pointer-events off so the flanks beside the
  // card stay scrollable/clickable; the handle and the card opt back in. The
  // section still manages height so the card grows UPWARD from its anchor.
  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col pointer-events-none"
      style={{ height: collapsed ? TERMINAL_COLLAPSED_HEIGHT : height + TERMINAL_COLLAPSED_HEIGHT }}
      aria-label="Pond terminal"
    >
      {/* Resize handle — a strip along the top edge (hidden when collapsed).
          `relative z-40` lifts it ABOVE the page content and the card below, so
          the grip is never covered and always grabbable; pulled up (-mt-3) so the
          grip sits clear of the card's top border. Spans full width for an easy
          drag target; the visible grip is centered over the column. */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal"
          tabIndex={0}
          onPointerDown={startDrag}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
          className="group relative z-40 h-4 -mt-3 cursor-ns-resize flex items-center outline-none touch-none pointer-events-auto"
          data-testid="terminal-resize-handle"
        >
          {/* Grip centered over the column (not the full window), matching the
              confined chrome below. The handle itself stays full-width for an
              easy drag target. */}
          <span className="mx-auto w-full max-w-2xl px-8 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-mn-text-secondary/40 group-hover:bg-mn-text group-focus:bg-mn-text transition-colors" />
          </span>
        </div>
      )}

      {/* The whole chat is ONE floating glass card confined to the center column
          (`Pond 05 Shell`: the composer sits 24px off the bottom, centred over
          the content) — not a full-width dock. The card carries the glass recipe
          and the composer radius (20); header / body / footer live inside it as
          sections, so the inner column wrappers (AITerminal) no longer re-center.
          The terminal lives in the column to the RIGHT of the rail
          (WorkspaceShell), so `mx-auto max-w-2xl` centers the card in that
          column directly — no rail offset needed. */}
      <div className="flex-1 min-h-0 flex px-4 pb-6">
        <div
          data-part="composer-card"
          className="mn-glass pointer-events-auto mx-auto w-full max-w-2xl min-h-0 flex flex-col overflow-hidden rounded-mn-card"
        >
          {/* Header: context + visible controls (collapse toggle, clear).
              MN: the composer is a machine surface, so its chrome speaks the mono
              machine voice (lowercase, tracking-wider) — not the correspondence
              serif. The context VALUE stays as-is (it's a page/area name). */}
          <div className="flex-shrink-0 flex items-center justify-between px-8 py-2 font-mono lowercase tracking-wider text-mn-11 text-mn-text-secondary">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
              title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
              className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
            >
              <span
                aria-hidden
                className="inline-block text-mn-11 transition-transform"
                style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
              >
                ▾
              </span>
              <span>
                context:{' '}
                <span className="font-medium normal-case text-foreground">{contextLabel}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={!canClear}
              aria-label="Clear conversation"
              title="Clear conversation (/clear)"
              className="text-mn-text-faint hover:text-raw-red transition-colors disabled:opacity-30 disabled:cursor-default cursor-pointer"
            >
              clear
            </button>
          </div>

          {/* Body + footer collapse away, but the header stays as the re-open
              affordance. When collapsed the card shrinks to just the header bar. */}
          {!collapsed && (
            <>
              <div className="flex-1 min-h-0 flex flex-col">{children}</div>
              <div className="flex-shrink-0">{footer}</div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
