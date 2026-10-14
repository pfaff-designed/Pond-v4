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
import { blockCountWords } from '@/lib/templates/summary'
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

/** Whether two picks name the same template — used to find the one row a live preview overrides. */
function sameTemplatePick(a: TemplatePick, b: TemplatePick): boolean {
  if (a.origin !== b.origin) return false
  if (a.origin === 'premade' && b.origin === 'premade') return a.kind === b.kind
  if (a.origin === 'yours' && b.origin === 'yours') return a.id === b.id
  return false
}

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
  /** Set once `→` has resolved a preview — the pick and its outline's block
   * count: the previewed row's hint becomes `{n} blocks`, the foot drops to
   * `↵ apply · esc back`, and esc routes through `onPreviewCancel` (6f frame 3). */
  previewing?: { pick: TemplatePick; blocks: number }
  /** Drops a live preview: esc calls this instead of `onClose` while one is
   * up, and ↑↓← call it unconditionally (a no-op in the host when nothing is
   * being previewed) so moving onto a different row drops a stale one. */
  onPreviewCancel?: () => void
  /** The blank-page list (KAN-276): the `rows` pane leads with `templates` — no head of its own, the glass opens straight on the `templates` group. */
  leadWithTemplates?: boolean
  yourTemplates?: readonly YourTemplate[]
  /** The blank list's ranking (KAN-138): the parent's other children, by `siblingTemplateRanking` count. */
  siblingRanking?: readonly string[]
  /** The template saved this session and not yet applied. */
  justSavedId?: string | null
  /** The parent page's title, for the `used in {parent}` hint. */
  parentTitle?: string | null
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
  previewing,
  onPreviewCancel,
  leadWithTemplates,
  yourTemplates,
  siblingRanking = [],
  justSavedId = null,
  parentTitle = null,
  container,
  size = 'desktop',
}: SlashMenuProps) {
  const mobile = size === 'mobile'
  // Board 6f frame 3 s3.1.3: while previewing on desktop the glass narrows to
  // the 250px slot reserved beside the outline (the ordinary 300px chrome
  // would overhang it by 50px and `clampLeft` could push it over the
  // outline rows). Mobile stacks instead (`BlockCanvas`'s own layout), so its
  // glass keeps its ordinary 340px width.
  const previewingDesktop = previewing !== undefined && size === 'desktop'
  const chrome = previewingDesktop
    ? { ...SLASH_SIZES.desktop, width: 'w-[250px]', widthPx: 250 }
    : SLASH_SIZES[size]
  const [pane, setPane] = useState<SlashPane>('rows')
  // Typing in the templates pane means narrowing blocks again: any query change
  // while there falls back to the rows.
  const [seenQuery, setSeenQuery] = useState(query)
  if (query !== seenQuery) {
    setSeenQuery(query)
    if (pane === 'templates') setPane('rows')
  }
  // A query change while previewing (the person keeps typing) drops the
  // outline the same way an arrow key does (round 3 live finding 1) — else it
  // sits over a filtered list it no longer matches. A ref, not the `seenQuery`
  // comparison above: `onPreviewCancel` sets state in the PARENT, and calling
  // it from this render-time check would be a cross-component setState during
  // render, so it runs from an effect, after commit, instead.
  const previewQueryRef = useRef(query)
  useEffect(() => {
    if (previewQueryRef.current !== query) {
      previewQueryRef.current = query
      if (previewing) onPreviewCancel?.()
    }
  }, [query, previewing, onPreviewCancel])
  // The selection is keyed to what it was made against, so a new query or pane
  // starts at the first row without an effect writing state. It is kept by the
  // row's own id, not its index: ranked rows (KAN-138) can slot in above the
  // active row once the ranking resolves, and an index would then point at a
  // different template than the one the person moved onto.
  const [sel, setSel] = useState<{ pane: SlashPane; query: string; id: string | null }>({
    pane,
    query,
    id: null,
  })
  const entries =
    pane === 'templates'
      ? templateEntries(yourTemplates, mobile ? MOBILE_PREMADE_CAP : undefined)
      : leadWithTemplates
        ? blankRowEntries(
            rows,
            yourTemplates ?? [],
            query,
            mobile ? MOBILE_ROW_CAP : undefined,
            siblingRanking,
            justSavedId,
            parentTitle
          )
        : rowEntries(rows, query, mobile ? MOBILE_ROW_CAP : undefined)
  const items = entries.filter((e): e is RowEntry => e.kind === 'row')
  const selectedIndex =
    sel.pane === pane && sel.query === query && sel.id !== null
      ? items.findIndex((item) => item.id === sel.id)
      : -1
  const active = Math.min(
    selectedIndex === -1 ? 0 : selectedIndex,
    Math.max(0, items.length - 1)
  )
  const select = (index: number) => setSel({ pane, query, id: items[index]?.id ?? null })

  const pick = (item: RowEntry) => {
    if (item.template) onPickTemplate?.(item.template)
    else if (item.row?.submenu) setPane(item.row.submenu)
    else if (item.row) onSelect(item.row)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const item = items[active]
      let handled = true
      // Moving onto a different row (6f frame 3: "moving onto a template")
      // drops a stale preview — a no-op in the host when nothing is being
      // previewed, so this fires on every ↑↓← rather than only while one is up.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') onPreviewCancel?.()
      if (e.key === 'ArrowDown') select(Math.min(active + 1, items.length - 1))
      else if (e.key === 'ArrowUp') select(Math.max(active - 1, 0))
      else if (e.key === 'Escape') {
        // The outline is still up: esc clears it, the glass stays open.
        if (previewing) onPreviewCancel?.()
        else onClose()
      }
      // Nothing matches and the person types a space: the words were prose, not a
      // command. Close, and let the space through — the field keeps all of it.
      else if (e.key === ' ' && pane === 'rows' && items.length === 0) {
        onClose()
        handled = false
      }
      // While a preview is up, ↵ always applies the PREVIEWED pick, never
      // `item` — a live refetch (AUDIT G2: deleted mid-preview) can shrink or
      // reorder `items` out from under the previewed row, and applying
      // whatever is now active would silently apply a different template.
      else if (e.key === 'Enter' && previewing) onPickTemplate?.(previewing.pick)
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

  const style = useAnchoredBox(anchor, side, chrome.widthPx)
  const foot = footItems(
    pane,
    query,
    items.length,
    onPreviewTemplate !== undefined,
    items[active]?.template !== undefined,
    leadWithTemplates,
    previewing !== undefined
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
          // Only the row the preview actually resolved stands in for ↵'s hint
          // — every other row's own hint (its `key`, or a `yours` template's)
          // is untouched.
          const previewHint =
            previewing && entry.template && sameTemplatePick(entry.template, previewing.pick)
              ? blockCountWords(previewing.blocks)
              : undefined
          return (
            <Row
              key={entry.id}
              entry={previewHint !== undefined ? { ...entry, hint: previewHint } : entry}
              selected={at === active}
              previewed={previewHint !== undefined}
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
