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
 */

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const TERMINAL_MIN_HEIGHT = 160
export const TERMINAL_MAX_HEIGHT = 640
export const TERMINAL_DEFAULT_HEIGHT = 288 // 18rem — the incumbent fixed height
/** Header height shown when collapsed (just the grab/context strip). */
export const TERMINAL_COLLAPSED_HEIGHT = 40

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
  /** Commits a new expanded body height (already the raw candidate; clamped here). */
  onHeightChange: (height: number) => void
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
  onClear,
  children,
  footer,
  canClear = true,
}: TerminalDrawerProps) {
  // Drag-to-resize. We track the pointer on the window so the drag survives the
  // cursor leaving the thin handle, and read the *committed* height at grab time
  // from a ref so rapid moves don't chase stale state.
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const st = dragState.current
      if (!st) return
      // Drag up (negative deltaY) grows the drawer.
      const next = clampTerminalHeight(st.startHeight + (st.startY - e.clientY))
      onHeightChange(next)
    },
    [onHeightChange]
  )

  const onPointerUp = useCallback(() => {
    dragState.current = null
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed) return
      e.preventDefault()
      dragState.current = { startY: e.clientY, startHeight: height }
      // Kill text selection + show the resize cursor for the whole drag.
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'ns-resize'
    },
    [collapsed, height]
  )

  // Keyboard resize on the handle for accessibility (↑/↓ nudge by 24px).
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (collapsed) return
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onHeightChange(clampTerminalHeight(height + 24))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onHeightChange(clampTerminalHeight(height - 24))
      }
    },
    [collapsed, height, onHeightChange]
  )

  return (
    <section
      className="flex flex-col border-t border-border bg-card flex-shrink-0"
      style={{ height: collapsed ? TERMINAL_COLLAPSED_HEIGHT : height + TERMINAL_COLLAPSED_HEIGHT }}
      aria-label="Pond terminal"
    >
      {/* Resize handle — a thin grabbable strip along the top edge (hidden when collapsed). */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal"
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={onHandleKeyDown}
          className="group h-1.5 -mt-1 cursor-ns-resize flex items-center justify-center outline-none touch-none"
          data-testid="terminal-resize-handle"
        >
          <span className="h-0.5 w-8 rounded-full bg-press-faint/60 group-hover:bg-press-accent group-focus:bg-press-accent transition-colors" />
        </div>
      )}

      {/* Header: context + visible controls (collapse toggle, clear). */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-press-hair bg-press-accent-wash text-xs text-muted-foreground font-mono flex-shrink-0">
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
          <span>
            Context: <span className="text-foreground">{contextLabel}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          aria-label="Clear conversation"
          title="Clear conversation (/clear)"
          className="text-press-faint hover:text-press-rust transition-colors disabled:opacity-30 disabled:cursor-default cursor-pointer"
        >
          Clear
        </button>
      </div>

      {/* Body + footer collapse away, but the header strip stays as the re-open affordance. */}
      {!collapsed && (
        <>
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          <div className="flex-shrink-0">{footer}</div>
        </>
      )}
    </section>
  )
}
