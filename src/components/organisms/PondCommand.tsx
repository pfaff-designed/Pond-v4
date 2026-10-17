'use client'

/**
 * The breadcrumb and the ⌘K palette as ONE element — `PondCommand` (`Pond 02` 2g,
 * `Pond 05` 5al, `command-palette.md`). At rest it is the path of the page in
 * view; ⌘K, Ctrl+K or a click on it grows it IN PLACE into one list of pages,
 * records and actions — `PondPicker kind="palette"` inside. No modal, no portal,
 * no scrim, and nothing dims: the page stays exactly where it was.
 *
 * Every literal is `PondCommand.dc.html`'s, read inline:
 *
 *   box     h 40 → 40 + body · radius 20, constant · `.mn-glass` (the board's
 *           light recipe; dark through the same class) · w restW → 560, where
 *           restW = the path layer + 124 · below `md` it opens to `PondPicker`'s
 *           `mob` 360, never closer than 12px to the viewport's edges
 *   glyph   12 × 12 at 14, 14 · the area's mark, in its role's colour (ink when
 *           none) · never moves
 *   path    left 36 · h 38 · gap 10 · 11 · .04em · ancestors ink .68 · › ink .8 ·
 *           the page full ink 500 · then a 1 × 14 rule at ink .09
 *   mode    22 × 22 at right 56, top 9 · a 13px half-disc at 1.4 · ink .68
 *   chip    38 × 22 at right 8, top 9 · radius 999 · ink .07 · ink .68 · sans 500 ·
 *           11 · .04em · `⌘K` until halfway, then `esc`
 *   input   left 36 · right 88 · h 38 · sans 500 13.5, the page rows' type — the board's
 *           mono 14 read larger than the rows (mobile 16, so iOS does not zoom)
 *   body    left −1 · top 39 · 560 · a hairline at ink .09 inset 10 · rows 6px 10px 0,
 *           gap 2 · foot gap 14 · 10px 22px 14px · mt 6 · rule ink .09 · mono 10.5 ·
 *           ink .68
 *   hover   at rest only: lifts 1px, the shadow deepens · 150ms
 *
 * The morph is one eased value, `--e`, written on the box by `useMorph`. Every
 * animated property is a CSS function of it (`MORPH`), so a frame costs no React
 * render; the glyph, the toggle and the chip never move, and nothing scales.
 *
 * The rows are `palette-row.tsx` and what they list is `palette-entries.ts`. The
 * input keeps focus and carries `aria-activedescendant`; a row is an `option`.
 * No ring lands on the input (the caret and the selected row's wash are its
 * focus), so the ring is on the controls alone, from the one owner. ⌘K is the
 * host's (`ShellCommands`): this element listens for esc and a press outside
 * only while open.
 */

import type { CSSProperties, ReactNode } from 'react'
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import { Icon } from '@/components/atoms/Icon'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import {
  PALETTE_FOOT,
  PALETTE_FOOT_MOBILE,
  paletteEntries,
  type PaletteItem,
  type PaletteScope,
} from '@/components/molecules/palette-entries'
import { PaletteRow, type PaletteRowEntry } from '@/components/molecules/palette-row'
import type { CommandPath } from '@/lib/pages/command-path'
import { markAccent } from '@/lib/rail/glyph-library'
import { useMorph } from '@/lib/motion/use-morph'
import { useMode } from '@/lib/theme/mode'

export type { PaletteItem, PaletteKind, PaletteScope } from '@/components/molecules/palette-entries'

/**
 * SHEET MODE — `Pond 06.09` (`6i`) frame 3. Picking a page action does not open
 * a second surface: the open box BECOMES the sheet, keeping its glass and its
 * place. The list is replaced by `body`, and the input stops being a combobox
 * and becomes the sheet's one field, whose value the host owns.
 */
export interface PaletteSheet {
  body: ReactNode
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** ⏎ in the field. */
  onSubmit: () => void
  /** Names the field for assistive tech, since it is no longer "command palette". */
  label: string
}

