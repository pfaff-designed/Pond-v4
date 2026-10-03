'use client'

/**
 * The source picker — `PondPicker kind="source"` (#280, child c of #226). `Pond 02`
 * 2e: "one flow, three blocks. table, gallery and chart all open the same picker.
 * only step 2 differs, and only for charts."
 *
 *   source  pick or create a database. `new database — <page>` leads and is
 *           selected, so ↵ is enough; every database already filed is one row down
 *           with its count. ↵ on one: a table or gallery is done; a chart goes on
 *           to `type`.
 *   type    pick a chart type. the two or three kinds that fit the source's fields,
 *           a rule, then `all charts · 13` — ↵ there unfolds every kind in place.
 *   new     define a new database: its fields, the faint `field` add row (↵ adds
 *           one), and the one segmented control in the handoff — `records are:
 *           pages | rows only`. ↵ creates (a chart first picks its type).
 *
 * This is direct authoring — the person choosing as they insert a block — so the
 * pick applies at once through the host's ordinary save and undo. It is not the
 * diff path: `DefineSchemaProposalCard` / `ConfigureViewProposalCard` are Pond
 * PROPOSING a schema or a view, accepted or rejected; `PROJECT_RULES.md` keeps the
 * two apart ("pages change only through the person's own edits or an accepted
 * diff") and AUDIT 6g names a `/` pick "a user edit, applied directly." Two jobs,
 * both kept — the same reading #101's list → table took (`list-to-table.ts`).
 *
 * Every literal is `wayfinder/board-values.generated.json` `.components.PondPicker`
 * (`kind=source|theme=paper`, its `theme=ink` delta and the three states' rows):
 * the glass is the mono chrome at **340** (`picker-chrome.ts`, shared with the `/`
 * menu — `.mn-glass` on both themes, ADR 0004 ruling 11), the row is `slash-row`'s
 * mono row, and the seg is base-ui's `ToggleGroup` wearing the board's values. All
 * three states draw a head and a foot (the kind's base delta `hasFoot: false` is
 * the shared `open` state nobody renders — see the issue's addendum).
 *
 * There is no filter `<input>`: the head is the `/table` the person typed, and the
 * keys arrive from the page. The glass listens on the document in the capture
 * phase so ↑↓ ↵ esc never reach the field; ← → are the seg's own (base-ui moves
 * between its options). esc closes and keeps the typed text. The glass portals to
 * `document.body` at a fixed box off the anchor's rect; a press outside closes.
 * Class strings are template literals, not `cn()` (#252).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'

import { FOCUS_VISIBLE_RING } from '@/components/atoms/focus-ring'
import type { ChartKind } from '@/lib/modules/view/aggregate'

import {
  FOOT,
  GLASS,
  GLASS_ABOVE,
  GROUP,
  HEAD,
  HEAD_TEXT,
  LIST,
  RULE,
  SEG,
  SEG_OPT,
  SEG_OPT_OFF,
  SEG_OPT_ON,
} from './picker-chrome'
import { Row, type RowEntry } from './slash-row'
import {
  ADD_FIELD_ID,
  ALL_CHARTS_ID,
  footFor,
  headFor,
  kindOf,
  NEW_DATABASE_ID,
  newEntries,
  RECORDS_ARE,
  sourceEntries,
  typeEntries,
  type RecordsAre,
  type SourceBlock,
  type SourceDatabase,
  type SourceField,
  type SourceStep,
} from './source-entries'
import { useAnchoredBox, type PickerAnchor, type PickerSide } from './use-anchored-box'

export type {
  RecordsAre,
  SourceBlock,
  SourceDatabase,
  SourceField,
  SourceStep,
} from './source-entries'

/** What the person chose — the host makes the block (and, for `new`, the database). */
export type SourcePick =
  | { kind: 'existing'; database: SourceDatabase; mode: SourceBlock; chart?: ChartKind }
  | {
      kind: 'new'
      /** Named after the page it started on. */
      title: string
      /** The fields beyond the record's own title. */
      fields: readonly SourceField[]
      recordsAre: RecordsAre
      mode: SourceBlock
      chart?: ChartKind
    }

