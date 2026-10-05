'use client'

/**
 * View renderer (#19 slice 3) — draws a collection's rows as a TABLE or a BOARD.
 *
 * A view block is config-only; the rows are the host collection page's `type='row'`
 * children. `ViewView` is the registry entry: it reads its host page id from
 * `useSiblingBlocks()` (inline-only this cycle — a view draws its OWN page's rows,
 * decision 12), resolves schema + rows + an optimistic writer via
 * `useCollectionRows`, and hands them to the pure-presentational `CollectionView`.
 * Splitting the fetch from the draw keeps `CollectionView` directly story-testable
 * with static data (no Supabase), mirroring how the kanban/table stories render.
 *
 * Cells resolve each stored value against the collection `_schema`
 * (`optionForValue` for select/status chips — id-or-legacy-label tolerant, slice 1).
 * Filter/sort/group run through the pure `apply.ts`. Direct edits — a table cell, a
 * dragged board/calendar card, a calendar date field — write OPTIMISTICALLY via
 * `setValue`, bypassing the AI (decision 17). Calendar (agenda, drag + inline date
 * reschedule) and gallery (read-only card grid) are slice 4.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModuleViewProps } from '../types'
import type { ViewBlock, ViewMode } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { viewCollectionId } from '../block-frame'
import { useCollectionRows } from './use-collection-rows'
import {
  applyView,
  displayValue,
  epochDay,
  galleryCardMeta,
  groupRows,
  groupRowsByDate,
  layoutGanttBars,
  pickDateDef,
  pickGanttDefs,
  pickGroupDef,
  pickRepeatDef,
  type BarDates,
  type CollectionRow,
} from './apply'
import { CollectionBigNumber, ChartControls, BigNumberControls } from './figures'
import { CollectionChart } from './collection-chart-card'
import { CompactChart } from './collection-chart-compact'
import { isChartCard } from './chart-compact'
import { useChartProvenance } from './use-chart-provenance'
import type { ChartProvenance } from '../chart/chrome'
import { ViewNotice } from './notice'
import { usePointerBucketDrag } from './use-pointer-bucket-drag'
import { usePointerGanttDrag } from './use-gantt-bar-drag'
import {
  formatTick,
  ganttRowDone,
  quarterTicks,
  GANTT_BAR_INK,
  GANTT_BAR_SHELL,
  GANTT_HEAD,
  GANTT_LABEL,
  GANTT_LABEL_INK,
  GANTT_ROW,
  GANTT_TICK,
  GANTT_TICKS,
  GANTT_TRACK,
  GANTT_TRACK_STYLE,
} from './gantt-shared'
import { PondDueToday } from '@/components/atoms/PondAtom'
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import { GANTT_EMPTY_LINE } from '@/lib/modules/block-frame'
import {
  coerceValue,
  optionForValue,
  ROW_TYPE,
  PROPERTY_TYPES,
  type PropertyDef,
  type PropertySchema,
  type PropertyType,
  type PropertyValue,
} from '@/lib/properties/schema'
import { usePageLinks } from '../page-link/context'
import { shouldOpenCardFromClick } from './card-click'
import { dueAtom } from './due'
import { Cell, OptionChip, RepeatMark } from './cells'
import { RecordPeek } from './record-peek'
import { CollectionList } from './list'
import { useRecordSelection } from './use-record-selection'

// ── Registry entry: fetch, then draw ──────────────────────────────────────────

export function ViewView({ data, editable, onChange }: ModuleViewProps<ViewBlock>) {
  // Which collection's rows this view draws: a LINKED view names another collection
  // (data.collectionId, #41); otherwise it draws its HOST page's own rows, whose id
  // arrives from the page host (DocumentPanel) through SiblingBlocks — exactly as a
  // cross-page metric reads it. `viewCollectionId` is the one resolution the canvas
  // shares (#239); `useCollectionRows` fetches + writes against whichever.
  const { pageId } = useSiblingBlocks()
  const collectionId = viewCollectionId(data, pageId)
  const {
    schema,
    rows,
    collectionName,
    isLoading,
    isError,
    setValue,
    addRow,
    renameRow,
    updateSchema,
  } = useCollectionRows(collectionId)
  // The chart card's `on` / `reads` (#227), off the caches the shell already holds.
  const chartProvenance = useChartProvenance(pageId, collectionId)

  // Config edits (mode/group-by) rewrite the persisted view block through the
  // module's own onChange — the same whole-block save path every editable module uses.
  const onConfigChange = onChange
    ? (patch: Partial<ViewBlock>) => onChange({ ...data, ...patch })
    : undefined

  // A row IS a page: `open ›` on the record peek navigates to it through the page-link
  // seam. Absent off a page host (Storybook, the AI terminal), where the peek omits it.
  const links = usePageLinks()
  const openRow = links
    ? (rowId: string) =>
        links.navigateToPage({
          id: rowId,
          title: rows.find((r) => r.id === rowId)?.title || 'Untitled',
          type: ROW_TYPE,
        })
    : undefined

  return (
    <CollectionView
      config={data}
      schema={schema}
      rows={rows}
      collectionName={collectionName}
      isLoading={isLoading}
      isError={isError}
      editable={editable}
      linked={!!data.collectionId}
      onEdit={setValue}
      onAddRow={addRow}
      onRenameRow={renameRow}
      onConfigChange={onConfigChange}
      onUpdateSchema={editable ? updateSchema : undefined}
      onOpenRow={openRow}
      chartProvenance={chartProvenance}
    />
  )
}

// ── Presentational core (story-testable) ──────────────────────────────────────

export interface CollectionViewProps {
  config: ViewBlock
  schema: PropertySchema | null
  rows: CollectionRow[]
  /** The database's own name — `9w`'s head row leads with it. Absent off a page
   *  host (Storybook, the AI terminal), where the head row simply has no name. */
  collectionName?: string
  isLoading?: boolean
  /** Either collection read failed — distinct from "no rows", which would be a lie. */
  isError?: boolean
  editable?: boolean
  /** True when this is a linked view over another collection (#41) — words the
   *  "target unavailable" notice when a linked target is deleted or isn't a collection. */
  linked?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  /** Manual card/row authoring (board-authoring Slice 2). Present only on the live
   *  editable host; Storybook renders static data and omits them. */
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  /** Rewrite the view block's own config — the mode switcher
   *  (board-authoring Slice 3). Absent on read-only / Storybook hosts. */
  onConfigChange?: (patch: Partial<ViewBlock>) => void
  /** Replace the collection's property schema — manual column + property editing
   *  (board-authoring Slice 4). Absent on read-only / Storybook hosts. */
  onUpdateSchema?: (next: PropertySchema) => void
  /** Navigate to a row's page — a row IS a page, so this receives the row id. Draws
   *  the record peek's `open ›`; absent on Storybook/static renders (no dead affordance). */
  onOpenRow?: (rowId: string) => void
  /** The chart card's `on` / `reads` (#227). Absent off a page host; the rows are omitted. */
  chartProvenance?: ChartProvenance
}

