'use client'

/**
 * `PondPicker kind="glyph"` (KAN-248 3/4, chrome; 4/8, keys): the portal, the
 * glass at the kind's own size, the search head, the automatic row, the
 * recent and library sections, and the inherit footer note.
 *
 * Search, keys and picking (4/8): typing narrows `sections` through
 * `glyph-entries.ts`'s own `glyphSections`, and resets the active cell to the
 * first hit (or `automatic`, on no hits). ← → ↑ ↓ move a flattened
 * `[automatic, ...cells]` index — up/down cross in and out of the automatic
 * row at the grid's edges, left/right stay inside the grid. ↵ calls `onPick`
 * with the active cell's glyph (`null` for automatic); esc calls `onClose`
 * with nothing picked, same as `SourcePicker`'s document-capture listener so
 * the keys reach the glass even while the search input is focused. The ring
 * (`PICKED_RING`) still marks `current`, the already-applied pick; the active
 * row or cell (keyboard focus, not yet committed) gets its own flatter
 * highlight (`ACTIVE_HILITE`) — the DC's own `cell()` keeps the two separate
 * (`gl === gsel` vs `cur === gl`).
 *
 * Wiring (KAN-248 5/8): a press outside the glass also calls `onClose`,
 * `SourcePicker`'s own pattern — the host (the rail row's mark button) is
 * responsible for returning focus to itself once `onClose` fires.
 *
 * Every literal is `PondPicker.dc.html`'s `kind === 'glyph'` branch, read off
 * the script's own `renderVals()`. The glass is NOT the shared mono chrome
 * (`GLASS` in `picker-chrome.ts`): its padding, radius and background all
 * diverge for this one kind alone — a near-opaque glass, and a bottom-sheet
 * corner on mobile — so they are spelled out here the way `NewPondSheet.tsx`'s
 * `SHEET_GLASS` spells out its own kind-specific glass rather than bend the
 * shared one. The head, though, IS the shared mono head: the DC's own `head`
 * object for this kind is byte-identical to the generic one, just with an
 * extra 44px `minHeight` on mobile for the touch target — `SLASH_SIZES`
 * already carries that mobile variant, so it is reused rather than restated.
 *
 * The automatic row and the library grid are two different ARIA shapes on
 * purpose: automatic reads as one row among rows (`role="option"`, matching
 * every other picker's row), the sections below it are `role="grid"`s of
 * `role="row"`s of labelled `role="gridcell"`s — a grid, not a listbox,
 * because arrow keys move in two dimensions. A `role="listbox"` wraps both
 * (automatic plus every section) so `role="option"` has the ancestor it
 * needs and the search `<input>` has something to name: it is a real
 * `role="combobox"` with `aria-controls` pointing at that listbox, matching
 * `PondCommand.tsx`'s own input (:380-385, :438) — rows are real DOM rows
 * (flex, not CSS grid auto-flow), since a `display: contents` row would
 * carry the right geometry but drop its own role in some engines
 * (`PondMolecule.tsx`'s comment on the same tradeoff). The search field
 * keeps focus throughout and carries `aria-activedescendant`, rather than
 * moving DOM focus cell to cell.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/atoms/Icon'
import { AreaMark } from '@/components/atoms/AreaMark'
import { KindDot } from '@/components/atoms/PondAtom'
import { GLYPH_LIBRARY } from '@/lib/rail/glyph-library'

import {
  BOX_HEIGHT,
  FOOT,
  HEAD,
  HEAD_KEY,
  HEAD_TEXT,
  LIST,
  LIST_MAX_VH,
  NOTE,
  SLASH_SIZES,
} from './picker-chrome'
import { automaticRow, glyphSections, noMatchText } from './glyph-entries'
import { useAnchoredBox, type PickerAnchor, type PickerSide } from './use-anchored-box'

export type { AutomaticRow, GlyphCell, GlyphSection } from './glyph-entries'

export type GlyphPickerSize = 'desktop' | 'mobile'

/** The row the picker edits: an area's automatic glyph is title-derived, a page's is the kind dot. */
export interface GlyphPickerTarget {
  isArea: boolean
  title: string
}