export interface SourcePickerProps {
  /** Which `/` row summoned it — names the head and is the view mode it makes. */
  block: SourceBlock
  /** The host page's title: `new database — <title>`. */
  pageTitle: string
  databases: readonly SourceDatabase[]
  /** An existing database's fields, for the chart step; the host fetches its schema on demand. */
  loadFields?: (databaseId: string) => Promise<readonly SourceField[]>
  /** Opens on this step. @default 'source' */
  defaultStep?: SourceStep
  /** `type` opened straight on a source — AUDIT C9: "auto-wire when one table is nearby". */
  defaultSource?: SourceDatabase
  /** The field (or button) the glass hangs off. */
  anchor: PickerAnchor
  /** @default 'bottom' */
  side?: PickerSide
  onPick: (pick: SourcePick) => void
  /** esc, or a press outside — the host keeps the typed text. */
  onClose: () => void
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
}

/** The source kind's width — the one chrome value that is this kind's own. */
const WIDTH = 'w-[340px]'
/** Every record has a title; the `new` step shows it first, outside the schema. */
const TITLE_FIELD: SourceField = { name: 'title', type: 'text' }

/** `field`, then `field 2`, `field 3` — a new field's name until the person renames it in the view. */
function nextFieldName(fields: readonly SourceField[]): string {
  const n = fields.filter((f) => /^field( \d+)?$/.test(f.name)).length
  return n === 0 ? 'field' : `field ${n + 1}`
}

