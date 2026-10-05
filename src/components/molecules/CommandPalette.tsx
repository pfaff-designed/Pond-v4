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
 *   glass   520 (mobile 360) · border-box · padding 10 · radius 20 · mono · ink ·
 *           column · gap 2 → `.mn-glass`: the board's light recipe byte for byte;
 *           dark is the Shell's through the same class (ADR 0004 ruling 11 — no
 *           second recipe)
 *   place   `Pond 06.13`'s import: top 110 · left 50% · translateX(-40%). Below
 *           `md` it is centred instead — -40% of 360 pushes the glass past a
 *           narrow viewport's edge, and the 12px clamp is `max-width`
 *   wash    paper at .62 behind it (`Pond 06.13`'s composed frame); dark takes
 *           the dark ground at the same alpha, since no dark frame draws one
 *   head    flex · gap 10 · 10px 12px 14px · mb 4 · 1px ink .09 · mono 14 (mobile 16)
 *           waves glyph · [scope chip] · query · caret · `esc` at 10.5 / ink .8
 *   scope   1px 6px · radius 6 · ink .07 · ink .8
 *   group   8px 12px 4px · SANS 500 · 10.5 · .1em · uppercase · ink .68 — the page
 *           eyebrow (`kicker.ts`), not the `/` menu's lowercase mono label
 *   note    10px 12px · mono 12 (mobile 13) · 1.55 · ink .8 · text-wrap pretty
 *   foot    flex wrap · gap 14 · 10px 12px 4px · mt 4 · 1px ink .09 · 10.5 · ink .68;
 *           mobile lists only `PALETTE_FOOT_MOBILE`
 *
 * The rows are `palette-row.tsx` (sans — ADR 0004 §4) and what they list is
 * `palette-entries.ts`. The caret is the input's own: the board's `caret` span
 * stands in for one on a static frame. The input keeps focus and carries
 * `aria-activedescendant`; a row is an `option`, never a button. No outline ring
 * lands on the input — the caret and the selected row's wash are its focus — so
 * the ring is on `esc` alone, from the one owner. Template literals, not `cn()`
 * (#252). A plain portal, not base-ui's Popover (#278 measured its jsdom cost).
 */

import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { Icon } from '@/components/atoms/Icon'
import { pageEyebrowClass } from '@/components/atoms/kicker'

import {
  PALETTE_FOOT,
  PALETTE_FOOT_MOBILE,
  paletteEntries,
  type PaletteItem,
  type PaletteScope,
} from './palette-entries'
import { PaletteRow, type PaletteRowEntry } from './palette-row'

export type { PaletteItem, PaletteKind, PaletteScope } from './palette-entries'

export interface CommandPaletteProps {
  items: readonly PaletteItem[]
  onSelect: (item: PaletteItem) => void
  /** esc or a press outside. ⌘K is the shell's: `ShellCommands` owns opening and closing. */
  onClose: () => void
  /** The rail's selected page and its children (2g `scoped`); ⌫ on an empty line clears it. */
  scope?: PaletteScope | null
  /** For `pages in <pond>`. @default 'life' */
  pondName?: string
  /** Where `new page “…”` files — the host names the page it hands the New page dialog. @default pondName */
  parentTitle?: string
  /** The `opened` state's `suggested` actions, when the host can infer them (#285). */
  suggested?: readonly PaletteItem[]
  /** The query as it changes — how the host learns what to search records for. */
  onQueryChange?: (query: string) => void
  /** Opens with this already typed — stories render the board's frames. */
  defaultQuery?: string
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
  /**
   * SHEET MODE — `Pond 06.09` (`6i`) frame 3.
   *
   * Picking a page action does not open a second surface over the palette: the
   * palette BECOMES the sheet in place, keeping its glass, its position and its
   * head. So the listbox is replaced by `body`, and the head's input stops being
   * a combobox and becomes the sheet's one field.
   *
   * The host owns the field's value, because the same value is the sheet's
   * subject — one owner, read twice, never derived in two places.
   */
  sheet?: PaletteSheet | null
}

export interface PaletteSheet {
  /** Replaces the listbox, inside the same glass. */
  body: ReactNode
  /** The head input's value — the sheet's one field. */
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** ⏎ in the field. */
  onSubmit: () => void
  /** Names the field for assistive tech, since it is no longer "command palette". */
  label: string
}

const WASH = 'fixed inset-0 z-[99] bg-mn-surface/[0.62]'
// Centred near the top, the glass grows from its top edge's middle; `.motion-menu`
// reads this origin and would otherwise fall back to top left (the composer's
// mirror case, #278).
const GLASS =
  'mn-glass rounded-mn-card motion-menu [--motion-menu-origin:top_center] fixed left-1/2 top-[110px] z-[100] box-border flex w-[360px] max-w-[calc(100vw-24px)] -translate-x-1/2 flex-col md:w-[520px] md:-translate-x-[40%] gap-[2px] p-[10px] font-mono text-mn-text'
const HEAD =
  'mb-[4px] flex items-center gap-[10px] border-b border-mn-text/[0.09] px-[12px] pt-[10px] pb-[14px] font-mono text-[16px] md:text-[14px]'
const INPUT =
  'min-w-0 flex-1 bg-transparent font-mono text-[16px] text-mn-text md:text-[14px] caret-mn-text outline-none placeholder:text-mn-text-secondary'
const SCOPE =
  'whitespace-nowrap rounded-[6px] bg-mn-text/[0.07] px-[6px] py-[1px] text-mn-text-meta'
const HEAD_KEY = `${FOCUS_VISIBLE_RING} rounded-[4px] font-mono text-[10.5px] text-mn-text-meta`
const GROUP = `${pageEyebrowClass} px-[12px] pt-[8px] pb-[4px]`
const NOTE =
  'px-[12px] py-[10px] font-mono text-[13px] leading-[1.55] text-mn-text-meta [text-wrap:pretty] md:text-[12px]'
const FOOT =
  'mt-[4px] flex flex-wrap gap-[14px] border-t border-mn-text/[0.09] px-[12px] pt-[10px] pb-[4px] text-[10.5px] text-mn-text-secondary'

export function CommandPalette({
  items,
  onSelect,
  onClose,
  scope: initialScope = null,
  pondName = 'life',
  parentTitle,
  suggested,
  defaultQuery = '',
  onQueryChange,
  container,
  sheet = null,
}: CommandPaletteProps) {
  const listId = useId()
  const [query, setQuery] = useState(defaultQuery)
  const [scope, setScope] = useState(initialScope)
  // The selection is keyed to what it was made against, so a new query starts
  // at the first row without an effect writing state.
  const [sel, setSel] = useState({ query, scope, index: 0 })
  const entries = paletteEntries(items, query, { scope, pondName, parentTitle, suggested })
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

  // esc closes, in the capture phase so it never reaches the page's own handlers.
  // A press outside the glass closes too. ⌘K is not handled here — see `onClose`.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
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

  function handleInput(value: string) {
    if (sheet) return sheet.onValueChange(value)
    setQuery(value)
    onQueryChange?.(value)
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // In sheet mode the field is a name, not a query: ⏎ saves, and the list
    // keys (arrows, ⌫-clears-scope) have nothing to act on.
    if (sheet) {
      if (e.key === 'Enter') {
        sheet.onSubmit()
        e.preventDefault()
      }
      return
    }
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
            value={sheet ? sheet.value : query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={
              sheet ? (sheet.placeholder ?? '') : scope ? '' : 'jump to a page, or > for actions'
            }
            className={INPUT}
            // Sheet mode is a plain text field — there is no list to own, so the
            // combobox role and its aria wiring would describe something absent.
            role={sheet ? undefined : 'combobox'}
            aria-label={sheet ? sheet.label : 'command palette'}
            aria-expanded={sheet ? undefined : 'true'}
            aria-controls={sheet ? undefined : listId}
            aria-autocomplete={sheet ? undefined : 'list'}
            aria-activedescendant={sheet || !rows[active] ? undefined : rowId(active)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" data-part="head-key" className={HEAD_KEY} onClick={onClose}>
            esc
          </button>
        </div>
        {sheet ? (
          <div data-part="sheet">{sheet.body}</div>
        ) : (
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
        )}
        {/* The foot's `↑↓ move · ↵ open` hints describe the LIST. In sheet mode
            there is no list, and the board draws the sheet's own buttons there
            instead, so the hints would be describing something absent. */}
        {!sheet && (
          <div data-part="foot" className={FOOT}>
            {PALETTE_FOOT.map((f) => (
              <span
                key={f}
                className={PALETTE_FOOT_MOBILE.includes(f) ? undefined : 'max-md:hidden'}
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </>,
    container ?? document.body
  )
}