export interface GlyphPickerProps {
  target: GlyphPickerTarget
  /** The glyph already picked, or `null` for `automatic`. */
  current: string | null
  /** The hue the mark paints in — the area's accent, or undefined for ink. */
  accent?: string
  /** The pond's recent glyphs, newest first. */
  recentGlyphs?: readonly string[]
  /** The area a non-area target's colour comes from — the foot note names it. Unused for an area target. */
  inheritsFrom: string
  /** The mark (or button) the glass hangs off. */
  anchor: PickerAnchor
  /** @default 'bottom' */
  side?: PickerSide
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
  /** The DC's `size`: a wider glass, 44px cells and a bottom-sheet corner. @default 'desktop' */
  size?: GlyphPickerSize
  /** ↵ on a cell, or on `automatic` (`null`). */
  onPick: (glyph: string | null) => void
  /** Esc — the host keeps what was there and returns focus to the mark. */
  onClose: () => void
}

/**
 * The kind's own glass — `PondPicker.dc.html` `kind === 'glyph'`: a near-opaque
 * gradient (not the shared `--mn-glass-bg`) over the shared border/shadow/blur,
 * following `NewPondSheet.tsx`'s `SHEET_GLASS` pattern for a kind that needs its
 * own recipe rather than the generic one.
 */
const GLYPH_GLASS =
  'motion-menu fixed z-[100] box-border flex flex-col gap-[1px] font-mono text-mn-text ' +
  'border border-white/90 ' +
  'bg-[linear-gradient(160deg,rgba(255,255,255,.96),rgba(255,255,255,.9))] ' +
  'shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_20px_54px_rgba(40,34,24,.14)] ' +
  'backdrop-blur-[24px] backdrop-saturate-[1.3] ' +
  'dark:border-[rgba(250,249,239,.09)] ' +
  'dark:bg-[linear-gradient(160deg,rgba(48,49,42,.97),rgba(48,49,42,.92))] ' +
  'dark:shadow-[inset_0_1px_0_rgba(250,249,239,.06),0_20px_54px_rgba(0,0,0,.42)]'

/** The ring a current pick (or `automatic`, with none) draws on its row or cell. */
const PICKED_RING = 'shadow-[inset_0_0_0_2px_var(--mn-text)]'
/** The keyboard-active row or cell's own background — separate from `PICKED_RING`, which marks the current pick. */
const ACTIVE_HILITE = 'bg-mn-text/[0.1]'

const SIZES = {
  desktop: {
    widthPx: 320,
    width: 'w-[320px]',
    glassPadding: 'p-[10px]',
    glassRadius: 'rounded-[20px]',
    headExtra: '',
    headPx: 40,
    autoRow: 'min-h-[34px] px-[8px] text-[13px]',
    autoSub: 'text-[10.5px]',
    gHead: 'p-[10px_2px_6px]',
    cell: 'size-[34px] rounded-[10px]',
    cellPx: 34,
    rowGap: 'gap-[4px]',
    rowGapPx: 4,
    cols: 8,
    inheritRow: 'p-[10px_2px_2px]',
    inheritRowPx: 36,
    inheritText: 'text-[10.5px]',
  },
  mobile: {
    widthPx: 390,
    width: 'w-[390px]',
    glassPadding: 'p-[10px_23px_34px]',
    glassRadius: 'rounded-[28px_28px_0_0]',
    headExtra: 'min-h-[44px] box-border',
    headPx: 46,
    autoRow: 'min-h-[44px] px-[10px] text-[15px]',
    autoSub: 'text-[12px]',
    gHead: 'p-[12px_2px_8px]',
    cell: 'size-[44px] rounded-[12px]',
    cellPx: 44,
    rowGap: 'gap-[6px]',
    rowGapPx: 6,
    cols: 7,
    inheritRow: 'p-[12px_2px_4px]',
    inheritRowPx: 42,
    inheritText: 'text-[12px]',
  },
} as const satisfies Record<
  GlyphPickerSize,
  {
    widthPx: number
    width: string
    glassPadding: string
    glassRadius: string
    headExtra: string
    headPx: number
    autoRow: string
    autoSub: string
    gHead: string
    cell: string
    cellPx: number
    rowGap: string
    rowGapPx: number
    cols: number
    inheritRow: string
    inheritRowPx: number
    inheritText: string
  }