export function CollectionView({
  config,
  schema,
  rows,
  collectionName,
  isLoading,
  isError,
  editable,
  linked,
  onEdit,
  onAddRow,
  onRenameRow,
  onConfigChange,
  onUpdateSchema,
  onOpenRow,
  chartProvenance,
}: CollectionViewProps) {
  const processed = useMemo(
    () => (schema ? applyView(rows, schema, config) : []),
    [rows, schema, config]
  )

  // #227: the chart CARD owns its loading state (the board's four-bar skeleton) —
  // every other mode shares the calm notice until its rows arrive.
  const chartCard = isChartCard(config)
  if (isLoading) {
    return chartCard ? (
      <CollectionChart
        config={config}
        schema={null}
        rows={[]}
        totalRows={0}
        isLoading
        provenance={chartProvenance}
      />
    ) : (
      <ViewNotice>Loading rows…</ViewNotice>
    )
  }

  // No schema → not really a collection. A LINKED view whose target was deleted (or
  // was never a collection) resolves to no schema too — word that case for what it is
  // rather than the generic "add properties" hint. Either way, fail soft (#41).
  if (!schema || isError) {
    const line = isError
      ? 'That collection couldn’t be read.'
      : linked
        ? 'That collection isn’t available.'
        : 'This view needs a collection with properties.'
    // A chart card has no block frame around it (#227), so a bare notice here
    // would float on the page in no card at all — where every other mode's
    // notice still sits inside its block. The card draws its own, which is what
    // its `error` state is for.
    return chartCard ? (
      <CollectionChart
        config={config}
        schema={null}
        rows={[]}
        totalRows={0}
        errorLine={line}
        provenance={chartProvenance}
      />
    ) : (
      <ViewNotice>{line}</ViewNotice>
    )
  }

  return (
    <div className="text-sm text-mn-text">
      {editable && onConfigChange && (
        <ViewControls
          config={config}
          schema={schema}
          collectionName={collectionName}
          onConfigChange={onConfigChange}
          onUpdateSchema={onUpdateSchema}
        />
      )}
      {config.mode === 'board' ? (
        <CollectionBoard
          schema={schema}
          rows={processed}
          groupBy={config.groupBy}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      ) : config.mode === 'list' ? (
        <CollectionList
          schema={schema}
          rows={processed}
          groupBy={config.groupBy}
          editable={editable}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      ) : config.mode === 'calendar' ? (
        <CollectionCalendar
          schema={schema}
          rows={processed}
          groupBy={config.groupBy}
          editable={editable}
          onEdit={onEdit}
        />
      ) : config.mode === 'gallery' ? (
        <CollectionGallery schema={schema} rows={processed} />
      ) : config.mode === 'gantt' ? (
        <CollectionGantt
          schema={schema}
          rows={processed}
          startId={config.startDate}
          endId={config.endDate}
          editable={editable}
          onEdit={onEdit}
        />
      ) : config.mode === 'chart' ? (
        // #259: the chart's PRESENTATION — the compact inline mark (the board's
        // `bars` strip / `heat` grid) or the chart card. Same rows, same aggregation.
        !chartCard && config.chart ? (
          <CompactChart schema={schema} rows={processed} chart={config.chart} />
        ) : (
          <CollectionChart
            config={config}
            schema={schema}
            rows={processed}
            totalRows={rows.length}
            provenance={chartProvenance}
            /* `editable` gates it, as every other mode's insert is gated: a diff
               card and a create-page proposal both render this view with no
               `editable`, and an `add a row` there would write to the
               collection from a surface whose whole job is to be reviewed —
               "pages change only through the person's own edits or an accepted
               diff" (`PROJECT_RULES.md`). */
            onAddRow={editable && onAddRow ? () => void onAddRow() : undefined}
          />
        )
      ) : config.mode === 'big-number' ? (
        <CollectionBigNumber schema={schema} rows={processed} bigNumber={config.bigNumber} />
      ) : (
        <CollectionTable
          schema={schema}
          rows={processed}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
        />
      )}
    </div>
  )
}

// ── View controls (head row + mode switcher) ─────────────────────────────────

/**
 * The switcher's segments, in `Pond 06.21` 6u.1's order and words. `timeline` is the
 * `gantt` mode, and `list` is the fifth segment (6v).
 * Gallery, chart and big number are not here: each is its own block (ADR 0009), so
 * a block in one of those modes draws no switcher at all.
 */
const VIEW_SEGMENTS: readonly { mode: ViewMode; label: string }[] = [
  { mode: 'board', label: 'board' },
  { mode: 'gantt', label: 'timeline' },
  { mode: 'table', label: 'table' },
  { mode: 'calendar', label: 'calendar' },
  { mode: 'list', label: 'list' },
]

/**
 * The editable head row (6u.1): the database's name, how the board reads it
 * (`grouped by status`, read-only text), and the switcher that flips the SAME
 * collection between render modes. Every change rewrites the view block's config
 * through `onConfigChange` (the whole-block save path). A mode whose data
 * prerequisite is missing (gantt/calendar with no date property) still switches —
 * the renderer shows its own calm "needs a date property" notice.
 */
