'use client'

/**
 * The `/` menu — `PondPicker kind="slash"` (#278, child a of #226). The palette
 * (#279) and the source picker (#280) are the picker's other two kinds; when all
 * three exist they fold into one `PondPicker` entry.
 *
 * Every literal here is `wayfinder/board-values.generated.json`
 * `.components.PondPicker` (`kind=slash|theme=paper` and its `ink` delta), the
 * board's own `renderVals()` output — never measured off a served frame.
 *
 *   glass   300 (mobile 340) · border-box · padding 8 · radius 20 · mono · ink · column · gap 1
 *           → `.mn-glass` (globals.css) IS the board's recipe, light; dark follows
 *             the Shell's dark frames (ADR 0004: the composed context outranks the
 *             component card) — one recipe, three consumers already, no copy here.
 *   head    flex · gap 10 · 8px 10px 10px · mb 4 · 1px ink .09 · mono 12 (mobile 13) — the
 *           `templates` pane only; the blank list that leads with templates (KAN-276) has none
 *   group   8px 10px 5px · 10.5 · .04em · ink .68 — NO text-transform (ADR 0003, 3rd amendment)
 *   row     flex · gap 10 · 7px 10px · radius 10 · mono 12.5 · .01em · ink; selected ink .07
 *           mobile: 11px 10px at 14; the open list stops at 12 entries (group heads
 *           counted), the templates pane at 8 premade shapes
 *   svg     13 × 13 on a 14 grid · stroke currentColor 1.4 round · at ink .8
 *   hint    0 1 auto · max 45% · mono 10.5 · ink .68 · ellipsis — hidden on the selected row
 *   ↵       mono 10.5 · ink .8 — on the selected row
 *   match   underline · offset 3 · thickness 1, over a `pre` / `hit` / `post` split
 *   note    10px 10px · mono 12 (mobile 13) · 1.55 · ink .8 · text-wrap pretty
 *   foot    flex wrap · gap 14 · 9px 10px 4px · mt 4 · 1px ink .09 · 10.5 · ink .68
 *
 * There is no filter `<input>`: the query is the `/ta` the person typed, on the
 * page or in the composer, and the keys arrive from that field. The menu listens
 * on the document in the capture phase so ↑↓ ↵ esc never reach the field — except
 * ↵ with nothing to insert, which is the field's. **esc keeps the typed text:** it
 * only closes, and so does a space typed when nothing matches. The ink tiers `.68` / `.8` are the house `text-mn-text-secondary` /
 * `text-mn-text-meta`. Class strings are template literals, not `cn()` (#252).
 *
 * The glass portals to `document.body` at a fixed box off the anchor's rect — the
 * engine logic the previous surface already had — and a document `pointerdown`
 * outside it closes. base-ui's `Popover` was tried first and does this job, but
 * under jsdom every test that mounts it pays ~15–20 s of teardown, which would
 * stall six suites; measured twice, so the primitive is not used here.
 *
 * The row and its mark live in `slash-row.tsx`, the chrome strings in
 * `picker-chrome.ts` and the anchoring hook in `use-anchored-box.ts` — the source
 * picker (#280) draws the same row under the same chrome, so each is one file,
 * not a restatement.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import {
  blankRowEntries,
  footItems,
  MOBILE_PREMADE_CAP,
  MOBILE_ROW_CAP,
  rowEntries,
  templateEntries,
  type SlashPane,
  type SlashRow,
  type TemplatePick,
  type YourTemplate,
} from './slash-entries'
import {
  FOOT,
  GLASS,
  GLASS_ABOVE,
  GROUP,
  HEAD_TEXT,
  LIST,
  SLASH_SIZES,
  type PickerSize,
} from './picker-chrome'
import { Row, type RowEntry } from './slash-row'
import { useAnchoredBox, type PickerAnchor, type PickerSide } from './use-anchored-box'

export type { SlashIcon, SlashRow, TemplatePick, YourTemplate } from './slash-entries'

export interface SlashMenuProps {
  rows: readonly SlashRow[]
  /** What the person has typed after the `/`. */
  query: string
  /** The field (or button) the glass hangs off. */
  anchor: PickerAnchor
  /** @default 'bottom' */
  side?: PickerSide
  /** Accessible name for the list. @default 'blocks' */
  label?: string
  onSelect: (row: SlashRow) => void
  /** esc, or a press outside — the host keeps the typed text. */
  onClose: () => void
  onPickTemplate?: (pick: TemplatePick) => void
  /** When given, the `templates` foot offers `→ preview` and → calls it. */
  onPreviewTemplate?: (pick: TemplatePick) => void
  /** The blank-page list (KAN-276): the `rows` pane leads with `templates` — no head of its own, the glass opens straight on the `templates` group. */
  leadWithTemplates?: boolean
  yourTemplates?: readonly YourTemplate[]
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
  /** The DC's `size`: touch rows, a wider glass, a shorter list. @default 'desktop' */
  size?: PickerSize
}

