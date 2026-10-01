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

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ModuleViewProps } from '../types'
import { VIEW_MODES, type ViewBlock, type ViewMode } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { useCollectionRows } from './use-collection-rows'
import {
  applyView,
  displayValue,
  epochDay,
  groupRows,
  groupRowsByDate,
  layoutGanttBars,
  pickDateDef,
  pickGanttDefs,
  type BarDates,
  type CollectionRow,
} from './apply'
import { CollectionBigNumber, ChartControls, BigNumberControls, ControlSelect } from './figures'
import { CollectionChart } from './collection-chart'
import { ViewNotice } from './notice'
import { usePointerBucketDrag } from './use-pointer-bucket-drag'
import { usePointerGanttDrag } from './use-gantt-bar-drag'
import { buildTicks, formatTick, GANTT_BAR_SHELL } from './gantt-shared'
import {
  coerceValue,
  optionForValue,
  PROPERTY_TYPES,
  type PropertyDef,
  type PropertyOption,
  type PropertySchema,
  type PropertyType,
  type PropertyValue,
} from '@/lib/properties/schema'
import { RelationValueField } from '@/components/organisms/RelationValueField'
import { RollupValueField } from '@/components/organisms/RollupValueField'
// Deliberate cycle with renderers.tsx (via the modal's read-only ModuleView
// dispatch) — same shape as page/view.tsx's, and safe for the same reason: the
// component is only *invoked* at React render time, never at module eval.
import { CardPreviewModal } from '@/components/organisms/CardPreviewModal'
import { shouldOpenCardFromClick } from './card-click'

// ── Registry entry: fetch, then draw ──────────────────────────────────────────

export function ViewView({ data, editable, onChange }: ModuleViewProps<ViewBlock>) {
  // Which collection's rows this view draws: a LINKED view names another collection
  // (data.collectionId, #41); otherwise it draws its HOST page's own rows, whose id
  // arrives from the page host (DocumentPanel) through SiblingBlocks — exactly as a
  // cross-page metric reads it. `useCollectionRows` fetches + writes against whichever.
  const { pageId } = useSiblingBlocks()
  const collectionId = data.collectionId ?? pageId
  const { schema, rows, isLoading, setValue, addRow, removeRow, renameRow, updateSchema } =
    useCollectionRows(collectionId)

  // Config edits (mode/group-by) rewrite the persisted view block through the
  // module's own onChange — the same whole-block save path every editable module uses.
  const onConfigChange = onChange
    ? (patch: Partial<ViewBlock>) => onChange({ ...data, ...patch })
    : undefined

  // Card → page preview (#64). A row IS a page, so the clicked card's row id is
  // the page to preview; the modal fetches its blocks and offers "Open page".
  // `preview` survives close so the exit transition keeps its content.
  const [preview, setPreview] = useState<{ id: string; title: string } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const openCard = useCallback(
    (rowId: string) => {
      setPreview({ id: rowId, title: rows.find((r) => r.id === rowId)?.title ?? '' })
      setPreviewOpen(true)
    },
    [rows]
  )

  return (
    <>
      <CollectionView
        config={data}
        schema={schema}
        rows={rows}
        isLoading={isLoading}
        editable={editable}
        linked={!!data.collectionId}
        onEdit={setValue}
        onAddRow={addRow}
        onRemoveRow={removeRow}
        onRenameRow={renameRow}
        onConfigChange={onConfigChange}
        onUpdateSchema={editable ? updateSchema : undefined}
        onOpenCard={openCard}
      />
      <CardPreviewModal
        rowId={preview?.id ?? null}
        fallbackTitle={preview?.title}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  )
}

// ── Presentational core (story-testable) ──────────────────────────────────────

