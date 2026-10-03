'use client'

/**
 * The ⌘K palette — `PondPicker kind="palette"` (#279, child b of #226). A
 * floating glass card high on the screen, over a washed-back page, not a dialog:
 * `Pond 02` 2g — "same glass as the composer, placed high on the screen. The page
 * behind is washed back so the palette reads as a pause, not a panel."
 *
 * Every literal here is `wayfinder/board-values.generated.json`
 * `.components.PondPicker.variants["kind=palette|theme=paper"]` (the board's own
 * `renderVals()`), never measured off a served frame:
 *
 *   glass   520 · border-box · padding 10 · radius 20 · mono · ink · column · gap 2
 *           → `.mn-glass`: the board's light recipe byte for byte; dark is the
 *             Shell's through the same class (ADR 0004 ruling 11 — no second recipe)
 *   wash    paper at .62 behind it (`Pond 06.13`'s composed frame); dark takes
 *           the dark ground at the same alpha, since no dark frame draws one
 *   head    flex · gap 10 · 10px 12px 14px · mb 4 · 1px ink .09 · mono 14
 *           waves glyph · [scope chip] · query · caret · `esc` at 10.5 / ink .8
 *   scope   1px 6px · radius 6 · ink .07 · ink .8
 *   group   8px 12px 4px · SANS 500 · 10.5 · .1em · uppercase · ink .68 — the page
 *           eyebrow (`kicker.ts`), not the `/` menu's lowercase mono label
 *   note    10px 12px · mono 12 · 1.55 · ink .8 · text-wrap pretty
 *   foot    flex wrap · gap 14 · 10px 12px 4px · mt 4 · 1px ink .09 · 10.5 · ink .68
 *
 * The rows are `palette-row.tsx` (sans — ADR 0004 §4) and what they list is
 * `palette-entries.ts`. The caret is the input's own: the board's `caret` span
 * stands in for one on a static frame. The input keeps focus and carries
 * `aria-activedescendant`; a row is an `option`, never a button. No outline ring
 * lands on the input — the caret and the selected row's wash are its focus — so
 * the ring is on `esc` alone, from the one owner. Template literals, not `cn()`
 * (#252). A plain portal, not base-ui's Popover (#278 measured its jsdom cost).
 */

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { Icon } from '@/components/atoms/Icon'
import { pageEyebrowClass } from '@/components/atoms/kicker'

import {
  PALETTE_FOOT,
  paletteEntries,
  type PaletteItem,
  type PaletteScope,
} from './palette-entries'
import { PaletteRow, type PaletteRowEntry } from './palette-row'

export type { PaletteItem, PaletteKind, PaletteScope } from './palette-entries'

export interface CommandPaletteProps {
  items: readonly PaletteItem[]
  onSelect: (item: PaletteItem) => void
  /** esc, ⌘K again, or a press outside. */
  onClose: () => void
  /** The rail's selected page and its children (2g `scoped`); ⌫ on an empty line clears it. */
  scope?: PaletteScope | null
  /** For `new page “…” under <pond>`. @default 'life' */
  pondName?: string
  /** Opens with this already typed — stories render the board's frames. */
  defaultQuery?: string
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
}

const WASH = 'fixed inset-0 z-[99] bg-mn-surface/[0.62]'
const GLASS =
  'mn-glass rounded-mn-card motion-menu fixed left-[max(12px,calc(50%-260px))] top-[110px] z-[100] box-border flex w-[520px] max-w-[calc(100vw-24px)] flex-col gap-[2px] p-[10px] font-mono text-mn-text'
const HEAD =
  'mb-[4px] flex items-center gap-[10px] border-b border-mn-text/[0.09] px-[12px] pt-[10px] pb-[14px] font-mono text-[14px]'
const INPUT =
  'min-w-0 flex-1 bg-transparent font-mono text-[14px] text-mn-text caret-mn-text outline-none placeholder:text-mn-text-secondary'
const SCOPE =
  'whitespace-nowrap rounded-[6px] bg-mn-text/[0.07] px-[6px] py-[1px] text-mn-text-meta'