export interface PondCommandProps {
  /** What it shows at rest. */
  path: CommandPath
  open: boolean
  /** A click on the box opens; esc, a press outside and the `esc` chip close. */
  onOpenChange: (open: boolean) => void
  items: readonly PaletteItem[]
  /** ⏎ or a click on a row. The host closes. */
  onSelect: (item: PaletteItem) => void
  /** The rail's selected page and its children (2g `scoped`); ⌫ on an empty line clears it. */
  scope?: PaletteScope | null
  /** For `pages in <pond>`. @default 'life' */
  pondName?: string
  /** Where `new page “…”` files. @default pondName */
  parentTitle?: string
  /** The `opened` state's `suggested` actions, when the host can infer them (#285). */
  suggested?: readonly PaletteItem[]
  /** False while the composer is out of sight: no `ask pond about “q”` row. @default true */
  ask?: boolean
  /** The query as it changes — how the host learns what to search records for. */
  onQueryChange?: (query: string) => void
  /** The query it first opens with — stories draw the board's frames. */
  defaultQuery?: string
  sheet?: PaletteSheet | null
  /** Freezes the morph at this t (0 rest → 1 open) — the board's still frames. */
  at?: number
  /** Placement. The shell centres it at its top; a story sets it in the flow. */
  className?: string
  /** Fires when arrowing/typing lands on a new page row (KAN-388) — the host prefetches it. */
  onActiveItemChange?: (item: PaletteItem) => void
}

const ramp = (from: number, span: number) => `clamp(0, calc((var(--e, 0) - ${from}) / ${span}), 1)`

const MORPH = {
  box: {
    width: 'calc(var(--rest-w, 240px) + (var(--open-w) - var(--rest-w, 240px)) * var(--e, 0))',
    height: 'calc(40px + var(--body-h, 0px) * var(--e, 0))',
  },
  path: { opacity: 'clamp(0, calc(1 - var(--e, 0) / 0.35), 1)' },
  input: { opacity: ramp(0.25, 0.4) },
  body: { opacity: ramp(0.3, 0.3) },
  keys: { opacity: ramp(0.6, 0.4) },
} satisfies Record<string, CSSProperties>

/**
 * Row i rises 4px into place, .035 behind the row above it. A start past .6 would
 * leave the row short of full ink at e = 1, so the stagger stops there.
 */
const enter = (i: number): CSSProperties => {
  const k = ramp(Number(Math.min(0.45 + 0.035 * i, 0.6).toFixed(3)), 0.4)
  return { opacity: k, transform: `translateY(calc((1 - ${k}) * 4px))` }
}

/** The glyph, the 36px it sits in, and the 88 the toggle and the chip take. */
const REST_CHROME_PX = 124

const BOX =
  'mn-glass relative box-border overflow-clip rounded-[20px] font-sans leading-[normal] text-mn-text [--open-w:min(360px,calc(100vw_-_24px))] md:[--open-w:560px]'
const LIFT =
  'cursor-pointer transition-[transform,box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-mn)] hover:-translate-y-px hover:[box-shadow:inset_0_1px_0_rgba(255,255,255,.7),0_24px_60px_rgba(40,34,24,.18)] dark:hover:[box-shadow:var(--mn-glass-shadow)]'
const OPENER = `${FOCUS_VISIBLE_RING} absolute inset-0 rounded-[20px] text-left`
const PATH =
  'absolute top-0 left-[36px] flex h-[38px] w-max max-w-[calc(var(--open-w)_-_124px)] items-center gap-[10px] whitespace-nowrap text-[11px] tracking-[.04em]'
const MODE = `${FOCUS_VISIBLE_RING} absolute top-[9px] right-[56px] flex size-[22px] items-center justify-center rounded-full text-mn-text-secondary`
const CHIP =
  'absolute top-[9px] right-[8px] flex h-[22px] w-[38px] items-center justify-center rounded-full bg-mn-text/[0.07] font-sans text-[11px] font-medium tracking-[.04em] text-mn-text-secondary'
const HEAD =
  'absolute top-0 right-[88px] left-[36px] flex h-[38px] items-center gap-[10px] font-sans text-[16px] md:text-[13.5px]'
const INPUT =
  'w-full min-w-0 bg-transparent p-0 font-sans text-[16px] font-medium tracking-[0] text-mn-text caret-mn-text outline-none placeholder:text-mn-text-secondary md:text-[13.5px]'
const SCOPE =
  'whitespace-nowrap rounded-[6px] bg-mn-text/[0.07] px-[6px] py-[1px] text-mn-text-meta'
const BODY = 'absolute top-[39px] left-[-1px] w-[var(--open-w)]'
const LIST = 'flex max-h-[60vh] flex-col gap-[2px] overflow-y-auto px-[10px] pt-[6px]'
const GROUP = `${pageEyebrowClass} px-[12px] pt-[8px] pb-[4px]`
const NOTE = 'px-[12px] py-[10px] font-mono text-[13px] text-mn-text-meta md:text-[12px]'
const FOOT =
  'mt-[6px] flex flex-wrap gap-[14px] border-t border-mn-text/[0.09] px-[22px] pt-[10px] pb-[14px] font-mono text-[10.5px] text-mn-text-secondary'

