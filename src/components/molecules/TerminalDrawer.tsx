'use client'

/**
 * The presentational shell for the AI terminal (ticket-24). Owns the drawer
 * ergonomics — collapse, user-resize with a drag handle, and remembered height —
 * so the AITerminal organism can stay focused on chat/proposal data.
 *
 * A flex *sibling* of the main panel (not an overlay): collapsing or shrinking it
 * hands the reclaimed height back to the content above, so the drawer never
 * covers what the user is reading.
 *
 * Height is controlled by the parent (persisted to localStorage there); this
 * molecule reports drag deltas and toggles via callbacks. Purely presentational
 * and prop-driven so its states are exercisable in Storybook.
 *
 * ticket-42: the terminal's visible chrome now lives entirely within the same
 * centered column the transcript uses. The outer section is transparent so paper
 * shows through outside the column — no full-width beige slab. The shared
 * RAIL_WIDTH_PX constant is the single source of truth for the rail-offset
 * coupling (Rail.tsx also uses w-[252px]); AITerminal imports it so text and
 * chrome can't drift.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const TERMINAL_MIN_HEIGHT = 160
export const TERMINAL_MAX_HEIGHT = 640
export const TERMINAL_DEFAULT_HEIGHT = 288 // 18rem — the incumbent fixed height
/** Header height shown when collapsed (just the grab/context strip). */
export const TERMINAL_COLLAPSED_HEIGHT = 40

/**
 * The rail sidebar's fixed width in px. Both Rail (w-[252px]) and the terminal
 * column offset (pl-[252px]) couple to this value. Exporting it here gives
 * AITerminal a single import to keep text and chrome aligned — if Rail's width
 * ever changes, updating this constant fixes both.
 */
export const RAIL_WIDTH_PX = 252

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
  // Only the column-scoped inner surface carries the background and borders.
  // The section still manages height for the flex layout.
  return (
    <section
      className="flex flex-col flex-shrink-0"
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
          className="group relative z-40 h-4 -mt-3 cursor-ns-resize flex items-center outline-none touch-none"
          data-testid="terminal-resize-handle"
        >
          {/* Grip centered over the column (not the full window), matching the
              confined chrome below. The handle itself stays full-width for an
              easy drag target. */}
          <span className="mx-auto w-full max-w-2xl px-8 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-press-muted/40 group-hover:bg-press-accent group-focus:bg-press-accent transition-colors" />
          </span>
        </div>
      )}

      {/* The whole chat is ONE rounded, bordered card confined to the center
          column (a floating panel over the paper, matching the v85 proto) — not a
          full-width dock. The single outer wrapper below carries only the
          rounding + layout — it's fully transparent (no border/background/shadow,
          and the header wash is dropped) so the page shows through the chat;
          header / body / footer live inside it as sections, so the inner column
          wrappers (AITerminal) no longer re-center.
          The terminal now lives in the column to the RIGHT of the full-height
          rail (WorkspaceShell), so `mx-auto max-w-2xl` centers the card in that
          column directly — no rail offset needed. */}
      <div className="flex-1 min-h-0 flex px-4 pb-3">
        <div className="mx-auto w-full max-w-2xl min-h-0 flex flex-col overflow-hidden rounded-2xl">
          {/* Header: context + visible controls (collapse toggle, clear).
              ticket-32: the context label carries the correspondence serif. */}
          <div className="flex-shrink-0 flex items-center justify-between px-8 py-2 text-xs text-press-muted">
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
                className="inline-block text-[10px] transition-transform"
                style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
              >
                ▾
              </span>
              <span className="font-serif italic">
                Context:{' '}
                <span className="not-italic font-medium text-foreground">{contextLabel}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={!canClear}
              aria-label="Clear conversation"
              title="Clear conversation (/clear)"
              className="font-serif italic text-press-faint hover:text-press-rust transition-colors disabled:opacity-30 disabled:cursor-default cursor-pointer"
            >
              Clear
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