function ViewControls({
  config,
  schema,
  collectionName,
  onConfigChange,
  onUpdateSchema,
}: {
  config: ViewBlock
  schema: PropertySchema
  collectionName?: string
  onConfigChange: (patch: Partial<ViewBlock>) => void
  onUpdateSchema?: (next: PropertySchema) => void
}) {
  // The head's fact: a board reads its lanes' property, a list the date it groups by.
  const groupDef =
    config.mode === 'board'
      ? pickGroupDef(schema, config.groupBy)
      : config.mode === 'list'
        ? pickDateDef(schema, config.groupBy)
        : undefined
  const groupName = groupDef?.name.toLowerCase()
  const switchable = VIEW_SEGMENTS.some((s) => s.mode === config.mode)

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* `flex-wrap`: 6u.1 draws the name and the bar on ONE line, but it has the
          full canvas. In a narrow column the bar wraps onto its own line rather
          than crushing the name to a single letter. */}
      <div
        data-part="view-head"
        className="flex w-full flex-wrap items-center justify-between gap-x-[10px] gap-y-[6px] px-[4px] pt-[4px]"
      >
        <div className="flex min-w-0 items-baseline gap-[10px]">
          {collectionName && (
            <span data-part="db-name" className="truncate text-[15px] font-medium text-mn-text">
              {collectionName}
            </span>
          )}
          {groupName && (
            <span data-part="db-facts" className="text-[10.5px] font-medium text-mn-text-meta">
              grouped by {groupName}
            </span>
          )}
        </div>

        {switchable && (
          <div
            data-part="view-bar"
            className="flex flex-none items-center gap-[4px] rounded-full bg-mn-text/[0.055] p-[3px] text-[10.5px] font-medium"
          >
            {VIEW_SEGMENTS.map(({ mode, label }) => {
              const active = config.mode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  data-part="view-segment"
                  data-active={active || undefined}
                  aria-pressed={active}
                  onClick={() => onConfigChange({ mode })}
                  className={[
                    'rounded-full px-[10px] py-[4px] transition-colors duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none',
                    // The board's active segment is `#1B1D14` ground with `#FAF9EF`
                    // text — the same inversion `ui/button`'s `primary` makes, so it
                    // reassigns correctly in dark rather than staying ink-on-ink.
                    active
                      ? 'bg-mn-text text-raw-paper dark:text-raw-ink'
                      : 'text-mn-text-secondary hover:text-mn-text',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {config.mode === 'chart' && (
        <ChartControls config={config} schema={schema} onConfigChange={onConfigChange} />
      )}

      {config.mode === 'big-number' && (
        <BigNumberControls config={config} schema={schema} onConfigChange={onConfigChange} />
      )}

      {onUpdateSchema && <AddPropertyControl onAdd={(def) => onUpdateSchema([...schema, def])} />}
    </div>
  )
}

/**
 * Manual "+ Add property" affordance (board-authoring Slice 4). Reveals a terse
 * inline form — a name and a type — and appends a new PropertyDef to the schema,
 * bypassing the AI (decision 3). Adding a `date` property is the honest way to
 * unlock Gantt/Timeline/Calendar (add Start + End, fill dates, switch to Gantt).
 * Relation/rollup are omitted — they need a target/aggregate the AI resolves, so
 * they stay conversational this pass.
 */
const ADDABLE_TYPES = PROPERTY_TYPES.filter(
  (t) => t !== 'relation' && t !== 'rollup'
) as PropertyType[]

function AddPropertyControl({ onAdd }: { onAdd: (def: PropertyDef) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<PropertyType>('date')

  const commit = () => {
    const def: PropertyDef = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Untitled',
      type,
    }
    // select/status carry a (initially empty) option list — columns are then added
    // on the board itself (or cells become a picker in the table).
    if (type === 'select' || type === 'status') def.options = []
    onAdd(def)
    setName('')
    setType('date')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-mn-chrome px-2 py-0.5 text-xs text-mn-text-secondary transition-colors hover:bg-mn-wash hover:text-mn-text"
      >
        + Add property
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        aria-label="New property name"
        autoFocus
        value={name}
        placeholder="Property name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setOpen(false)
        }}
        className="w-32 rounded-mn-chrome shadow-mn-sm bg-transparent px-1 py-0.5 text-xs text-mn-text outline-none placeholder:text-mn-text-secondary"
      />
      <select
        aria-label="New property type"
        value={type}
        onChange={(e) => setType(e.target.value as PropertyType)}
        className="rounded-mn-chrome shadow-mn-sm bg-transparent px-1 py-0.5 text-xs text-mn-text outline-none"
      >
        {ADDABLE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={commit}
        className="rounded-mn-chrome bg-mn-wash px-2 py-0.5 text-xs text-mn-text transition-colors hover:bg-mn-text hover:text-mn-surface"
      >
        Add
      </button>
      <button
        type="button"
        aria-label="Cancel adding property"
        onClick={() => setOpen(false)}
        className="rounded-mn-chrome px-1 py-0.5 text-xs text-mn-text-secondary transition-colors hover:text-mn-text"
      >
        ×
      </button>
    </span>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

function CollectionTable({
  schema,
  rows,
  editable,
  onEdit,
  onAddRow,
  onRenameRow,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
}) {
  return (
    <div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th className="border-b border-mn-hair py-1 pr-3 text-xs font-medium text-mn-text-secondary">
              Name
            </th>
            {schema.map((def) => (
              <th
                key={def.id}
                className="border-b border-mn-hair py-1 pr-3 text-xs font-medium text-mn-text-secondary"
              >
                {def.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* No empty row of its own: on a page the frame owns the empty state
              (PondBlock state="empty", #239) and suppresses this view entirely. */}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-mn-line last:border-b-0 align-top">
              <td className="py-1.5 pr-3 font-medium text-mn-text">
                {editable && onRenameRow ? (
                  <input
                    aria-label="Row title"
                    value={row.title}
                    placeholder="Untitled"
                    onChange={(e) => onRenameRow(row.id, e.target.value)}
                    className="w-full border-0 bg-transparent p-0 font-medium text-mn-text outline-none placeholder:text-mn-text-secondary"
                  />
                ) : (
                  row.title || 'Untitled'
                )}
              </td>
              {schema.map((def) => (
                <td key={def.id} className="py-1.5 pr-3">
                  <Cell
                    def={def}
                    value={coerceValue(def, row.values[def.id])}
                    editable={!!editable}
                    onChange={(v) => onEdit?.(row.id, def.id, v)}
                    schema={schema}
                    rowValues={row.values}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {editable && onAddRow && (
        <button
          type="button"
          onClick={() => onAddRow()}
          className="mt-2 rounded-mn-chrome px-2 py-1 text-xs text-mn-text-secondary transition-colors hover:bg-mn-wash hover:text-mn-text"
        >
          + Add row
        </button>
      )}
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────────────────────

// The DOM key for a null (unset) bucket — a stable sentinel shared by board columns
// and calendar lanes so the drag hook can hit-test them uniformly.
const NULL_BUCKET = '__none__'

function CollectionBoard({
  schema,
  rows,
  groupBy,
  editable,
  onEdit,
  onAddRow,
  onRenameRow,
  onOpenRow,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
}) {
  const groupDef = pickGroupDef(schema, groupBy)
  const grouped = useMemo(() => groupRows(rows, schema, groupDef?.id), [rows, schema, groupDef])
  const groupKey = (id: string | null) => id ?? NULL_BUCKET
  // The row whose title input should take focus — set when a card is just added, so
  // "＋ task" drops you straight into typing the new card's name.
  const [focusRowId, setFocusRowId] = useState<string | null>(null)
  // `today` is read once per mount: a board left open across midnight keeps the
  // day it was drawn on until it next renders fresh.
  const [now] = useState(() => new Date())

  // Card drag between columns (finding F4), now shared with the calendar via the
  // hook. Dropping into a bucket writes that option id onto the group-by property;
  // the "No <name>" bucket clears the value (null). A no-op drop into the same
  // column is idempotent — the optimistic cache dedupes it.
  const { drag, overKey, registerBucket, onCardPointerDown, containerHandlers } =
    usePointerBucketDrag({
      editable: !!editable,
      onDrop: (rowId, key) => {
        if (!grouped) return
        const target = grouped.groups.find((g) => groupKey(g.id) === key)
        if (target) onEdit?.(rowId, grouped.def.id, target.id)
      },
    })

  const {
    rootRef: boardRef,
    selection,
    selectedRow,
    select: setSelection,
  } = useRecordSelection(rows)
  // A drag that ends over its own card still fires a click — it must not select.
  const draggedRef = useRef(false)
  useEffect(() => {
    if (drag?.active) draggedRef.current = true
  }, [drag?.active])

  if (!grouped) {
    return <ViewNotice>This board needs a group-by (select or status) property.</ViewNotice>
  }
  const { def: boardDef, groups } = grouped

  // "＋ task": mint a row seeded with this column's status (null → the "No <name>"
  // bucket), then focus its title so you can name it immediately.
  const addCard = async (optionId: string | null) => {
    if (!onAddRow) return
    const id = await onAddRow(optionId ? { [boardDef.id]: optionId } : {})
    if (!id) return
    setFocusRowId(id)
    setSelection({ id, via: 'pointer' })
  }

  // Hide the trailing "No <name>" bucket while it's empty — a fresh board then reads
  // as a clean set of just its status columns. It reappears the moment a card lands
  // there unset (a drag-out or a statusless add).
  const visibleGroups = groups.filter((g) => g.id !== null || g.rows.length > 0)

  const draggingRow = drag?.active ? rows.find((r) => r.id === drag.rowId) : undefined
  // A card's meta row: the row's date as the due atom, then its repeat tag, then the
  // other select/status properties as context chips.
  const dateDef = pickDateDef(schema, undefined)
  const repeatDef = pickRepeatDef(schema)
  const chipDefs = schema.filter(
    (d) =>
      (d.type === 'select' || d.type === 'status') && d.id !== boardDef.id && d.id !== repeatDef?.id
  )
  // Burnt orange is the ONE dated thing per screen (PROJECT_RULES): only the first
  // card due today, in render order, wears the pill. The rest read `today` as a date.
  const dueOf = (row: CollectionRow) =>
    dateDef ? dueAtom(String(coerceValue(dateDef, row.values[dateDef.id]) ?? ''), now) : null
  const orangeTodayId = visibleGroups
    .flatMap((g) => g.rows)
    .find((r) => dueOf(r)?.kind === 'today')?.id
  const selectedLane = selectedRow
    ? visibleGroups.find((g) => g.rows.some((r) => r.id === selectedRow.id))
    : undefined

  return (
    <div ref={boardRef} {...containerHandlers}>
      {/*
        `Pond 06.21 Tasks` draws the board as a GRID of equal lanes, not a
        horizontally scrolling row: `repeat(N, minmax(0,1fr))` at gap 10, where N
        is the lane count (its own Tasks example renders `repeat(4,…)`). The
        lanes are the board's whole structure — a lane is an option of the group-by
        property, so adding, renaming and reordering them is editing that property,
        which the board does not do.

        (`board-values.generated.json` also has a `kanban`/`lane` set under
        PondTemplate — that is the MINIATURE inside a template preview card, lane
        min-height 90 against 06.21's 380. Same design at two scales; this is the
        full-size one.)
      */}
      <div
        data-part="lanes"
        className="grid gap-[10px]"
        style={{ gridTemplateColumns: `repeat(${visibleGroups.length}, minmax(0,1fr))` }}
      >
        {visibleGroups.map((group) => {
          const key = groupKey(group.id)
          const isOver = editable && drag?.active && overKey === key
          // A card in the lane named `done` is a finished one: its title steps down a tier.
          const laneDone = group.label.trim().toLowerCase() === 'done'
          return (
            <section
              key={key}
              ref={registerBucket(key)}
              data-part="lane"
              data-lane={group.label}
              // The board's lane is a faint RECESSED wash — ink .04, radius 16,
              // no shadow. The drop target brightens it rather than lifting it,
              // because a lane that gains a shadow reads as a card, which is the
              // thing it is deliberately not.
              className={[
                'flex min-h-[380px] flex-col gap-[7px] rounded-[16px] p-[7px]',
                'transition-colors duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none',
                isOver ? 'bg-mn-text/[0.08]' : 'bg-mn-text/[0.04]',
              ].join(' ')}
            >
              <header
                data-part="lane-head"
                className="flex items-center justify-between gap-2 px-[4px] pt-[3px] pb-[2px] text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase"
              >
                {/* 06.21's lane head is exactly two spans — `<span>to do</span>
                    <span>3</span>` — so there is no option dot here. The one the
                    board does not draw is not drawn (AGENTS.md). The count
                    INHERITS the head: it is a bare `<span>3</span>` with no font of
                    its own. (`PondTemplate`'s `laneN` makes it mono at
                    letterSpacing 0, but that is the miniature in a template
                    preview card, not this.) */}
                <span className="truncate">{group.label}</span>
                <span data-part="lane-n">{group.rows.length}</span>
              </header>

              {group.rows.map((row) => {
                const isDragging = drag?.active && drag.rowId === row.id
                const due = dueOf(row)
                const isSelected = row.id === selectedRow?.id
                const repeat = repeatDef ? displayValue(repeatDef, row.values[repeatDef.id]) : ''
                return (
                  <article
                    key={row.id}
                    data-part="card"
                    data-row-id={row.id}
                    // A card is a keyboard stop: Enter or Space on the card itself (not
                    // on the title input inside it) selects it and opens its peek.
                    // `aria-current` marks the selected one — `aria-pressed` and
                    // `aria-selected` are not valid on an article holding an input.
                    tabIndex={0}
                    aria-label={row.title || 'Untitled'}
                    aria-current={isSelected ? 'true' : undefined}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      setSelection({ id: row.id, via: 'keyboard' })
                    }}
                    // The card itself is the drag target: a press anywhere on it
                    // starts a candidate drag, and below the hook's threshold it
                    // stays a click — so the title input still takes focus. Buttons
                    // and links keep their own presses.
                    onPointerDown={
                      editable
                        ? (e) => {
                            if (!(e.target instanceof Element) || !e.target.closest('button, a')) {
                              onCardPointerDown(e, row.id)
                            }
                          }
                        : undefined
                    }
                    // A click on the card's passive body selects it; its own controls
                    // keep their clicks — the pure filter decides. The title input
                    // selects through its own click below.
                    onClick={(e) => {
                      if (draggedRef.current) {
                        draggedRef.current = false
                        return
                      }
                      if (shouldOpenCardFromClick(e.target)) {
                        setSelection({ id: row.id, via: 'pointer' })
                      }
                    }}
                    // The board's card: card paper at radius 12, 10/11, gap 7, and
                    // a TWO-LAYER shadow that matches no token — written out per
                    // AGENTS.md rather than snapped to `--mn-shadow-card`, whose
                    // second layer is `0 8px 24px` against this one's `0 2px 8px`.
                    className={[
                      'flex flex-col gap-[7px] rounded-[12px] bg-mn-card px-[11px] py-[10px]',
                      // Both themes: the board's warm light shadow is invisible on
                      // the dark ground, so the ink recipe is supplied the way every
                      // other raw shadow in the repo does (`chart/card.tsx`).
                      'shadow-[0_1px_2px_rgba(40,34,24,.06),0_2px_8px_rgba(40,34,24,.05)]',
                      'dark:shadow-[0_1px_2px_rgba(0,0,0,.34),0_2px_8px_rgba(0,0,0,.4)]',
                      'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none',
                      // Selected: a 1.5px ink .5 outline offset 1 (paper .5 on the dark
                      // ground — `mn-text` flips). The rest shadow does not change.
                      'outline-[1.5px] outline-offset-1 outline-mn-text/50',
                      isSelected ? 'outline-solid' : 'outline-none focus-visible:outline-solid',
                      isDragging ? 'opacity-30' : '',
                      editable ? 'cursor-grab' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    {editable && onRenameRow ? (
                      <input
                        aria-label="Card title"
                        value={row.title}
                        placeholder="Untitled"
                        autoFocus={row.id === focusRowId}
                        onClick={() => {
                          if (draggedRef.current) return
                          setSelection({ id: row.id, via: 'pointer' })
                        }}
                        onChange={(e) => onRenameRow(row.id, e.target.value)}
                        className={[
                          'w-full border-0 bg-transparent p-0 text-[13.5px] leading-[1.35] outline-none placeholder:text-mn-text-secondary',
                          laneDone ? 'text-mn-text-secondary' : 'text-mn-text',
                        ].join(' ')}
                      />
                    ) : (
                      <div
                        className={[
                          'text-[13.5px] leading-[1.35]',
                          laneDone ? 'text-mn-text-secondary' : 'text-mn-text',
                        ].join(' ')}
                      >
                        {row.title || 'Untitled'}
                      </div>
                    )}
                    {(due || repeat || chipDefs.length > 0) && (
                      // The board's meta row: wrapping, gap 4/10, 500 at 11px on
                      // the .8 ink tier — a row of facts, not a stack of chips.
                      <div
                        data-part="card-meta"
                        className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[11px] font-medium text-mn-text-meta"
                      >
                        {due?.kind === 'today' && row.id === orangeTodayId && <PondDueToday />}
                        {due?.kind === 'today' && row.id !== orangeTodayId && (
                          <span data-part="card-due">today</span>
                        )}
                        {due?.kind === 'date' && <span data-part="card-due">{due.label}</span>}
                        {repeat && (
                          <span
                            data-part="card-repeat"
                            className="inline-flex items-center gap-[4px]"
                          >
                            <RepeatMark />
                            {repeat}
                          </span>
                        )}
                        {chipDefs.map((def) => {
                          const opt = optionForValue(def, coerceValue(def, row.values[def.id]))
                          if (!opt) return null
                          return <OptionChip key={def.id} label={opt.label} color={opt.color} />
                        })}
                      </div>
                    )}
                  </article>
                )
              })}

              {/* 06.21: "The last line of every lane is ＋ task." It is a line
                  INSIDE the lane, after the cards, not a button beside it. */}
              {editable && onAddRow && (
                <button
                  type="button"
                  data-part="lane-add"
                  onClick={() => addCard(group.id)}
                  className="rounded-[8px] p-[4px] text-left text-[11px] font-medium text-mn-text-secondary transition-colors hover:bg-mn-text/[0.04] hover:text-mn-text motion-reduce:transition-none"
                >
                  ＋ task
                </button>
              )}
            </section>
          )
        })}
      </div>

      {selectedRow && (
        <RecordPeek
          key={selectedRow.id}
          row={selectedRow}
          schema={schema}
          done={selectedLane?.label.trim().toLowerCase() === 'done'}
          now={now}
          editable={editable}
          focusOnOpen={selection?.via === 'keyboard'}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}

      {/* Floating clone that tracks the pointer — the lift. */}
      {draggingRow && drag && (
        <div
          // The drag lift: rotated -1.2deg with its own two-layer shadow, per the
          // board — it matches no token. The rotation is dropped under reduced motion.
          className="pointer-events-none fixed z-50 w-52 -rotate-[1.2deg] rounded-[12px] bg-mn-card px-[11px] py-[10px] shadow-[0_2px_4px_rgba(40,34,24,.08),0_10px_24px_rgba(40,34,24,.12)] motion-reduce:rotate-none dark:shadow-[0_2px_4px_rgba(0,0,0,.3),0_10px_24px_rgba(0,0,0,.4)]"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          aria-hidden
        >
          <div className="text-[13.5px] leading-[1.35] text-mn-text">
            {draggingRow.title || 'Untitled'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Calendar (agenda) ───────────────────────────────────────────────────────────

/** Format a `YYYY-MM-DD` lane key as a human header ("Mon Sep 8"). Built from the
 *  date parts at local midnight so the weekday never drifts a day by timezone. */
function formatDateHeader(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Calendar view — a chronological agenda (decision: slice-4 grill). Rows sit under a
 * header per date, earliest first, with a trailing "No date" lane. The date property
 * is the one the view names in `groupBy` (reused field) if it's a date, else the
 * first date property. Reschedule two ways: drag a card onto another lane (writes
 * that lane's date; the "No date" lane clears it) OR edit the inline date field to
 * reach any date. Both write optimistically via `onEdit`.
 */
function CollectionCalendar({
  schema,
  rows,
  groupBy,
  editable,
  onEdit,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  const dateDef = useMemo(() => pickDateDef(schema, groupBy), [schema, groupBy])
  const grouped = useMemo(
    () => (dateDef ? groupRowsByDate(rows, schema, dateDef.id) : null),
    [rows, schema, dateDef]
  )
  const laneKey = (iso: string | null) => iso ?? NULL_BUCKET

  const { drag, overKey, registerBucket, onCardPointerDown, containerHandlers } =
    usePointerBucketDrag({
      editable: !!editable,
      onDrop: (rowId, key) => {
        if (!dateDef) return
        onEdit?.(rowId, dateDef.id, key === NULL_BUCKET ? null : key)
      },
    })

  if (!dateDef || !grouped) {
    return <ViewNotice>This calendar needs a date property.</ViewNotice>
  }
  const { buckets } = grouped

  const draggingRow = drag?.active ? rows.find((r) => r.id === drag.rowId) : undefined
  const chipDefs = schema.filter((d) => d.type === 'select' || d.type === 'status')

  return (
    <div {...containerHandlers}>
      {/* Undated rows land in the null lane, so no buckets means no rows to draw —
          none at all, or none the view's filter lets through — and the frame owns
          both empty states (#239). */}
      <div className="space-y-4">
        {buckets.map((bucket) => {
          const key = laneKey(bucket.iso)
          const isOver = editable && drag?.active && overKey === key
          return (
            <section
              key={key}
              ref={registerBucket(key)}
              className={[
                'rounded-mn-inner px-3 py-2 transition-[background-color,box-shadow]',
                isOver ? 'bg-mn-wash shadow-mn-md' : 'bg-mn-card/40 shadow-mn-sm',
              ].join(' ')}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-[0.65rem] font-medium tracking-[0.14em] text-mn-text-secondary uppercase">
                  {bucket.iso ? formatDateHeader(bucket.iso) : 'No date'}
                </span>
                <span className="text-[0.65rem] text-mn-text-secondary tabular-nums">
                  {bucket.rows.length}
                </span>
              </header>

              <ul className="space-y-2">
                {bucket.rows.map((row) => {
                  const isDragging = drag?.active && drag.rowId === row.id
                  return (
                    <li
                      key={row.id}
                      className={[
                        'relative flex items-start gap-1.5 rounded-mn-row bg-mn-card px-2 py-2 shadow-mn-sm',
                        'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-mn)] hover:shadow-mn-md motion-reduce:transition-none',
                        isDragging ? 'opacity-30' : '',
                      ].join(' ')}
                    >
                      {editable && (
                        <button
                          type="button"
                          aria-label={`Drag card: ${row.title || 'untitled'}`}
                          onPointerDown={(e) => onCardPointerDown(e, row.id)}
                          className="mt-0.5 cursor-grab touch-none leading-none text-mn-text-secondary/50 select-none hover:text-mn-text-secondary"
                        >
                          ⠿
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-mn-text">{row.title || 'Untitled'}</div>
                        {chipDefs.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {chipDefs.map((def) => {
                              const opt = optionForValue(def, coerceValue(def, row.values[def.id]))
                              if (!opt) return null
                              return <OptionChip key={def.id} label={opt.label} color={opt.color} />
                            })}
                          </div>
                        )}
                        {editable && (
                          <div className="mt-1.5">
                            <Cell
                              def={dateDef}
                              value={coerceValue(dateDef, row.values[dateDef.id])}
                              editable
                              onChange={(v) => onEdit?.(row.id, dateDef.id, v)}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      {/* Floating clone that tracks the pointer — the lift. */}
      {draggingRow && drag && (
        <div
          className="pointer-events-none fixed z-50 w-52 rotate-2 rounded-mn-row bg-mn-card px-2.5 py-2 shadow-mn-lg motion-reduce:rotate-0"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          aria-hidden
        >
          <div className="font-medium text-mn-text">{draggingRow.title || 'Untitled'}</div>
        </div>
      )}
    </div>
  )
}

// ── Gallery ─────────────────────────────────────────────────────────────────────

/**
 * Gallery view — a read-only card grid, drawn to `PondTemplate.dc.html` (#260):
 *
 *   gallery { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }
 *   gcard   { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }
 *   img     { display: 'block', height: 64, borderRadius: 12, background: a(.07) }  // filled
 *   tStyle  { fontSize: 13.5, fontWeight: 500, color: fg }
 *   mStyle  { fontFamily: mono, fontSize: 10.5, color: a(.68) }
 *
 * EVERY record is a card: the board's `list.slice(0, mob ? 2 : 3)` is the template
 * preview's truncation, not a product rule. The tile is the board's filled ground —
 * there is no image property type, so it is a slot, not a picture. The board's
 * ring-on-transparent tile belongs to its EMPTY cards, which the product never draws:
 * an empty gallery is the frame's `no records yet` (#239). `untitled` and `—` are the
 * board's own fallbacks; which field the one meta line shows is `galleryCardMeta`.
 *
 * Why not `PondMolecule kind="record-card"`, which `PondBlock.dc.html`'s gallery
 * frame composes: ADR 0004's ladder sends a block to the molecule only where the
 * molecule can express every case the templates need, and the record-card ALWAYS
 * draws a tag chip (`tagText: p.tag ?? 'recipe'`) that no template gallery has
 * (`collection › records` is a title and one line). As `entries` (ADR 0004 §8), the
 * template's inline card is therefore the specification; the molecule stays for the
 * block board's demo. Mobile (2 columns, 70-high tile) is the frame's later slice —
 * `PondBlock` has no size axis yet. Class strings are literals, never `cn` (#252).
 */
const GALLERY = 'grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[10px]'
const GALLERY_CARD = 'flex min-w-0 flex-col gap-[6px]'
const GALLERY_IMAGE = 'block h-[64px] rounded-[12px] bg-mn-text/[0.07]'
const GALLERY_TITLE = 'text-[13.5px] font-medium text-mn-text'
const GALLERY_META = 'font-mono text-[10.5px] text-mn-text-secondary'

function CollectionGallery({ schema, rows }: { schema: PropertySchema; rows: CollectionRow[] }) {
  // No empty line of its own: the frame owns the empty state (#239).
  return (
    <div data-part="gallery" className={GALLERY}>
      {rows.map((row) => (
        <article key={row.id} data-part="gallery-card" className={GALLERY_CARD}>
          <span aria-hidden data-part="gallery-image" className={GALLERY_IMAGE} />
          <span data-part="gallery-title" className={GALLERY_TITLE}>
            {row.title || 'untitled'}
          </span>
          <span data-part="gallery-meta" className={GALLERY_META}>
            {galleryCardMeta(schema, row) || '—'}
          </span>
        </article>
      ))}
    </div>
  )
}

// ── Gantt (read-only timeline) ────────────────────────────────────────────────
// The board's geometry and the pure readings live in gantt-shared.ts (#260); this is
// the drawing and the drag.

/** Below this RENDERED bar width (px) the edge handles are suppressed and the bar is
 *  move-only (spec): there isn't room to grab a 6px edge without it swallowing the body. */
const NARROW_BAR_PX = 18

/**
 * Gantt view (#27) — a timeline. Each row is one bar spanning its Start→End date over
 * a single adaptive axis (min start … max end), sorted by start. A row with a Start but
 * no End is a single-day tick; a row with no Start is omitted. The date properties are
 * the ones the view names in `startDate`/`endDate`, else the collection's 1st/2nd date
 * property (pickGanttDefs). No date property at all → a calm notice, like the calendar;
 * nothing dated → the board's voidBox through `PondBlockEmpty` (#260).
 *
 * Drawn to `PondTemplate.dc.html`'s `gantt` (#260, values in `gantt-shared.ts`): a head
 * row of four mono-10 ticks at the range's quarters over the .09 hairline, then one
 * `gRow` per bar — a 120px label column and an 18-high track with 25% gridlines — each
 * on its own .055 hairline; bars at top/bottom 4, radius 4, `%`-positioned, full ink
 * live and ink .22 done (`ganttRowDone`).
 *
 * When `editable`, bars reschedule by drag (`usePointerGanttDrag`): the body MOVES the
 * bar (start+end together), the right edge resizes the End (and CREATES one on a tick,
 * turning a milestone into a span), and the left edge resizes the Start (real spans
 * only — a single-day tick offers move + extend, not shrink). Writes go straight to the
 * optimistic `onEdit`, bypassing the AI (decision 17), exactly like the calendar. With
 * no End property the collection is move-only (nowhere to store an end). Drag previews
 * locally and commits on drop, so the axis holds steady mid-gesture and reflows after.
 */
function CollectionGantt({
  schema,
  rows,
  startId,
  endId,
  editable,
  onEdit,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  startId?: string
  endId?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  const defs = useMemo(() => pickGanttDefs(schema, startId, endId), [schema, startId, endId])
  const layout = useMemo(
    () => (defs ? layoutGanttBars(rows, defs.startDef, defs.endDef) : null),
    [rows, defs]
  )

  // The frozen span for the px→day ratio. Computed with a safe fallback so the hook
  // (which must run unconditionally, before the notice guards) always has a value.
  const totalDays =
    layout?.rangeStart && layout?.rangeEnd
      ? Math.max(1, epochDay(layout.rangeEnd) - epochDay(layout.rangeStart) + 1)
      : 1

  const { drag, onBarPointerDown, containerHandlers } = usePointerGanttDrag({
    editable: !!editable,
    totalDays,
    onCommit: (rowId, shift) => {
      if (!defs) return
      if (shift.startIso !== undefined) onEdit?.(rowId, defs.startDef.id, shift.startIso)
      if (shift.endIso !== undefined && defs.endDef) onEdit?.(rowId, defs.endDef.id, shift.endIso)
    },
  })

  // Live pixel width of a track lane — every row shares the same flex-1 track, so we
  // measure the first and reuse it. A callback ref wires a ResizeObserver as the node
  // mounts (and re-wires if the first row's identity changes), which lets the render
  // decide the narrow-bar rule (edges suppressed under NARROW_BAR_PX) against the
  // ACTUAL rendered width — not just the day count. 0 until measured → edges show.
  const [trackPx, setTrackPx] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)
  const measureTrack = useCallback((el: HTMLSpanElement | null) => {
    observerRef.current?.disconnect()
    if (!el) return
    setTrackPx(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(() => setTrackPx(el.getBoundingClientRect().width))
    ro.observe(el)
    observerRef.current = ro
  }, [])

  if (!defs) {
    return <ViewNotice>This gantt needs a date property.</ViewNotice>
  }
  if (!layout || layout.bars.length === 0 || !layout.rangeStart || !layout.rangeEnd) {
    // Nothing dated: the shared voidBox with the template's own line — true whether the
    // rows are missing or simply carry no dates. Rendered through PondBlockEmpty, never
    // a second empty component (#259's geometry).
    return <PondBlockEmpty box="void" line={GANTT_EMPTY_LINE} />
  }

  const { bars, rangeStart } = layout
  const { endDef } = defs
  const startDay = epochDay(rangeStart)
  const pct = (day: number) => ((day - startDay) / totalDays) * 100
  const ticks = quarterTicks(rangeStart, totalDays)

  return (
    <div {...containerHandlers}>
      <div className={drag?.active ? 'cursor-grabbing select-none' : undefined}>
        {/* gHead — an empty label cell, then the four ticks in their quarter cells. */}
        <div data-part="gantt-head" className={GANTT_HEAD}>
          <span />
          <div data-part="gantt-ticks" className={GANTT_TICKS}>
            {ticks.map((iso, i) => (
              // Index keys: a one-day range repeats its day across all four cells.
              <span key={i} data-part="gantt-tick" className={GANTT_TICK}>
                {formatTick(iso)}
              </span>
            ))}
          </div>
        </div>

        {/* gRow — a 120px label column + a proportional track, each on its own hairline. */}
        <ul role="list">
          {bars.map(({ row, startIso, endIso }, i) => {
            const done = ganttRowDone(schema, row)
            const dragging = drag?.active && drag.rowId === row.id
            const showStart = dragging ? drag.startIso : startIso
            const showEnd = dragging ? drag.endIso : endIso
            const left = pct(epochDay(showStart))
            // +1 so an inclusive single-day span still has visible width.
            const width = ((epochDay(showEnd) - epochDay(showStart) + 1) / totalDays) * 100
            const span = showStart === showEnd ? showStart : `${showStart} – ${showEnd}`
            const isTick = startIso === endIso // a milestone / single-day / no-end row
            // Rendered bar width in px (from the measured track). Under the threshold the
            // bar is too small to carry grabbable edges, so it's move-only (spec). Until
            // the track is measured (trackPx 0) edges show — the common, wide case.
            const narrow = trackPx > 0 && (width / 100) * trackPx < NARROW_BAR_PX
            const bar = `${GANTT_BAR_SHELL} ${done ? GANTT_BAR_INK.done : GANTT_BAR_INK.live}`
            const label = `${GANTT_LABEL} ${done ? GANTT_LABEL_INK.done : GANTT_LABEL_INK.live}`

            // The row's stored dates for the drag math: endIso is null unless the row
            // actually holds an End on/after its Start (a milestone reads as a tick).
            const rawEnd = endDef ? coerceValue(endDef, row.values[endDef.id]) : null
            const rawEndDay = typeof rawEnd === 'string' && rawEnd ? rawEnd.slice(0, 10) : null
            const dates: BarDates = {
              startIso,
              endIso: rawEndDay && rawEndDay >= startIso ? rawEndDay : null,
              hasEndDef: !!endDef,
            }

            return (
              <li key={row.id} data-part="gantt-row" className={GANTT_ROW}>
                <span data-part="gantt-label" className={label}>
                  {row.title || 'Untitled'}
                </span>
                <span
                  data-gantt-track
                  data-part="gantt-track"
                  ref={i === 0 ? measureTrack : undefined}
                  className={GANTT_TRACK}
                  style={GANTT_TRACK_STYLE}
                >
                  {editable ? (
                    <span
                      data-part="gantt-bar"
                      data-done={done || undefined}
                      className={bar}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {/* Body — drag to MOVE the whole bar. */}
                      <button
                        type="button"
                        aria-label={`Reschedule ${row.title || 'Untitled'}: ${span}`}
                        onPointerDown={(e) => onBarPointerDown(e, row.id, 'move', dates)}
                        className="absolute inset-0 h-full w-full cursor-grab touch-none rounded-[4px]"
                      />
                      {/* Left edge — resize the Start (real spans only; hidden when too narrow to grab). */}
                      {endDef && !isTick && !narrow && (
                        <button
                          type="button"
                          aria-label={`Move start of ${row.title || 'Untitled'}`}
                          onPointerDown={(e) => onBarPointerDown(e, row.id, 'resize-start', dates)}
                          className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-l-[4px] bg-mn-text"
                        />
                      )}
                      {/* Right edge — resize the End (creates one on a tick → span; hidden when too narrow). */}
                      {endDef && !narrow && (
                        <button
                          type="button"
                          aria-label={`Move end of ${row.title || 'Untitled'}`}
                          onPointerDown={(e) => onBarPointerDown(e, row.id, 'resize-end', dates)}
                          className="absolute top-0 right-0 bottom-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-r-[4px] bg-mn-text"
                        />
                      )}
                    </span>
                  ) : (
                    <span
                      role="img"
                      aria-label={`${row.title || 'Untitled'}: ${span}`}
                      data-part="gantt-bar"
                      data-done={done || undefined}
                      className={bar}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
