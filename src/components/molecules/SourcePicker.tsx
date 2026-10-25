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
  chartPick,
  DEFAULT_STATUS_FIELD_OPTIONS,
  defaultFieldsFor,
  fieldTypeEntries,
  footFor,
  headFor,
  kindOf,
  NEW_DATABASE_ID,
  NEW_PROJECT_ID,
  newEntries,
  newProjectLabel,
  projectEntries,
  RECORDS_ARE,
  sourceEntries,
  typeEntries,
  type ChartPick,
  type RecordsAre,
  type SourceBlock,
  type SourceDatabase,
  type SourceField,
  type SourceStep,
} from './source-entries'
import { useAnchoredBox, type PickerAnchor, type PickerSide } from './use-anchored-box'

export type {
  ChartPick,
  RecordsAre,
  SourceBlock,
  SourceDatabase,
  SourceField,
  SourceStep,
} from './source-entries'

/** What the person chose — the host makes the block (and, for `new`, the database). */
export type SourcePick =
  | { kind: 'existing'; database: SourceDatabase; mode: SourceBlock; chart?: ChartPick }
  | {
      kind: 'new'
      /** Named after the page it started on. */
      title: string
      /** The fields beyond the record's own title. */
      fields: readonly SourceField[]
      recordsAre: RecordsAre
      mode: SourceBlock
      chart?: ChartPick
    }
  | {
      kind: 'tasks'
      /** The board's project (KAN-536): an existing `project` option, or a new
       *  one (no `id` yet — the host mints it). */
      project: { id?: string; label: string }
    }

export interface SourcePickerProps {
  /** Which `/` row summoned it — names the head and is the view mode it makes. */
  block: SourceBlock
  /** The host page's title: `new database — <title>`. */
  pageTitle: string
  databases: readonly SourceDatabase[]
  /** The tasks database's `project` options (KAN-536), for the `project` step a
   *  board's `new` row opens onto. Absent when the host has none loaded yet —
   *  the step still opens, offering only `new project — <title>`. */
  projects?: { options: { id: string; label: string }[]; pageTitle: string }
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
  /** The chosen side's own room (`roomTowardSide`) — caps the glass inside it,
   *  same as the `/` menu's `maxHeight`, when the host computed one. */
  maxHeight?: number
  onPick: (pick: SourcePick) => void
  /** esc, or a press outside — the host keeps the typed text. */
  onClose: () => void
  /** Portal target; defaults to `document.body`. Stories theme it. */
  container?: HTMLElement | null
}