export function SlashMenu({
  rows,
  query,
  anchor,
  side = 'bottom',
  label = 'blocks',
  onSelect,
  onClose,
  onPickTemplate,
  onPreviewTemplate,
  leadWithTemplates,
  yourTemplates,
  container,
  size = 'desktop',
}: SlashMenuProps) {
  const mobile = size === 'mobile'
  const chrome = SLASH_SIZES[size]
  const [pane, setPane] = useState<SlashPane>('rows')
  // Typing in the templates pane means narrowing blocks again: any query change
  // while there falls back to the rows.
  const [seenQuery, setSeenQuery] = useState(query)
  if (query !== seenQuery) {
    setSeenQuery(query)
    if (pane === 'templates') setPane('rows')
  }
  // The selection is keyed to what it was made against, so a new query or pane
  // starts at the first row without an effect writing state.
  const [sel, setSel] = useState({ pane, query, index: 0 })
  const entries =
    pane === 'templates'
      ? templateEntries(yourTemplates, mobile ? MOBILE_PREMADE_CAP : undefined)
      : leadWithTemplates
        ? blankRowEntries(rows, yourTemplates ?? [], query, mobile ? MOBILE_ROW_CAP : undefined)
        : rowEntries(rows, query, mobile ? MOBILE_ROW_CAP : undefined)
  const items = entries.filter((e): e is RowEntry => e.kind === 'row')
  const active = Math.min(
    sel.pane === pane && sel.query === query ? sel.index : 0,
    Math.max(0, items.length - 1)
  )
  const select = (index: number) => setSel({ pane, query, index })

  const pick = (item: RowEntry) => {
    if (item.template) onPickTemplate?.(item.template)
    else if (item.row?.submenu) setPane(item.row.submenu)
    else if (item.row) onSelect(item.row)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const item = items[active]
      let handled = true
      if (e.key === 'ArrowDown') select(Math.min(active + 1, items.length - 1))
      else if (e.key === 'ArrowUp') select(Math.max(active - 1, 0))
      else if (e.key === 'Escape') onClose()
      // Nothing matches and the person types a space: the words were prose, not a
      // command. Close, and let the space through — the field keeps all of it.
      else if (e.key === ' ' && pane === 'rows' && items.length === 0) {
        onClose()
        handled = false
      } else if (e.key === 'Enter' && item) pick(item)
      else if (e.key === 'ArrowRight' && item?.row?.submenu) setPane(item.row.submenu)
      else if (e.key === 'ArrowRight' && item?.template && onPreviewTemplate)
        onPreviewTemplate(item.template)
      else if (e.key === 'ArrowLeft' && pane === 'templates') setPane('rows')
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
  }, [active, pane])

  // A press outside the glass closes it — and keeps the typed text, like esc.
  // Capture phase so it beats inner handlers; the opening `/` is a keystroke, so
  // this never self-closes on open.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (glassRef.current && !glassRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const style = useAnchoredBox(anchor, side, chrome.widthPx)
  const foot = footItems(
    pane,
    query,
    items.length,
    onPreviewTemplate !== undefined,
    items[active]?.template !== undefined,
    leadWithTemplates
  )
  const indexOf = new Map(items.map((item, i) => [item, i]))

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={glassRef}
      tabIndex={-1}
      data-part="glass"
      data-kind="slash"
      data-pane={pane}
      className={`${side === 'top' ? GLASS_ABOVE : GLASS} ${chrome.width}`}
      style={style}
      // The caret stays on the `/` line: a mousedown on the glass itself (not a
      // row or button) would otherwise focus it, since `tabIndex={-1}` makes it
      // the nearest focusable ancestor of everything inside.
      onMouseDown={(e) => e.preventDefault()}
    >
      {pane === 'templates' && (
        <div data-part="head" className={chrome.head}>
          <span data-part="head-text" className={HEAD_TEXT}>
            page from template
          </span>
        </div>
      )}
      <div
        role="listbox"
        aria-label={pane === 'templates' ? 'page from template' : label}
        className={LIST}
      >
        {entries.map((entry, i) => {
          if (entry.kind === 'group') {
            return (
              <div
                role="presentation"
                key={`g-${entry.label}-${i}`}
                data-part="group"
                className={GROUP}
              >
                {entry.label}
              </div>
            )
          }
          if (entry.kind === 'note') {
            return (
              <div key="note" data-part="note" className={chrome.note}>
                {entry.text}
              </div>
            )
          }
          const at = indexOf.get(entry) ?? -1
          return (
            <Row
              key={entry.id}
              entry={entry}
              selected={at === active}
              size={size}
              onHover={() => select(at)}
              onPick={() => pick(entry)}
            />
          )
        })}
      </div>
      {foot.length > 0 && (
        <div data-part="foot" className={FOOT}>
          {foot.map((f) => (
            <span key={f}>{f}</span>
          ))}
          {pane === 'templates' && (
            <button
              type="button"
              className={`cursor-pointer rounded-sm hover:text-mn-text ${FOCUS_VISIBLE_RING}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPane('rows')}
            >
              ← blocks
            </button>
          )}
        </div>
      )}
    </div>,
    container ?? document.body
  )
}
