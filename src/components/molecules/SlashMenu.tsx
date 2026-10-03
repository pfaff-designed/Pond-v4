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
 *   glass   300 · border-box · padding 8 · radius 20 · mono · ink · column · gap 1
 *           → `.mn-glass` (globals.css) IS the board's recipe, light; dark follows
 *             the Shell's dark frames (ADR 0004: the composed context outranks the
 *             component card) — one recipe, three consumers already, no copy here.
 *   head    flex · gap 10 · 8px 10px 10px · mb 4 · 1px ink .09 · mono 12 — `templates` only
 *   group   8px 10px 5px · 10.5 · .04em · ink .68 — NO text-transform (ADR 0003, 3rd amendment)
 *   row     flex · gap 10 · 7px 10px · radius 10 · mono 12.5 · .01em · ink; selected ink .07
 *   svg     13 × 13 on a 14 grid · stroke currentColor 1.4 round · at ink .8
 *   hint    0 1 auto · max 45% · mono 10.5 · ink .68 · ellipsis — hidden on the selected row
 *   ↵       mono 10.5 · ink .8 — on the selected row
 *   match   underline · offset 3 · thickness 1, over a `pre` / `hit` / `post` split
 *   note    10px 10px · mono 12 · 1.55 · ink .8 · text-wrap pretty
 *   foot    flex wrap · gap 14 · 9px 10px 4px · mt 4 · 1px ink .09 · 10.5 · ink .68
 *
 * There is no filter `<input>`: the query is the `/ta` the person typed, on the
 * page or in the composer, and the keys arrive from that field. The menu listens
 * on the document in the capture phase so ↑↓ ↵ esc never reach the field — except
 * ↵ with nothing to insert, which is the field's. **esc keeps the typed text:** it
 * only closes. The ink tiers `.68` / `.8` are the house `text-mn-text-secondary` /
 * `text-mn-text-meta`. Class strings are template literals, not `cn()` (#252).
 *
 * The glass portals to `document.body` at a fixed box off the anchor's rect — the
 * engine logic the previous surface already had — and a document `pointerdown`
 * outside it closes. base-ui's `Popover` was tried first and does this job, but
 * under jsdom every test that mounts it pays ~15–20 s of teardown, which would
 * stall six suites; measured twice, so the primitive is not used here.
 */

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import {
  footItems,
  rowEntries,
  templateEntries,
  type SlashEntry,
  type SlashPane,
  type SlashRow,
  type TemplatePick,
  type YourTemplate,
} from './slash-entries'

export type { SlashIcon, SlashRow, TemplatePick, YourTemplate } from './slash-entries'

export interface SlashMenuProps {
  rows: readonly SlashRow[]
  /** What the person has typed after the `/`. */
  query: string
  /** The field (or button) the glass hangs off. */
  anchor: Element | null | RefObject<Element | null>
  /** @default 'bottom' */
  side?: 'top' | 'bottom'
  /** Accessible name for the list. @default 'blocks' */
  label?: string
  onSelect: (row: SlashRow) => void
  /** esc, or a press outside — the host keeps the typed text. */
  onClose: () => void
  onPickTemplate?: (pick: TemplatePick) => void
  /** When given, the `templates` foot offers `→ preview` and → calls it. */
  onPreviewTemplate?: (pick: TemplatePick) => void
  yourTemplates?: readonly YourTemplate[]
  /** Opens straight on a pane (the board's `templates` state). @default 'rows' */
  defaultPane?: SlashPane
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
}

const GLASS = `mn-glass rounded-mn-card motion-menu fixed z-[100] box-border flex w-[300px] flex-col gap-[1px] p-[8px] font-mono text-mn-text ${FOCUS_VISIBLE_RING}`
const HEAD =
  'mb-[4px] flex items-center gap-[10px] border-b border-mn-text/[0.09] px-[10px] pt-[8px] pb-[10px] font-mono text-[12px]'
const GROUP = 'px-[10px] pt-[8px] pb-[5px] text-[10.5px] tracking-[.04em] text-mn-text-secondary'
const ROW =
  'flex cursor-default items-center gap-[10px] rounded-[10px] px-[10px] py-[7px] font-mono text-[12.5px] tracking-[.01em] text-mn-text'
const HINT =
  'min-w-0 max-w-[45%] flex-[0_1_auto] truncate font-mono text-[10.5px] text-mn-text-secondary'
const NOTE =
  'px-[10px] py-[10px] font-mono text-[12px] leading-[1.55] text-mn-text-meta [text-wrap:pretty]'
const FOOT =
  'mt-[4px] flex flex-wrap gap-[14px] border-t border-mn-text/[0.09] px-[10px] pt-[9px] pb-[4px] text-[10.5px] text-mn-text-secondary'

type RowEntry = Extract<SlashEntry, { kind: 'row' }>

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
  yourTemplates,
  defaultPane = 'rows',
  container,
}: SlashMenuProps) {
  const [pane, setPane] = useState<SlashPane>(defaultPane)
  // The selection is keyed to what it was made against, so a new query or pane
  // starts at the first row without an effect writing state.
  const [sel, setSel] = useState({ pane, query, index: 0 })
  const entries = pane === 'templates' ? templateEntries(yourTemplates) : rowEntries(rows, query)
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
      else if (e.key === 'Enter' && item) pick(item)
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

  const style = useAnchoredBox(anchor, side)
  const foot = footItems(pane, query, items.length, onPreviewTemplate !== undefined)
  const indexOf = new Map(items.map((item, i) => [item, i]))

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={glassRef}
      tabIndex={-1}
      data-part="glass"
      data-kind="slash"
      data-pane={pane}
      className={GLASS}
      style={style}
    >
      {pane === 'templates' && (
        <div data-part="head" className={HEAD}>
          <span data-part="head-text" className="min-w-0 truncate text-mn-text">
            page from template
          </span>
        </div>
      )}
      <div
        role="listbox"
        aria-label={pane === 'templates' ? 'page from template' : label}
        className="flex max-h-[60vh] flex-col gap-[1px] overflow-y-auto"
      >
        {entries.map((entry, i) => {
          if (entry.kind === 'group') {
            return (
              <div key={`g-${entry.label}-${i}`} data-part="group" className={GROUP}>
                {entry.label}
              </div>
            )
          }
          if (entry.kind === 'note') {
            return (
              <div key="note" data-part="note" className={NOTE}>
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
        </div>
      )}
    </div>,
    container ?? document.body
  )
}

/**
 * Fixed coordinates 4px off the anchor's rect — below it, or above it for a
 * composer that sits at the foot of the screen — tracked across scroll and resize.
 */
function useAnchoredBox(
  anchor: SlashMenuProps['anchor'],
  side: 'top' | 'bottom'
): React.CSSProperties | undefined {
  const [box, setBox] = useState<React.CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    const el = anchor && 'current' in anchor ? anchor.current : anchor
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setBox(
        side === 'top'
          ? { bottom: window.innerHeight - r.top + 4, left: r.left }
          : { top: r.bottom + 4, left: r.left }
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, side])
  return box
}

function Row({
  entry,
  selected,
  onHover,
  onPick,
}: {
  entry: RowEntry
  selected: boolean
  onHover: () => void
  onPick: () => void
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      data-part="row"
      className={`${ROW} ${selected ? 'bg-mn-text/[0.07]' : 'bg-transparent'}`}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      {entry.icon && (
        <span data-part="icon" className="flex text-mn-text-meta">
          <Mark d={entry.icon.d} filled={entry.icon.filled} />
        </span>
      )}
      <span data-part="label" className="min-w-0 truncate font-normal">
        <span data-part="pre">{entry.pre}</span>
        <span data-part="hit" className="underline decoration-[1px] underline-offset-[3px]">
          {entry.hit}
        </span>
        <span data-part="post">{entry.post}</span>
      </span>
      <span className="flex-1" />
      {selected ? (
        <span data-part="enter" className="font-mono text-[10.5px] text-mn-text-meta">
          ↵
        </span>
      ) : (
        entry.hint && (
          <span data-part="hint" className={HINT}>
            {entry.hint}
          </span>
        )
      )}
    </div>
  )
}

/** The board's hand-drawn mark: 13 × 13 on a 14 grid, stroke 1.4, round caps — or filled. */
function Mark({ d, filled }: { d: string; filled?: boolean }): ReactNode {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}
