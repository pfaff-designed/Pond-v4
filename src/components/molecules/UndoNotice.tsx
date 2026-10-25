'use client'

/**
 * The ⌘Z/⇧⌘Z notice (KAN-139, board `Pond 06.15 Change log.dc.html` s6o5) —
 * the floating glass panel that says which page the step opened and what it
 * undid/redid. Purely presentational: `ShellCommands` owns `useUndoNotice()`
 * and passes the result straight through, the same organism/molecule split
 * as `PageChangesPanel`/`PageChangesSection`.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'

import { layerVars } from '@/lib/layout/layers'
import { toNoticeLines, type UndoNotice as UndoNoticeData } from '@/lib/terminal-focus'

export interface UndoNoticeProps {
  notice: UndoNoticeData | null
}

// The panel's own measured BOTTOM edge (KAN-553) — `offsetTop + offsetHeight`,
// not just height, so `UndoToastViewport` can stack directly below it with no
// separate copy of the panel's `top-[28px]` to agree with. The body
// (`lines.body`) wraps to a variable number of lines, so a fixed offset can't
// be justified either way. A module-level store, the same decoupling as
// `useComposerOpen` (terminal-focus.ts): the viewport is a sibling subtree,
// not a DOM ancestor/descendant, of this panel. Kept here rather than in
// terminal-focus.ts — "open" (`useUndoNotice`) and "how tall" are two
// different facts, and only this component ever measures the second one.
let panelBottomSnapshot: number | null = null
const panelBottomListeners = new Set<() => void>()

function setPanelBottom(bottom: number | null) {
  if (panelBottomSnapshot === bottom) return
  panelBottomSnapshot = bottom
  panelBottomListeners.forEach((listener) => listener())
}

/** The open panel's live bottom edge in px (its `offsetTop + offsetHeight`), or null while closed/unmeasured — read by `UndoToastViewport` to stay clear of it. */
export function useUndoPanelBottom(): number | null {
  return useSyncExternalStore(
    (listener) => {
      panelBottomListeners.add(listener)
      return () => panelBottomListeners.delete(listener)
    },
    () => panelBottomSnapshot,
    () => null
  )
}

// z-[var(--z-undo-panel)]: the board draws this as the canvas's topmost layer
// (z-index 4 over its siblings), but `PageChangesSection`'s "changes to this
// page" panel sits in the same stacking context at z-40 — this has to outrank
// that, not just its drawn siblings. It reads the shell's layer scale
// (src/lib/layout/layers.ts, `undoPanel`, derived from `pageChangesPanel`
// rather than a bare number) — and that scale keeps the toast stack one
// above this, so a toast raised while this panel is open is never hidden
// under it (KAN-553).
const PANEL =
  'absolute right-[28px] top-[28px] z-[var(--z-undo-panel)] w-[330px] flex flex-col gap-[10px] rounded-[20px] p-[14px] font-mono [background:var(--mn-panel-bg)] [border:var(--mn-panel-border)] [box-shadow:var(--mn-panel-shadow)] backdrop-blur-[24px] backdrop-saturate-[1.3]'

export function UndoNotice({ notice }: UndoNoticeProps) {
  // A callback ref, not an effect: React calls this with `null` as the panel
  // unmounts (the `notice === null` branch below), so the close path clears
  // the published height with no separate cleanup to keep in sync.
  const observerRef = useRef<ResizeObserver | null>(null)
  const measure = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) {
      setPanelBottom(null)
      return
    }
    // `offsetHeight` rounds to the nearest integer, so a 99.5px panel would
    // read 100 and the toast stack would land half a pixel past the gap —
    // `getBoundingClientRect().height` keeps the fraction. `offsetTop` stays
    // (it's already an integer, and `getBoundingClientRect().top` is in
    // viewport coordinates, not this element's offset parent).
    const read = () => setPanelBottom(el.offsetTop + el.getBoundingClientRect().height)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    observerRef.current = ro
  }, [])

  if (notice === null) return null
  const lines = toNoticeLines(notice)
  return (
    <div ref={measure} role="status" aria-live="polite" className={PANEL} style={layerVars('undoPanel')}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span>{lines.headLeft}</span>
        {lines.headRight !== null && <span className="text-mn-text-secondary">{lines.headRight}</span>}
      </div>
      <p className="text-[11.5px] leading-[1.5]">{lines.body}</p>
      <div className="flex items-baseline gap-[8px] text-[10.5px] text-mn-text-secondary">
        <span>{lines.footLeft}</span>
        {lines.footRight !== null && (
          <>
            <span>·</span>
            <span>{lines.footRight}</span>
          </>
        )}
      </div>
    </div>
  )
}