export interface CollectionViewProps {
  config: ViewBlock
  schema: PropertySchema | null
  rows: CollectionRow[]
  isLoading?: boolean
  editable?: boolean
  /** True when this is a linked view over another collection (#41) — words the
   *  "target unavailable" notice when a linked target is deleted or isn't a collection. */
  linked?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  /** Manual card/row authoring (board-authoring Slice 2). Present only on the live
   *  editable host; Storybook renders static data and omits them. */
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRemoveRow?: (rowId: string) => void
  onRenameRow?: (rowId: string, title: string) => void
  /** Rewrite the view block's own config — the mode switcher + group-by picker
   *  (board-authoring Slice 3). Absent on read-only / Storybook hosts. */
  onConfigChange?: (patch: Partial<ViewBlock>) => void
  /** Replace the collection's property schema — manual column + property editing
   *  (board-authoring Slice 4). Absent on read-only / Storybook hosts. */
  onUpdateSchema?: (next: PropertySchema) => void
  /** Open a card's page preview (#64) — a row IS a page, so this receives the
   *  row id. Present on the live host (ViewView mounts the modal); absent on
   *  Storybook/static renders, where cards stay plain (no dead affordance). */
  onOpenCard?: (rowId: string) => void
}

export function CollectionView({
  config,
  schema,
  rows,
  isLoading,
  editable,
  linked,
  onEdit,
  onAddRow,
  onRemoveRow,
  onRenameRow,
  onConfigChange,
  onUpdateSchema,
  onOpenCard,
}: CollectionViewProps) {
  const processed = useMemo(
    () => (schema ? applyView(rows, schema, config) : []),
    [rows, schema, config]
  )

  if (isLoading) {
    return <ViewNotice>Loading rows…</ViewNotice>
  }

  // No schema → not really a collection. A LINKED view whose target was deleted (or
  // was never a collection) resolves to no schema too — word that case for what it is
  // rather than the generic "add properties" hint. Either way, fail soft (#41).
  if (!schema) {
    return (
      <ViewNotice>
        {linked
          ? 'That collection isn’t available.'
          : 'This view needs a collection with properties.'}
      </ViewNotice>
    )
  }

  return (
    <div className="text-sm text-mn-text">
      {editable && onConfigChange && (
        <ViewControls
          config={config}
          schema={schema}
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
          onRemoveRow={onRemoveRow}
          onRenameRow={onRenameRow}
          onUpdateSchema={onUpdateSchema}
          onOpenCard={onOpenCard}
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
        <CollectionChart schema={schema} rows={processed} chart={config.chart} />
      ) : config.mode === 'big-number' ? (
        <CollectionBigNumber schema={schema} rows={processed} bigNumber={config.bigNumber} />
      ) : (
        <CollectionTable
          schema={schema}
          rows={processed}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRemoveRow={onRemoveRow}
          onRenameRow={onRenameRow}
        />
      )}
    </div>
  )
}

// ── View controls (mode switcher + group-by) ──────────────────────────────────

const MODE_LABELS: Record<ViewMode, string> = {
  board: 'Board',
  table: 'Table',
  gantt: 'Gantt',
  calendar: 'Calendar',
  gallery: 'Gallery',
  // #111: a chart and a big number are MODES of the same database, so they sit in
  // the same switcher as the table — switching never moves or copies the records.
  chart: 'Chart',
  'big-number': 'Big number',
}

/**
 * The editable control row (board-authoring Slice 3): flip the SAME collection
 * between render modes, and — in board mode — pick which select/status property
 * buckets the columns. Every change rewrites the view block's config through
 * `onConfigChange` (the whole-block save path). A mode whose data prerequisite is
 * missing (gantt/calendar with no date property) still switches — the renderer
 * shows its own calm "needs a date property" notice.
 */
