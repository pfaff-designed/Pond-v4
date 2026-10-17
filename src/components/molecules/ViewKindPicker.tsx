'use client'

/**
 * The ＋ view picker (KAN-243, Views 3/4) — `PondPicker`'s mono row recipe, one
 * row per `VIEW_KINDS` entry in table order. A kind missing its required field
 * (`hasRequiredField`, `kinds.ts`) still picks — its row carries the remedy line
 * as the row's `hint`, and picking it is the host's job (mint the field, then
 * the view). A kind the host marks `disabled` (no collection to remedy against)
 * draws `faint` and never calls `onPick`.
 *
 * `SourcePicker.tsx`'s single-step shape, with no `source`/`type`/`new` steps:
 * one list, one pick. The glass, the row and the anchoring hook are the same
 * three files `SourcePicker`/`SlashMenu` already share (`picker-chrome.ts`,
 * `slash-row.tsx`, `use-anchored-box.ts`) — a fourth hand-rolled list would be
 * the duplicate AGENTS.md forbids, not this one reusing them.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { VIEW_KINDS } from '@/lib/modules/view/kinds'
import type { ViewMode } from '@/lib/modules/view/schema'

import { GLASS, GLASS_ABOVE, LIST, SLASH_SIZES } from './picker-chrome'
import { Row, type RowEntry } from './slash-row'
import { useAnchoredBox, type PickerAnchor, type PickerSide } from './use-anchored-box'

export interface ViewKindPickerRow {
  mode: ViewMode
  /** `addViewRemedyLine(mode)` — shown as the row's hint; the row stays pickable. */
  remedyLine?: string
  /** A kind that cannot be remedied at all: its reason, shown as the row's hint. The row draws faint and never picks. */
  disabled?: string
}

export interface ViewKindPickerProps {
  rows: readonly ViewKindPickerRow[]
  /** The "＋ view" button the glass hangs off. */
  anchor: PickerAnchor
  /** @default 'bottom' */
  side?: PickerSide
  onPick: (mode: ViewMode) => void
  /** Esc, or a press outside. */
  onClose: () => void
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
}

const CHROME = SLASH_SIZES.desktop

function toRowEntry(row: ViewKindPickerRow): RowEntry {
  const kind = VIEW_KINDS[row.mode]
  return {
    kind: 'row',
    id: row.mode,
    label: kind.label,
    pre: kind.label,
    hit: '',
    post: '',
    icon: kind.icon,
    hint: row.disabled ?? row.remedyLine,
    faint: row.disabled !== undefined,
  }
}

export function ViewKindPicker({
  rows,
  anchor,
  side = 'bottom',
  onPick,
  onClose,
  container,
}: ViewKindPickerProps) {
  const items = rows.map(toRowEntry)
  const [active, setActive] = useState(0)
  const select = (index: number) => setActive(Math.min(Math.max(index, 0), items.length - 1))

  const pick = (row: ViewKindPickerRow | undefined) => {
    if (!row || row.disabled !== undefined) return
    onPick(row.mode)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      let handled = true
      if (e.key === 'ArrowDown') select(active + 1)
      else if (e.key === 'ArrowUp') select(active - 1)
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter') pick(rows[active])
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  const glassRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    glassRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // A press outside the glass closes it, same as `SourcePicker.tsx` — except
  // a press on the anchor itself, which isn't "outside": it's the button
  // that opened this glass, and its own click handler (not this listener)
  // owns toggling it shut.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (glassRef.current?.contains(e.target as Node)) return
      const anchorEl = anchor && 'current' in anchor ? anchor.current : anchor
      if (anchorEl instanceof Node && anchorEl.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [anchor, onClose])

  const style = useAnchoredBox(anchor, side, CHROME.widthPx)

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={glassRef}
      tabIndex={-1}
      data-part="glass"
      data-kind="view"
      className={`${side === 'top' ? GLASS_ABOVE : GLASS} ${CHROME.width}`}
      style={style}
    >
      <div role="listbox" aria-label="add a view" className={LIST}>
        {items.map((entry, i) => (
          <Row
            key={entry.id}
            entry={entry}
            selected={i === active}
            onHover={() => select(i)}
            onPick={() => pick(rows[i])}
          />
        ))}
      </div>
    </div>,
    container ?? document.body
  )
}