export function PondCommand({
  path,
  open,
  onOpenChange,
  items,
  onSelect,
  scope: initialScope = null,
  pondName = 'life',
  parentTitle,
  suggested,
  ask = true,
  onQueryChange,
  defaultQuery = '',
  sheet = null,
  at,
  className = 'relative w-max',
  onActiveItemChange,
}: PondCommandProps) {
  const listId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const { half, atRest } = useMorph(boxRef, open, at)
  const live = open || !atRest
  const { mode, toggleMode } = useMode()
  const markCol = markAccent(path.role)

  const [query, setQuery] = useState(defaultQuery)
  const [scope, setScope] = useState(initialScope)
  // The selection is keyed to what it was made against, so a new query starts
  // at the first row without an effect writing state.
  const [sel, setSel] = useState({ query, scope, index: 0 })

  // Every opening starts clean: no query, the first row, the scope the host hands.
  const [openedAs, setOpenedAs] = useState(open)
  if (openedAs !== open) {
    setOpenedAs(open)
    if (open) {
      setQuery('')
      setScope(initialScope)
      setSel({ query: '', scope: initialScope, index: 0 })
    }
  }

  // While it closes, the list it is closing over stays put: the host may already
  // have dropped it, and a list that empties mid-collapse would snap the height.
  const [held, setHeld] = useState({ items, sheet })
  if (open && (held.items !== items || held.sheet !== sheet)) setHeld({ items, sheet })
  const shownItems = open ? items : held.items
  const shownSheet = open ? sheet : held.sheet

  const entries = paletteEntries(shownItems, query, {
    scope,
    pondName,
    parentTitle,
    suggested,
    ask,
  })
  const rows = entries.filter((e): e is PaletteRowEntry => e.kind === 'row')
  const active = Math.min(
    sel.query === query && sel.scope === scope ? sel.index : 0,
    Math.max(0, rows.length - 1)
  )
  const select = (index: number) => setSel({ query, scope, index })
  const rowId = (i: number) => `${listId}-${i}`

  // KAN-388: the host warms whatever page row the keyboard/typing lands on next —
  // keyed on the id alone so a re-render that leaves the active row unchanged
  // (a keystroke that doesn't move the selection) never re-fires the prefetch.
  const activeItem = rows[active]?.item
  useEffect(() => {
    if (activeItem?.kind === 'page' || activeItem?.kind === 'database')
      onActiveItemChange?.(activeItem)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id alone, see note above
  }, [activeItem?.id])

  const pathRef = useRef<HTMLSpanElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // restW and the open height are measured, then handed to CSS as variables.
  useLayoutEffect(() => {
    const box = boxRef.current
    const pathLayer = pathRef.current
    if (!box || !pathLayer) return
    const measure = () => {
      box.style.setProperty('--rest-w', `${pathLayer.offsetWidth + REST_CHROME_PX}px`)
      if (bodyRef.current) box.style.setProperty('--body-h', `${bodyRef.current.offsetHeight}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pathLayer)
    if (bodyRef.current) observer.observe(bodyRef.current)
    return () => observer.disconnect()
  }, [live, boxRef])

  useEffect(() => onQueryChange?.(query), [query, onQueryChange])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true })
      return
    }
    const focused = document.activeElement
    if (focused instanceof HTMLElement && boxRef.current?.contains(focused)) focused.blur()
  }, [open, boxRef])

  useEffect(() => {
    bodyRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, entries.length])

  // esc closes, in the capture phase so it never reaches the page's own handlers;
  // a press outside the box closes too.
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onOpenChange(false)
    }
    const handlePointerDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('keydown', handleKey, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKey, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, onOpenChange, boxRef])

  // `atRest` lags `open` by a frame, so both are read: a row's click bubbling up
  // in the first frame of an opening must not ask to open again.
  const handleBoxClick = () => {
    if (!open && atRest) onOpenChange(true)
  }

  const handleModeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleMode()
  }

  const handleChipClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenChange(false)
  }

  const handleInput = (value: string) => {
    if (shownSheet) return shownSheet.onValueChange(value)
    setQuery(value)
  }

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // In sheet mode the field is a name, not a query: ⏎ saves, and the list keys
    // (arrows, ⌫-clears-scope) have nothing to act on.
    if (shownSheet) {
      if (e.key !== 'Enter') return
      shownSheet.onSubmit()
      e.preventDefault()
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

  const indexOf = new Map(rows.map((r, i) => [r, i]))
  const pointer = half ? '' : 'pointer-events-none'
  return (
    <div className={`${className} ${live ? 'z-[100]' : 'z-20'}`}>
      <div
        ref={boxRef}
        data-part="command"
        data-state={open ? 'open' : 'rest'}
        style={MORPH.box}
        className={`${BOX} ${atRest ? LIFT : 'cursor-default'}`}
        onClick={handleBoxClick}
      >
        <button
          type="button"
          data-part="opener"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-keyshortcuts="Meta+K Control+K"
          inert={open}
          className={`${OPENER} ${half ? 'pointer-events-none' : ''}`}
        >
          <span ref={pathRef} data-part="path" style={MORPH.path} className={PATH}>
            {path.trail.map((crumb, i) => (
              <Fragment key={i}>
                <span className="min-w-0 truncate text-mn-text-secondary">{crumb}</span>
                <span aria-hidden className="text-mn-text-meta">
                  ›
                </span>
              </Fragment>
            ))}
            <span data-part="current" className="min-w-0 truncate font-medium text-mn-text">
              {path.current}
            </span>
            <span aria-hidden className="h-[14px] w-px flex-none bg-mn-text/[0.09]" />
          </span>
        </button>
        <span
          aria-hidden
          data-part="glyph"
          className={`pointer-events-none absolute top-[14px] left-[14px] flex ${
            markCol ? '' : 'text-mn-text'
          }`}
          style={markCol ? { color: markCol } : undefined}
        >
          <Icon name={path.glyph} size={12} />
        </span>
        {live && (
          <div data-part="head" style={MORPH.input} className={`${HEAD} ${pointer}`}>
            {scope && !shownSheet && (
              <span data-part="scope" className={SCOPE}>
                in {scope.label}:
              </span>
            )}
            <input
              ref={inputRef}
              value={shownSheet ? shownSheet.value : query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleInputKey}
              placeholder={
                shownSheet
                  ? (shownSheet.placeholder ?? '')
                  : scope
                    ? ''
                    : 'jump to a page, or > for actions'
              }
              className={INPUT}
              // Sheet mode is a plain text field — there is no list to own, so the
              // combobox role and its aria wiring would describe something absent.
              role={shownSheet ? undefined : 'combobox'}
              aria-label={shownSheet ? shownSheet.label : 'command palette'}
              aria-expanded={shownSheet ? undefined : 'true'}
              aria-controls={shownSheet ? undefined : listId}
              aria-autocomplete={shownSheet ? undefined : 'list'}
              aria-activedescendant={shownSheet || !rows[active] ? undefined : rowId(active)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <button
          type="button"
          data-part="mode"
          title="mode"
          aria-label="dark mode"
          aria-pressed={mode === 'dark'}
          className={MODE}
          onClick={handleModeClick}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M7 2a5 5 0 0 1 0 10Z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        {half ? (
          <button
            type="button"
            data-part="chip"
            className={`${CHIP} ${FOCUS_VISIBLE_RING}`}
            onClick={handleChipClick}
          >
            esc
          </button>
        ) : (
          <span aria-hidden data-part="chip" className={CHIP}>
            ⌘K
          </span>
        )}
        {live && (
          <div ref={bodyRef} data-part="body" style={MORPH.body} className={`${BODY} ${pointer}`}>
            <div className="mx-[10px] h-px bg-mn-text/[0.09]" />
            {shownSheet ? (
              <div data-part="sheet" className="px-[10px] pt-[6px] pb-[10px]">
                {shownSheet.body}
              </div>
            ) : (
              <>
                <div
                  id={listId}
                  role="listbox"
                  aria-label="pages, records and actions"
                  className={LIST}
                >
                  {entries.map((entry, i) => {
                    if (entry.kind === 'group')
                      return (
                        <div key={`g-${i}`} data-part="group" className={GROUP} style={enter(i)}>
                          {entry.label}
                        </div>
                      )
                    if (entry.kind === 'note')
                      return (
                        <div key={`n-${i}`} data-part="note" className={NOTE} style={enter(i)}>
                          {entry.text}
                        </div>
                      )
                    const index = indexOf.get(entry) ?? -1
                    return (
                      <PaletteRow
                        key={entry.item.id}
                        id={rowId(index)}
                        entry={entry}
                        selected={index === active}
                        onHover={() => select(index)}
                        onPick={() => onSelect(entry.item)}
                        style={enter(i)}
                      />
                    )
                  })}
                </div>
                <div data-part="foot" style={MORPH.keys} className={FOOT}>
                  {PALETTE_FOOT.map((f) => (
                    <span
                      key={f}
                      className={PALETTE_FOOT_MOBILE.includes(f) ? undefined : 'max-md:hidden'}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