/** The source kind's width — the one chrome value that is this kind's own. */
const WIDTH = 'w-[340px]'
const WIDTH_PX = 340
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
  projects,
  loadFields,
  defaultStep = 'source',
  defaultSource,
  anchor,
  side = 'bottom',
  maxHeight,
  onPick,
  onClose,
  container,
}: SourcePickerProps) {
  // `type` without a source is not a state this picker can finish from — ↵ there
  // would fall through to the `new` branch and write an empty database nobody
  // asked for. A host that wires one without the other gets the `source` step.
  const [step, setStep] = useState<SourceStep>(
    defaultStep === 'type' && !defaultSource ? 'source' : defaultStep
  )
  // The chosen source: a database, or `null` for the new one being defined.
  const [source, setSource] = useState<SourceDatabase | null>(defaultSource ?? null)
  // Prefilled per view kind (KAN-351), so `new database — <page>` → ↵ opens the
  // `new` step already usable rather than empty.
  const [fields, setFields] = useState<readonly SourceField[]>(() => defaultFieldsFor(block))
  // An existing database's fields, keyed to the database they were read for, so
  // a change of source reads as "not loaded yet" without an effect writing state.
  const [loaded, setLoaded] = useState<{ id: string; fields: readonly SourceField[] } | null>(null)
  const sourceFields = source && loaded?.id === source.id ? loaded.fields : undefined
  const [expanded, setExpanded] = useState(false)
  const [recordsAre, setRecordsAre] = useState<RecordsAre>('pages')
  // The selection is keyed to the step it was made on, so a new step starts at
  // its own first row (or, for `new`, at none) without an effect writing state.
  const [sel, setSel] = useState<{ step: SourceStep; index: number } | null>(null)
  // The `project` step's own typeahead — no `<input>`, printable keys build it
  // from the document listener below (KAN-536).
  const [query, setQuery] = useState('')
  // A double ↵ on the same keydown-handled render must make one pick, not two
  // (G9) — `onPick` closes the glass asynchronously, so a second `Enter` can
  // still reach `pick()` before that unmount lands.
  const pickedRef = useRef(false)

  const entries =
    step === 'source'
      ? sourceEntries(databases, pageTitle, block)
      : step === 'type'
        ? typeEntries(source ? sourceFields : fields, expanded)
        : step === 'field-type'
          ? fieldTypeEntries()
          : step === 'project'
            ? projectEntries(projects?.options ?? [], projects?.pageTitle ?? pageTitle, query)
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
    setQuery('')
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

  const finish = (chart?: ChartPick) => {
    if (source) onPick({ kind: 'existing', database: source, mode: block, chart })
    else
      onPick({
        kind: 'new',
        title: block === 'board' ? 'tasks' : pageTitle,
        fields,
        recordsAre: block === 'board' ? 'pages' : recordsAre,
        mode: block,
        chart,
      })
  }

  const pick = (item: RowEntry | undefined) => {
    if (step === 'source') {
      if (!item) return
      if (item.id === NEW_DATABASE_ID) {
        // A board's `new` row leads to the `project` step (KAN-536: one shared
        // tasks database per pond) instead of defining fields — the host builds
        // the tasks database, this picker only names the project.
        if (block === 'board') {
          go('project')
          return
        }
        const nextFields = defaultFieldsFor(block)
        setSource(null)
        setFields(nextFields)
        go('new')
        return
      }
      const db = databases.find((d) => d.id === item.id)
      if (!db) return
      setSource(db)
      if (block === 'chart') go('type')
      else onPick({ kind: 'existing', database: db, mode: block })
    } else if (step === 'project') {
      if (!item || pickedRef.current) return
      pickedRef.current = true
      if (item.id === NEW_PROJECT_ID) {
        // The same label the row itself was built from (`newProjectLabel`) —
        // never the raw, untrimmed `query`, which would carry a whitespace
        // query through as a blank or trailing-space option (KAN-536).
        onPick({
          kind: 'tasks',
          project: { label: newProjectLabel(projects?.pageTitle ?? pageTitle, query) },
        })
        return
      }
      onPick({ kind: 'tasks', project: { id: item.id, label: item.label } })
    } else if (step === 'type') {
      if (!item) return
      if (item.id === ALL_CHARTS_ID) {
        setExpanded(true)
        setSel(null)
        return
      }
      const kind = kindOf(item.id)
      // The pick names the two fields the row's `sub` promised, through the one
      // rule the suggestions are drawn from — a kind alone makes a chart bucketed
      // by record title (`resolveChartConfig` infers an x axis only when there is
      // no stored config at all), which is not what `line · kcal by day` offered.
      if (kind) finish(chartPick(kind, source ? sourceFields : fields))
    } else if (step === 'field-type') {
      if (!item) return
      const type = item.id as SourceField['type']
      // A board is never laneless: any status/select field added here carries
      // the three lanes by default, same as `defaultFieldsFor`'s own board field.
      const options =
        type === 'status' || type === 'select' ? DEFAULT_STATUS_FIELD_OPTIONS : undefined
      setFields((f) => [...f, { name: nextFieldName(f), type, ...(options ? { options } : {}) }])
      go('new')
    } else if (item?.id === ADD_FIELD_ID) {
      go('field-type')
    } else if (block === 'chart') {
      go('type')
    } else {
      finish()
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The seg is a real toggle group with its own keys. Swallowing Enter here
      // would make Enter on a focused option create the database instead of
      // choosing the option — a control that takes focus and then ignores it.
      const target = e.target as Element | null
      if (target?.closest?.('[data-part="seg"]')) return
      let handled = true
      if (e.key === 'ArrowDown') select(Math.min(active + 1, items.length - 1))
      else if (e.key === 'ArrowUp') select(Math.max(active - 1, first))
      else if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter') pick(items[active])
      // The query is typed state, not a field — only the `project` step reads
      // printable keys (every other step has no filter, per this file's own
      // top note). Backspace deletes a character of it; elsewhere Backspace is
      // not this picker's to take.
      else if (step === 'project' && e.key === 'Backspace') {
        setQuery((q) => q.slice(0, -1))
        setSel(null)
      } else if (
        step === 'project' &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        setQuery((q) => q + e.key)
        setSel(null)
      } else handled = false
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

  const style = useAnchoredBox(anchor, side, WIDTH_PX)
  const head = headFor(step, {
    block,
    pageTitle,
    source: step === 'type' ? (source?.title ?? pageTitle) : undefined,
    query: step === 'project' ? query : undefined,
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
      style={maxHeight !== undefined ? { ...style, maxHeight } : style}
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