>

/**
 * Everything in the glass BUT the list — head, the inherit row (non-area
 * targets only), foot, and the glass's own padding/border — hand-estimated
 * the same way `BOX_HEIGHT`'s own entries are. A close bound, not a DC
 * literal; this estimate's only job is the before-mount side choice
 * (`glyphPickerHeight` → `sideTowardFreeSpace`), where a close bound is fine
 * because nothing has rendered yet to measure. Once mounted, the glass bounds
 * its own box to `room` directly (an inline `maxHeight`) — no second estimate
 * of its chrome is needed.
 */
export function glyphPickerChrome(target: GlyphPickerTarget, size: GlyphPickerSize): number {
  const sizes = SIZES[size]
  const inheritPx = target.isArea ? 0 : sizes.inheritRowPx
  return sizes.headPx + inheritPx + BOX_HEIGHT.foot + BOX_HEIGHT.glass
}

/**
 * How tall the glass will render for a given target/size/recent-count, so the
 * host can choose which way it opens BEFORE the glass exists to measure —
 * mirrors `slashMenuHeight`'s own shape (`slash-entries.ts`): the list capped
 * at `LIST_MAX_VH`, plus `glyphPickerChrome`'s rows around it. This is the
 * CEILING the glass would need if the chosen side had unlimited room; the
 * mounted glass instead bounds its own box to `room` (`glyphPickerRoom`)
 * directly, once a side is chosen.
 */
export function glyphPickerHeight(
  target: GlyphPickerTarget,
  size: GlyphPickerSize,
  recentGlyphs: readonly string[],
  viewportHeight: number
): number {
  const sizes = SIZES[size]
  const sections = glyphSections('', recentGlyphs)
  const listPx =
    sizes.cellPx +
    sections.reduce(
      (height, section) =>
        height +
        BOX_HEIGHT.group +
        Math.ceil(section.cells.length / sizes.cols) * (sizes.cellPx + sizes.rowGapPx),
      0
    )
  return glyphPickerChrome(target, size) + Math.min(listPx, viewportHeight * LIST_MAX_VH)
}

/** The 4px gap `useAnchoredBox` keeps to its anchor, on the side the glass grows toward. */
const ANCHOR_GAP = 4

/**
 * The room the chosen side actually has, in viewport pixels — the same
 * `below`/`above` math `sideTowardFreeSpace` (`caret-anchor.ts`) already
 * applies to pick the side, read here for the side that WAS picked.
 */
export function glyphPickerRoom(
  anchorRect: Pick<DOMRect, 'top' | 'bottom'>,
  side: PickerSide,
  viewportHeight: number
): number {
  return side === 'top'
    ? anchorRect.top - ANCHOR_GAP
    : viewportHeight - anchorRect.bottom - ANCHOR_GAP
}

/** Splits a section's cells into fixed-width rows — `role="row"` needs real rows, not a flat grid. */
function chunkRows<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