function ViewControls({
  config,
  schema,
  onConfigChange,
  onUpdateSchema,
}: {
  config: ViewBlock
  schema: PropertySchema
  onConfigChange: (patch: Partial<ViewBlock>) => void
  onUpdateSchema?: (next: PropertySchema) => void
}) {
  const groupOptions = schema.filter((d) => d.type === 'select' || d.type === 'status')
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-mn-chrome shadow-mn-sm p-0.5">
        {VIEW_MODES.map((m) => {
          const active = config.mode === m
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => onConfigChange({ mode: m })}
              className={[
                'rounded-mn-chrome px-2 py-0.5 text-xs transition-colors',
                active
                  ? 'bg-mn-wash text-mn-text'
                  : 'text-mn-text-secondary hover:text-mn-text',
              ].join(' ')}
            >
              {MODE_LABELS[m]}
            </button>
          )
        })}
      </div>

      {config.mode === 'board' && groupOptions.length > 0 && (
        <ControlSelect
          label="Group by"
          aria="Group by property"
          value={config.groupBy ?? ''}
          onChange={(v) => onConfigChange({ groupBy: v || undefined })}
        >
          {groupOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </ControlSelect>
      )}

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
  onRemoveRow,
  onRenameRow,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRemoveRow?: (rowId: string) => void
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
            {/* Trailing gutter for the per-row delete affordance. */}
            <th className="w-6 border-b border-mn-hair" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={schema.length + 2} className="py-2 text-mn-text-secondary">
                No rows yet
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.id}
              className="group/row border-b border-mn-line last:border-b-0 align-top"
            >
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
              <td className="py-1.5 text-right align-middle">
                {editable && onRemoveRow && (
                  <button
                    type="button"
                    aria-label={`Delete row: ${row.title || 'untitled'}`}
                    onClick={() => onRemoveRow(row.id)}
                    className="rounded-mn-chrome px-1 leading-none text-mn-text-secondary opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-mn-text focus-visible:opacity-100"
                  >
                    ×
                  </button>
                )}
              </td>
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
  onRemoveRow,
  onRenameRow,
  onUpdateSchema,
  onOpenCard,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRemoveRow?: (rowId: string) => void
  onRenameRow?: (rowId: string, title: string) => void
  onUpdateSchema?: (next: PropertySchema) => void
  onOpenCard?: (rowId: string) => void
}) {
  const grouped = useMemo(() => groupRows(rows, schema, groupBy), [rows, schema, groupBy])
  const groupKey = (id: string | null) => id ?? NULL_BUCKET
  // The row whose title input should take focus — set when a card is just added, so
  // "+ Add card" drops you straight into typing the new card's name.
  const [focusRowId, setFocusRowId] = useState<string | null>(null)
  // The column (option id) whose header input should take focus — set when a column
  // is just added, so "+ Add column" drops you straight into naming it.
  const [focusColId, setFocusColId] = useState<string | null>(null)

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

  if (!grouped) {
    return <ViewNotice>This board needs a group-by (select or status) property.</ViewNotice>
  }
  const { def: groupDef, groups } = grouped

  // "+ Add card": mint a row seeded with this column's status (null → the "No <name>"
  // bucket), then focus its title so you can name it immediately.
  const addCard = async (optionId: string | null) => {
    if (!onAddRow) return
    const id = await onAddRow(optionId ? { [groupDef.id]: optionId } : {})
    if (id) setFocusRowId(id)
  }

  // Manual column editing (board-authoring Slice 4): a board column IS an option on
  // the group-by property, so add/rename/reorder are edits to `groupDef.options`
  // persisted through `onUpdateSchema`. The trailing "No <name>" bucket is not an
  // option (id === null) and carries no edit affordances. crypto.randomUUID mints the
  // stable option id manual edits rely on — the same contract the AI accept path uses.
  const canEditColumns = !!editable && !!onUpdateSchema
  const writeOptions = (options: PropertyOption[]) => {
    if (!onUpdateSchema) return
    onUpdateSchema(schema.map((d) => (d.id === groupDef.id ? { ...d, options } : d)))
  }
  const addColumn = () => {
    const opt: PropertyOption = { id: crypto.randomUUID(), label: 'New column' }
    writeOptions([...(groupDef.options ?? []), opt])
    setFocusColId(opt.id)
  }
  const renameColumn = (optId: string, label: string) => {
    writeOptions((groupDef.options ?? []).map((o) => (o.id === optId ? { ...o, label } : o)))
  }
  const moveColumn = (optId: string, dir: 'left' | 'right') => {
    const opts = [...(groupDef.options ?? [])]
    const i = opts.findIndex((o) => o.id === optId)
    const j = dir === 'left' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= opts.length) return
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
    writeOptions(opts)
  }

  // Hide the trailing "No <name>" bucket while it's empty — a fresh board then reads
  // as a clean set of just its status columns. It reappears the moment a card lands
  // there unset (a drag-out or a statusless add).
  const visibleGroups = groups.filter((g) => g.id !== null || g.rows.length > 0)

  const draggingRow = drag?.active ? rows.find((r) => r.id === drag.rowId) : undefined
  // The other select/status properties shown as context chips on each card.
  const chipDefs = schema.filter(
    (d) => (d.type === 'select' || d.type === 'status') && d.id !== groupDef.id
  )

  return (
    <div {...containerHandlers}>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {visibleGroups.map((group) => {
          const key = groupKey(group.id)
          const isOver = editable && drag?.active && overKey === key
          // Column editing applies only to real option columns, never the null bucket.
          const columnEditable = canEditColumns && group.id !== null
          const optIndex = groupDef.options?.findIndex((o) => o.id === group.id) ?? -1
          const optCount = groupDef.options?.length ?? 0
          return (
            <section
              key={key}
              ref={registerBucket(key)}
              className={[
                'group/col min-w-[13rem] flex-1 rounded-mn-inner px-3 py-2 transition-[background-color,box-shadow]',
                isOver
                  ? 'bg-mn-wash shadow-mn-md'
                  : 'bg-mn-card/40 shadow-mn-sm',
              ].join(' ')}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <OptionDot color={group.color} />
                  {columnEditable ? (
                    <input
                      aria-label={`Column name: ${group.label}`}
                      value={group.label}
                      placeholder="Untitled"
                      autoFocus={group.id === focusColId}
                      onChange={(e) => renameColumn(group.id as string, e.target.value)}
                      // The typed name sits at full ink and the "Untitled" prompt a
                      // tier below it (.68), so an unnamed column is legible AS unnamed.
                      // Both tiers are legal; the two must never be the same one (#220).
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[0.65rem] font-medium tracking-[0.14em] text-mn-text uppercase outline-none placeholder:text-mn-text-secondary"
                    />
                  ) : (
                    <span className="truncate text-[0.65rem] font-medium tracking-[0.14em] text-mn-text-secondary uppercase">
                      {group.label}
                    </span>
                  )}
                </span>
                {columnEditable && (
                  <span className="flex items-center opacity-0 transition-opacity group-hover/col:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={`Move column left: ${group.label}`}
                      disabled={optIndex <= 0}
                      onClick={() => moveColumn(group.id as string, 'left')}
                      className="grid place-items-center rounded-mn-chrome px-0.5 text-mn-text-secondary hover:text-mn-text disabled:opacity-30 disabled:hover:text-mn-text-secondary"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M7.5 3L4.5 6l3 3"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move column right: ${group.label}`}
                      disabled={optIndex < 0 || optIndex >= optCount - 1}
                      onClick={() => moveColumn(group.id as string, 'right')}
                      className="grid place-items-center rounded-mn-chrome px-0.5 text-mn-text-secondary hover:text-mn-text disabled:opacity-30 disabled:hover:text-mn-text-secondary"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M4.5 3l3 3-3 3"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </span>
                )}
                <span className="text-[0.65rem] text-mn-text-secondary tabular-nums">
                  {group.rows.length}
                </span>
              </header>

              <ul className="space-y-2">
                {group.rows.length === 0 && (
                  <li className="py-1 text-xs text-mn-text-secondary/70">
                    {editable ? 'Drop a card here' : 'Empty'}
                  </li>
                )}
                {group.rows.map((row) => {
                  const isDragging = drag?.active && drag.rowId === row.id
                  return (
                    <li
                      key={row.id}
                      // Click-to-preview (#64): a click on the card's passive body
                      // opens its page preview; clicks on the card's own controls
                      // (drag handle, title input, ×, ↗) stay theirs — the pure
                      // filter decides. Keyboard access rides the ↗ button below.
                      onClick={
                        onOpenCard
                          ? (e) => {
                              if (shouldOpenCardFromClick(e.target)) onOpenCard(row.id)
                            }
                          : undefined
                      }
                      className={[
                        'group/card relative flex items-start gap-1.5 rounded-mn-row bg-mn-card px-2 py-2 shadow-mn-sm',
                        'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-mn)] hover:shadow-mn-md motion-reduce:transition-none',
                        isDragging ? 'opacity-30' : '',
                        onOpenCard ? 'cursor-pointer' : '',
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
                        {editable && onRenameRow ? (
                          <input
                            aria-label="Card title"
                            value={row.title}
                            placeholder="Untitled"
                            autoFocus={row.id === focusRowId}
                            onChange={(e) => onRenameRow(row.id, e.target.value)}
                            // Leave room for the hover delete × so a long title never slides under it.
                            className="w-full border-0 bg-transparent p-0 pr-4 font-medium text-mn-text outline-none placeholder:text-mn-text-secondary"
                          />
                        ) : (
                          <div className="font-medium text-mn-text">
                            {row.title || 'Untitled'}
                          </div>
                        )}
                        {chipDefs.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {chipDefs.map((def) => {
                              const opt = optionForValue(def, coerceValue(def, row.values[def.id]))
                              if (!opt) return null
                              return <OptionChip key={def.id} label={opt.label} color={opt.color} />
                            })}
                          </div>
                        )}
                      </div>
                      {onOpenCard && (
                        // The keyboard-reachable twin of the card-body click — the
                        // quiet ↗ the F27 linked cards taught. Hover/focus reveals it.
                        <button
                          type="button"
                          aria-label={`Open card: ${row.title || 'untitled'}`}
                          title="Preview page"
                          onClick={() => onOpenCard(row.id)}
                          className="mt-0.5 shrink-0 leading-none text-mn-text/70 opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-mn-text focus-visible:opacity-100"
                        >
                          ↗
                        </button>
                      )}
                      {editable && onRemoveRow && (
                        <button
                          type="button"
                          aria-label={`Delete card: ${row.title || 'untitled'}`}
                          onClick={() => onRemoveRow(row.id)}
                          className="absolute top-1 right-1 rounded-mn-chrome px-1 leading-none text-mn-text-secondary opacity-0 transition-opacity group-hover/card:opacity-100 hover:text-mn-text focus-visible:opacity-100"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              {editable && onAddRow && (
                <button
                  type="button"
                  onClick={() => addCard(group.id)}
                  className="mt-2 w-full rounded-mn-row px-2 py-1 text-left text-xs text-mn-text-secondary transition-colors hover:bg-mn-wash hover:text-mn-text"
                >
                  + Add card
                </button>
              )}
            </section>
          )
        })}

        {/* Trailing "+ Add column" — appends a new option to the group-by property
            and focuses its header for naming (board-authoring Slice 4). */}
        {canEditColumns && (
          <button
            type="button"
            onClick={addColumn}
            className="min-w-[9rem] shrink-0 self-start rounded-mn-inner border border-dashed border-mn-hair px-3 py-2 text-left text-xs text-mn-text-secondary transition-colors hover:border-mn-text hover:bg-mn-wash hover:text-mn-text"
          >
            + Add column
          </button>
        )}
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
      {buckets.length === 0 && <p className="py-2 text-mn-text-secondary">No rows yet</p>}
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
                isOver
                  ? 'bg-mn-wash shadow-mn-md'
                  : 'bg-mn-card/40 shadow-mn-sm',
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
 * Gallery view — a read-only card grid. There is no image property type this cycle,
 * so a card is the row's title over its resolved property values (select/status as
 * chips, others as read text via the shared `Cell`). Editing stays in the table;
 * gallery is a browse surface (slice-4 grill).
 */
function CollectionGallery({ schema, rows }: { schema: PropertySchema; rows: CollectionRow[] }) {
  if (rows.length === 0) {
    return <p className="py-2 text-mn-text-secondary">No rows yet</p>
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
      {rows.map((row) => (
        <article
          key={row.id}
          className="rounded-mn-row bg-mn-card px-3 py-2.5 shadow-mn-sm"
        >
          <div className="font-medium text-mn-text">{row.title || 'Untitled'}</div>
          <dl className="mt-2 space-y-1">
            {schema.map((def) => (
              <div key={def.id} className="flex items-baseline gap-2 text-xs">
                <dt className="shrink-0 text-mn-text-secondary">{def.name}</dt>
                <dd className="min-w-0 text-mn-text-meta">
                  <Cell
                    def={def}
                    value={coerceValue(def, row.values[def.id])}
                    editable={false}
                    onChange={() => {}}
                    schema={schema}
                    rowValues={row.values}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  )
}

// ── Gantt (read-only timeline) ────────────────────────────────────────────────
// `formatTick` + `GANTT_BAR_SHELL` moved to gantt-shared.ts (#11) — one source for
// this view mode AND the standalone timeline module, so the two can't drift.

/** Below this RENDERED bar width (px) the edge handles are suppressed and the bar is
 *  move-only (spec): there isn't room to grab a 6px edge without it swallowing the body. */
const NARROW_BAR_PX = 18

/**
 * Gantt view (#27) — a timeline. Each row is one bar spanning its Start→End date over
 * a single adaptive axis (min start … max end), sorted by start. A row with a Start but
 * no End is a single-day tick; a row with no Start is omitted. Weekly gridlines mark the
 * axis. The date properties are the ones the view names in `startDate`/`endDate`, else
 * the collection's 1st/2nd date property (pickGanttDefs). No date property at all → a
 * calm notice, like the calendar.
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
    return <p className="py-2 text-mn-text-secondary">No dated rows to chart</p>
  }

  const { bars, rangeStart } = layout
  const { endDef } = defs
  const startDay = epochDay(rangeStart)
  const pct = (day: number) => ((day - startDay) / totalDays) * 100

  // Weekly-grid ticks from the first day through the range end (Mon-agnostic —
  // just every 7th day off the start), each labelled with its month/day and
  // thinned to the measured track width so labels never overlap (#57).
  const ticks = buildTicks(rangeStart, totalDays, trackPx)

  return (
    <div {...containerHandlers}>
      <div className={drag?.active ? 'cursor-grabbing select-none' : undefined}>
        {/* Axis header — weekly tick labels aligned to their gridlines. */}
        <div className="relative mb-1 ml-40 h-4">
          {ticks.map((t) => (
            <span
              key={t.iso}
              className="absolute top-0 -translate-x-1/2 text-[0.6rem] whitespace-nowrap text-mn-text-secondary tabular-nums"
              style={{ left: `${t.left}%` }}
            >
              {formatTick(t.iso)}
            </span>
          ))}
        </div>

        {/* One row per bar: a fixed label column + a proportional track. */}
        <ul role="list" className="space-y-1.5">
          {bars.map(({ row, startIso, endIso }, i) => {
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
              <li key={row.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs font-medium text-mn-text">
                  {row.title || 'Untitled'}
                </span>
                <span
                  data-gantt-track
                  ref={i === 0 ? measureTrack : undefined}
                  className="relative h-5 flex-1"
                >
                  {/* Weekly gridlines behind the bar. */}
                  {ticks.map((t) => (
                    <span
                      key={t.iso}
                      aria-hidden
                      className="absolute top-0 bottom-0 border-l border-mn-hair"
                      style={{ left: `${t.left}%` }}
                    />
                  ))}
                  {editable ? (
                    <span
                      className={GANTT_BAR_SHELL}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {/* Body — drag to MOVE the whole bar. */}
                      <button
                        type="button"
                        aria-label={`Reschedule ${row.title || 'Untitled'}: ${span}`}
                        onPointerDown={(e) => onBarPointerDown(e, row.id, 'move', dates)}
                        className="absolute inset-0 h-full w-full cursor-grab touch-none rounded-sm"
                      />
                      {/* Left edge — resize the Start (real spans only; hidden when too narrow to grab). */}
                      {endDef && !isTick && !narrow && (
                        <button
                          type="button"
                          aria-label={`Move start of ${row.title || 'Untitled'}`}
                          onPointerDown={(e) => onBarPointerDown(e, row.id, 'resize-start', dates)}
                          className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-l-sm bg-mn-text"
                        />
                      )}
                      {/* Right edge — resize the End (creates one on a tick → span; hidden when too narrow). */}
                      {endDef && !narrow && (
                        <button
                          type="button"
                          aria-label={`Move end of ${row.title || 'Untitled'}`}
                          onPointerDown={(e) => onBarPointerDown(e, row.id, 'resize-end', dates)}
                          className="absolute top-0 right-0 bottom-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-r-sm bg-mn-text"
                        />
                      )}
                    </span>
                  ) : (
                    <span
                      role="img"
                      aria-label={`${row.title || 'Untitled'}: ${span}`}
                      className={GANTT_BAR_SHELL}
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

// ── Cells & chips ───────────────────────────────────────────────────────────────

/** One table cell — an inline editor when editable, a resolved read display otherwise. */
function Cell({
  def,
  value,
  editable,
  onChange,
  schema,
  rowValues,
}: {
  def: PropertyDef
  value: PropertyValue
  editable: boolean
  onChange: (value: PropertyValue) => void
  /** The row's collection schema — a rollup reads its sibling relation def from here. */
  schema?: PropertySchema
  /** The row's values — a rollup reads its sibling relation's linked ids from here. */
  rowValues?: Record<string, unknown>
}) {
  const label = `${def.name} value`

  // A rollup is derived + never stored (#20): resolve its sibling relation (by
  // relationId) from the row's schema + values and let the connected field fetch +
  // compute. Always read-only, regardless of `editable`.
  if (def.type === 'rollup') {
    const relationDef = schema?.find((d) => d.id === def.relationId)
    const relationValue = relationDef ? coerceValue(relationDef, rowValues?.[relationDef.id]) : []
    return <RollupValueField def={def} relationDef={relationDef} relationValue={relationValue} />
  }

  if (!editable) {
    if (def.type === 'select' || def.type === 'status') {
      const opt = optionForValue(def, value)
      return opt ? <OptionChip label={opt.label} color={opt.color} /> : <Dash />
    }
    if (def.type === 'checkbox') {
      return value === true ? (
        <span aria-label="checked" className="inline-grid place-items-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M2.5 6.5l2.5 2.5 4.5-6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <Dash />
      )
    }
    if (def.type === 'relation') {
      // Read-only host: chips (clickable), no picker (#20 decision 6).
      return <RelationValueField def={def} value={value} editable={false} onChange={onChange} />
    }
    const text = displayValue(def, value)
    return text ? <span>{text}</span> : <Dash />
  }

  const cellInput =
    'w-full border-0 bg-transparent px-0 py-0.5 text-sm text-mn-text-meta outline-none placeholder:text-mn-text-secondary'

  switch (def.type) {
    case 'number':
      return (
        <input
          type="number"
          className={cellInput}
          aria-label={label}
          value={typeof value === 'number' ? value : ''}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          className={cellInput}
          aria-label={label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="h-4 w-4 accent-mn-text"
          aria-label={label}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      )
    case 'select':
    case 'status': {
      // Bind the option *id*, resolving through optionForValue so a legacy
      // label-stored value (a pre-slice-1 row, #18) still selects its option
      // instead of falling back to "—". An edit then writes the canonical id.
      const selected = optionForValue(def, value)?.id ?? (typeof value === 'string' ? value : '')
      return (
        <select
          className={cellInput}
          aria-label={label}
          value={selected}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">—</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      )
    }
    case 'relation':
      // Editable host: chips + a scoped picker (#20 slice 6).
      return <RelationValueField def={def} value={value} editable onChange={onChange} />
    case 'text':
    default:
      return (
        <input
          type="text"
          className={cellInput}
          aria-label={label}
          value={typeof value === 'string' ? value : ''}
          placeholder="—"
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      )
  }
}

function Dash() {
  return <span className="text-mn-text-secondary">—</span>
}

/** A select/status value chip: a colored dot + the option label. */
function OptionChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-mn-chrome border border-mn-line bg-mn-surface px-1.5 py-0.5 text-xs text-mn-text-meta">
      <OptionDot color={color} />
      {label}
    </span>
  )
}

// Legacy option colours arrive as raw Tailwind palette names (a rainbow outside
// the Make Noise system). Each maps to the nearest MN house hue, all --raw-* tokens
// (issue: MN reskin #1). Since #220 freed the three signals, the warm half of that
// rainbow collapses: red / rose / rust / pink / orange / amber all land on rose, and
// yellow / lime join the greens on sage. So these twenty-two names resolve to FIVE
// swatches — olive-mid, rose, sage, mist, navy — plus ink for `accent`. Two option
// colours can therefore draw the same dot; the label beside it is what distinguishes
// them. A hex/rgb/hsl value still renders verbatim; unknown names fall back to a hairline.
const TOKEN_DOT: Record<string, string> = {
  // neutrals → the house neutral-400
  zinc: 'var(--raw-olive-mid)',
  gray: 'var(--raw-olive-mid)',
  slate: 'var(--raw-olive-mid)',
  stone: 'var(--raw-olive-mid)',
  // reds + warms → the dusty-rose swatch, the one warm the palette sanctions for
  // option dots. Red is diff removals, burnt orange the ONE dated thing per screen
  // and wheat highlighted passages only (PROJECT_RULES § Colors), so none of the
  // three signals may tint a dot (#220). Six names share this one swatch.
  red: 'var(--raw-rose)',
  rose: 'var(--raw-rose)',
  rust: 'var(--raw-rose)',
  pink: 'var(--raw-rose)',
  orange: 'var(--raw-rose)',
  amber: 'var(--raw-rose)',
  // yellows → sage (the nearest area mark to lime / yellow-green)
  yellow: 'var(--raw-sage)',
  lime: 'var(--raw-sage)',
  // greens → sage
  green: 'var(--raw-sage)',
  emerald: 'var(--raw-sage)',
  teal: 'var(--raw-sage)',
  // pale cools → mist
  cyan: 'var(--raw-mist)',
  sky: 'var(--raw-mist)',
  blue: 'var(--raw-mist)',
  // deep cools → navy
  indigo: 'var(--raw-navy)',
  violet: 'var(--raw-navy)',
  purple: 'var(--raw-navy)',
  // the sanctioned accent role
  accent: 'var(--mn-text)',
}

function OptionDot({ color }: { color?: string }) {
  let background = 'var(--mn-line)'
  if (color) {
    if (/^(#|rgb|hsl)/i.test(color)) background = color
    else background = TOKEN_DOT[color.toLowerCase()] ?? 'var(--mn-line)'
  }
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: background }}
    />
  )
}