const HEAD_KEY = `${FOCUS_VISIBLE_RING} rounded-[4px] font-mono text-[10.5px] text-mn-text-meta`
const GROUP = `${pageEyebrowClass} px-[12px] pt-[8px] pb-[4px]`
const NOTE =
  'px-[12px] py-[10px] font-mono text-[12px] leading-[1.55] text-mn-text-meta [text-wrap:pretty]'
const FOOT =
  'mt-[4px] flex flex-wrap gap-[14px] border-t border-mn-text/[0.09] px-[12px] pt-[10px] pb-[4px] text-[10.5px] text-mn-text-secondary'

export function CommandPalette({
  items,
  onSelect,
  onClose,
  scope: initialScope = null,
  pondName = 'life',
  defaultQuery = '',
  container,
}: CommandPaletteProps) {
  const listId = useId()
  const [query, setQuery] = useState(defaultQuery)
  const [scope, setScope] = useState(initialScope)
  // The selection is keyed to what it was made against, so a new query starts
  // at the first row without an effect writing state.
  const [sel, setSel] = useState({ query, scope, index: 0 })
  const entries = paletteEntries(items, query, { scope, pondName })
  const rows = entries.filter((e): e is PaletteRowEntry => e.kind === 'row')
  const active = Math.min(
    sel.query === query && sel.scope === scope ? sel.index : 0,
    Math.max(0, rows.length - 1)
  )
  const select = (index: number) => setSel({ query, scope, index })
  const rowId = (i: number) => `${listId}-${i}`

  const inputRef = useRef<HTMLInputElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => {
    glassRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, entries.length])

  // esc closes; ⌘K while open closes (the toggle). Capture phase, so neither
  // reaches the page's own handlers. A press outside the glass closes too.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const toggle = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k'
      if (e.key !== 'Escape' && !toggle) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    function onPointerDown(e: PointerEvent) {
      if (glassRef.current && !glassRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose])

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') select(Math.min(active + 1, rows.length - 1))
    else if (e.key === 'ArrowUp') select(Math.max(active - 1, 0))
    else if (e.key === 'Enter') {
      if (rows[active]) onSelect(rows[active].item)
    } else if (e.key === 'Backspace' && query === '' && scope) setScope(null)
    else return
    e.preventDefault()
  }

  if (typeof document === 'undefined') return null
  const indexOf = new Map(rows.map((r, i) => [r, i]))
  return createPortal(
    <>
      <div data-part="wash" aria-hidden className={WASH} />
      <div ref={glassRef} data-part="glass" data-kind="palette" className={GLASS}>
        <div data-part="head" className={HEAD}>
          <Icon name="waves-02" />
          {scope && (
            <span data-part="scope" className={SCOPE}>
              in {scope.label}:
            </span>
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={scope ? '' : 'jump to a page, or > for actions'}
            className={INPUT}
            role="combobox"
            aria-label="command palette"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows[active] ? rowId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" data-part="head-key" className={HEAD_KEY} onClick={onClose}>
            esc
          </button>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="pages, records and actions"
          className="flex max-h-[60vh] flex-col gap-[2px] overflow-y-auto"
        >
          {entries.map((entry, i) => {
            if (entry.kind === 'group')
              return (
                <div key={`g-${i}`} data-part="group" className={GROUP}>
                  {entry.label}
                </div>
              )
            if (entry.kind === 'note')
              return (
                <div key={`n-${i}`} data-part="note" className={NOTE}>
                  {entry.text}
                </div>
              )
            const at = indexOf.get(entry) ?? -1
            return (
              <PaletteRow
                key={entry.item.id}
                id={rowId(at)}
                entry={entry}
                selected={at === active}
                onHover={() => select(at)}
                onPick={() => onSelect(entry.item)}
              />
            )
          })}
        </div>
        <div data-part="foot" className={FOOT}>
          {PALETTE_FOOT.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>
    </>,
    container ?? document.body
  )
}