export function SourcePicker({
  block,
  pageTitle,
  databases,
  loadFields,
  defaultStep = 'source',
  defaultSource,
  anchor,
  side = 'bottom',
  onPick,
  onClose,
  container,
}: SourcePickerProps) {
  const [step, setStep] = useState<SourceStep>(defaultStep)
  // The chosen source: a database, or `null` for the new one being defined.
  const [source, setSource] = useState<SourceDatabase | null>(defaultSource ?? null)
  const [fields, setFields] = useState<readonly SourceField[]>([])
  // An existing database's fields, keyed to the database they were read for, so
  // a change of source reads as "not loaded yet" without an effect writing state.
  const [loaded, setLoaded] = useState<{ id: string; fields: readonly SourceField[] } | null>(null)
  const sourceFields = source && loaded?.id === source.id ? loaded.fields : undefined
  const [expanded, setExpanded] = useState(false)
  const [recordsAre, setRecordsAre] = useState<RecordsAre>('pages')
  // The selection is keyed to the step it was made on, so a new step starts at
  // its own first row (or, for `new`, at none) without an effect writing state.
  const [sel, setSel] = useState<{ step: SourceStep; index: number } | null>(null)

  const entries =
    step === 'source'
      ? sourceEntries(databases, pageTitle)
      : step === 'type'
        ? typeEntries(source ? sourceFields : fields, expanded)
        : newEntries([TITLE_FIELD, ...fields])
  const hasSeg = entries.some((e) => e.kind === 'seg')
  const listEntries = entries.filter((e) => e.kind !== 'seg')
  const items = entries.filter((e): e is RowEntry => e.kind === 'row')
  const first = step === 'new' ? -1 : 0
  const active = Math.min(sel?.step === step ? sel.index : first, items.length - 1)
  const select = (index: number) => setSel({ step, index })
  const go = (next: SourceStep) => {
    setStep(next)
    setSel(null)
  }

  // An existing database's fields arrive when the chart step opens on it.
  useEffect(() => {
    if (step !== 'type' || !source || !loadFields) return
    let live = true
    const id = source.id
    loadFields(id).then((f) => {
      if (live) setLoaded({ id, fields: f })
    })
    return () => {
      live = false
    }
  }, [step, source, loadFields])

  const finish = (chart?: ChartKind) => {
    if (source) onPick({ kind: 'existing', database: source, mode: block, chart })
    else onPick({ kind: 'new', title: pageTitle, fields, recordsAre, mode: block, chart })
  }

  const pick = (item: RowEntry | undefined) => {
    if (step === 'source') {
      if (!item) return
      if (item.id === NEW_DATABASE_ID) {
        setSource(null)
        go('new')
        return
      }
      const db = databases.find((d) => d.id === item.id)
      if (!db) return
      setSource(db)
      if (block === 'chart') go('type')
      else onPick({ kind: 'existing', database: db, mode: block })
    } else if (step === 'type') {
      if (!item) return
      if (item.id === ALL_CHARTS_ID) {
        setExpanded(true)
        setSel(null)
        return
      }
      const kind = kindOf(item.id)
      if (kind) finish(kind)
    } else if (item?.id === ADD_FIELD_ID) {
      setFields((f) => [...f, { name: nextFieldName(f), type: 'text' }])
    } else if (block === 'chart') {
      go('type')
    } else {
      finish()
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      let handled = true
      if (e.key === 'ArrowDown') select(Math.min(active + 1, items.length - 1))
      else if (e.key === 'ArrowUp') select(Math.max(active - 1, first))
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter') pick(items[active])
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
  }, [active, step])

  // A press outside the glass closes it — and keeps the typed text, like esc.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (glassRef.current && !glassRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const style = useAnchoredBox(anchor, side)
  const head = headFor(step, {
    block,
    pageTitle,
    source: step === 'type' ? (source?.title ?? pageTitle) : undefined,
  })
  const foot = footFor(step, { block, newSelected: items[active]?.id === NEW_DATABASE_ID })
  const indexOf = new Map(items.map((item, i) => [item, i]))

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={glassRef}
      tabIndex={-1}
      data-part="glass"
      data-kind="source"
      data-step={step}
      className={`${side === 'top' ? GLASS_ABOVE : GLASS} ${WIDTH}`}
      style={style}
    >
      <div data-part="head" className={HEAD}>
        <span data-part="head-text" className={HEAD_TEXT}>
          {head}
        </span>
      </div>
      {/* The seg is a widget, not an option, so it sits BESIDE the listbox rather
          than inside it — a `role="listbox"` whose children include a toggle group
          reads as a broken list to AT. It is always the last entry (`newEntries`),
          and the glass's own `gap-[1px]` equals the list's, so the order and the
          pixels are the board's either way. */}
      <div role="listbox" aria-label={head} className={LIST}>
        {listEntries.map((entry, i) => {
          if (entry.kind === 'group') {
            return (
              <div key={`g-${entry.label}-${i}`} data-part="group" className={GROUP}>
                {entry.label}
              </div>
            )
          }
          if (entry.kind === 'separator') {
            return <div key={`rule-${i}`} data-part="rule" aria-hidden className={RULE} />
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
      {hasSeg && (
        <ToggleGroup
          key="seg"
          data-part="seg"
          aria-label="records are"
          className={SEG}
          value={[recordsAre]}
          onValueChange={(next) => {
            // A toggle group lets its one pressed option be un-pressed; the
            // seg always has a choice, so an empty change is ignored.
            const value = next[0]
            if (value === 'pages' || value === 'rows') setRecordsAre(value)
          }}
        >
          {RECORDS_ARE.map((o) => (
            <Toggle
              key={o.value}
              value={o.value}
              data-part="seg-opt"
              className={`${SEG_OPT} ${FOCUS_VISIBLE_RING} ${o.value === recordsAre ? SEG_OPT_ON : SEG_OPT_OFF}`}
            >
              {o.label}
            </Toggle>
          ))}
        </ToggleGroup>
      )}
      <div data-part="foot" className={FOOT}>
        {foot.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>,
    container ?? document.body
  )
}