export function GlyphPicker({
  target,
  current,
  accent,
  recentGlyphs,
  inheritsFrom,
  anchor,
  side = 'bottom',
  container,
  size = 'desktop',
  onPick,
  onClose,
}: GlyphPickerProps) {
  const sizes = SIZES[size]
  const mobile = size === 'mobile'
  const auto = automaticRow(target)
  const recent = recentGlyphs ?? []
  const [query, setQuery] = useState('')
  const sections = glyphSections(query, recent)
  const cells = sections.flatMap((section) => section.cells)
  const cellIndexOf = new Map(cells.map((cell, i) => [cell, i]))
  // Flattened as `[automatic, ...cells]` — index 0 is the automatic row, so a
  // cell's own slot is one past its index in `cells`.
  const [active, setActive] = useState(() => {
    const i = cells.findIndex((cell) => cell.glyph === current)
    return i === -1 ? 0 : i + 1
  })
  const listId = useId()
  const rowId = (i: number) => `${listId}-${i}`
  const noHits = query.trim() !== '' && cells.length === 0

  const handleQueryChange = (value: string) => {
    setQuery(value)
    const hits = glyphSections(value, recent).flatMap((section) => section.cells)
    setActive(hits.length ? 1 : 0)
  }

  const pickActive = () => {
    if (active === 0) {
      onPick(null)
      return
    }
    const cell = cells[active - 1]
    if (cell) onPick(cell.glyph)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ← → move the caret within the query when it still can — a control
      // that takes focus and then ignores it (`SourcePicker.tsx`'s own rule).
      // Only once the caret is pinned at the edge it would move past do the
      // same keys fall through to the grid.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const input = inputRef.current
        if (input && e.target === input) {
          const atStart = input.selectionStart === 0 && input.selectionEnd === 0
          const atEnd =
            input.selectionStart === input.value.length && input.selectionEnd === input.value.length
          if ((e.key === 'ArrowLeft' && !atStart) || (e.key === 'ArrowRight' && !atEnd)) return
        }
      }
      const cellIndex = active - 1
      let handled = true
      if (e.key === 'ArrowDown') {
        if (active === 0) setActive(cells.length ? 1 : 0)
        else {
          const next = cellIndex + sizes.cols
          if (next < cells.length) setActive(next + 1)
        }
      } else if (e.key === 'ArrowUp') {
        if (active !== 0) {
          const next = cellIndex - sizes.cols
          setActive(next >= 0 ? next + 1 : 0)
        }
      } else if (e.key === 'ArrowLeft') {
        if (active !== 0 && cellIndex > 0) setActive(cellIndex)
      } else if (e.key === 'ArrowRight') {
        if (active !== 0 && cellIndex + 1 < cells.length) setActive(cellIndex + 2)
      } else if (e.key === 'Enter') pickActive()
      else if (e.key === 'Escape') onClose()
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  const inputRef = useRef<HTMLInputElement>(null)
  // Keyboard entry (Tab to the mark, ↵ to open) lands focus on the mark
  // button, not the glass — move it to the search field so typing narrows
  // the grid immediately, matching `RelationValue.tsx`'s own open-focus.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const glassRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    glassRef.current?.querySelector(`#${CSS.escape(`${listId}-${active}`)}`)?.scrollIntoView({
      block: 'nearest',
    })
  }, [active, listId])

  // A press outside the glass closes it — and keeps what was there, like esc
  // (`SourcePicker`'s own pattern).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (glassRef.current && !glassRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  // `selName`, `PondPicker.dc.html`'s `gsel === 'auto' ? 'automatic' : gsel`:
  // the foot always names the active row or cell, never the query or the
  // (possibly different) already-picked `current`.
  const selName = active === 0 ? 'automatic' : (cells[active - 1]?.label ?? '')
  const foot = mobile ? [] : [selName, '←→↑↓ move', '↵ pick', 'esc close'].filter(Boolean)
  const style = useAnchoredBox(anchor, side, sizes.widthPx)

  // The room the CHOSEN side actually has, so the glass can be bounded to it
  // directly (its own inline `maxHeight`, below) — `useAnchoredBox` positions
  // the glass off this same anchor rect, but never caps anything, which is
  // how a glass taller than its room ran past the fold (position: fixed, so
  // nothing below scrolls it back into view). Read `window.innerHeight` only
  // inside the effect, never during render — this component can still render
  // (as `null`) on the server.
  const [room, setRoom] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const el = anchor && 'current' in anchor ? anchor.current : anchor
    if (!el) return
    const update = () =>
      setRoom(glyphPickerRoom(el.getBoundingClientRect(), side, window.innerHeight))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, side])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={glassRef}
      tabIndex={-1}
      data-part="glass"
      data-kind="glyph"
      className={`${GLYPH_GLASS} ${sizes.width} ${sizes.glassPadding} ${sizes.glassRadius} ${
        side === 'top' ? '[--motion-menu-origin:bottom_left]' : ''
      }`}
      style={room === undefined ? style : { ...style, maxHeight: room }}
    >
      <div
        data-part="head"
        className={`${mobile ? SLASH_SIZES.mobile.head : HEAD} ${sizes.headExtra}`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-none text-mn-text-secondary"
          aria-hidden
        >
          <circle cx="6" cy="6" r="3.8" />
          <path d="M9 9l3 3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-label="search glyphs"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rowId(active)}
          placeholder={`search ${GLYPH_LIBRARY.length} glyphs`}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className={`${HEAD_TEXT} min-w-0 flex-1 bg-transparent outline-none placeholder:text-mn-text-secondary`}
        />
        <span data-part="head-key" className={HEAD_KEY}>
          esc
        </span>
      </div>

      <div
        id={listId}
        data-part="list"
        role="listbox"
        aria-label="glyphs"
        className={`${LIST} min-h-0 flex-1`}
      >
        <div
          id={rowId(0)}
          data-part="automatic"
          role="option"
          aria-selected={current === null}
          onMouseEnter={() => setActive(0)}
          onClick={() => onPick(null)}
          className={`flex items-center gap-[10px] rounded-[10px] font-sans ${sizes.autoRow} ${
            active === 0 ? ACTIVE_HILITE : ''
          } ${current === null ? PICKED_RING : ''}`}
        >
          <span className="flex size-[15px] flex-none items-center justify-center">
            {auto.isDot ? (
              <KindDot accent={accent} />
            ) : (
              <AreaMark glyph={auto.glyph ?? ''} color={accent ?? 'var(--mn-text)'} />
            )}
          </span>
          <span className="font-medium">automatic</span>
          <span
            className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-mn-text-secondary ${sizes.autoSub}`}
          >
            {auto.note}
          </span>
        </div>

        {noHits ? (
          <div data-part="note" className={mobile ? SLASH_SIZES.mobile.note : NOTE}>
            {noMatchText(query)}
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.label} data-part="section">
              <div
                className={`flex items-baseline justify-between font-sans text-[10.5px] font-medium tracking-[0.1em] text-mn-text-secondary uppercase ${sizes.gHead}`}
              >
                <span>{section.label}</span>
                <span className="font-mono tracking-normal text-mn-text-secondary normal-case">
                  {section.count}
                </span>
              </div>
              <div role="grid" aria-label={section.label} className={`flex flex-col ${sizes.rowGap}`}>
                {chunkRows(section.cells, sizes.cols).map((row, ri) => (
                  <div key={ri} role="row" className={`flex ${sizes.rowGap}`}>
                    {row.map((cell) => {
                      const slot = (cellIndexOf.get(cell) ?? -1) + 1
                      const isActive = active === slot
                      return (
                        <span
                          key={cell.glyph}
                          id={rowId(slot)}
                          role="gridcell"
                          aria-label={cell.label}
                          aria-selected={cell.glyph === current}
                          onMouseEnter={() => setActive(slot)}
                          onClick={() => onPick(cell.glyph)}
                          className={`flex shrink-0 items-center justify-center ${sizes.cell} ${
                            isActive
                              ? ACTIVE_HILITE
                              : cell.glyph === current
                                ? 'bg-mn-text/[0.05]'
                                : 'bg-mn-text/[0.04]'
                          } ${cell.glyph === current ? PICKED_RING : ''}`}
                          style={accent ? { color: accent } : undefined}
                        >
                          <Icon name={cell.glyph} size={15} />
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {!target.isArea && (
        <div
          data-part="inherit"
          className={`flex items-baseline justify-between gap-[12px] mt-[8px] border-t border-mn-text/[0.09] font-sans text-[10.5px] font-medium tracking-[0.1em] text-mn-text-secondary uppercase ${sizes.inheritRow}`}
        >
          <span>colour</span>
          <span
            className={`text-right font-mono tracking-normal text-mn-text-meta normal-case ${sizes.inheritText}`}
          >
            {`from ${inheritsFrom}. set on the area.`}
          </span>
        </div>
      )}

      {foot.length > 0 && (
        <div data-part="foot" className={FOOT}>
          {foot.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      )}
    </div>,
    container ?? document.body
  )
}
