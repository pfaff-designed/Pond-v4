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

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { ModuleViewProps } from '../types'
import type { ViewBlock } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { useCollectionRows } from './use-collection-rows'
import {
  applyView,
  displayValue,
  groupRows,
  groupRowsByDate,
  pickDateDef,
  type CollectionRow,
} from './apply'
import { usePointerBucketDrag } from './use-pointer-bucket-drag'
import {
  coerceValue,
  optionForValue,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'

// ── Registry entry: fetch, then draw ──────────────────────────────────────────

export function ViewView({ data, editable }: ModuleViewProps<ViewBlock>) {
  // The host page id — the collection whose rows this inline view draws. Provided
  // by the page host (DocumentPanel) through SiblingBlocks, exactly as a cross-page
  // metric reads it. A linked view (collectionId set) is deferred to a later cycle;
  // until then it too draws the host page's rows rather than crashing.
  const { pageId } = useSiblingBlocks()
  const collectionId = data.collectionId ?? pageId
  const { schema, rows, isLoading, setValue } = useCollectionRows(collectionId)

  return (
    <CollectionView
      config={data}
      schema={schema}
      rows={rows}
      isLoading={isLoading}
      editable={editable}
      linked={!!data.collectionId}
      onEdit={setValue}
    />
  )
}

// ── Presentational core (story-testable) ──────────────────────────────────────

export interface CollectionViewProps {
  config: ViewBlock
  schema: PropertySchema | null
  rows: CollectionRow[]
  isLoading?: boolean
  editable?: boolean
  /** True when this is a (not-yet-hydrated) linked view over another collection. */
  linked?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}

/** A calm Press placeholder — the shared shell for every non-drawing state. */
function ViewNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-press-hair px-4 py-6 text-center text-sm text-press-muted">
      {children}
    </div>
  )
}

export function CollectionView({
  config,
  schema,
  rows,
  isLoading,
  editable,
  linked,
  onEdit,
}: CollectionViewProps) {
  const processed = useMemo(
    () => (schema ? applyView(rows, schema, config) : []),
    [rows, schema, config]
  )

  if (isLoading) {
    return <ViewNotice>Loading rows…</ViewNotice>
  }

  // A linked view over another collection isn't hydrated this cycle (decision 12).
  if (linked) {
    return <ViewNotice>A linked view over another collection isn’t available yet.</ViewNotice>
  }

  // No schema → not really a collection. Rows/columns can't be resolved, so fail
  // soft rather than showing a bare title list (user decision).
  if (!schema) {
    return <ViewNotice>This view needs a collection with properties.</ViewNotice>
  }

  return (
    <div className="text-sm text-press-ink">
      {config.mode === 'board' ? (
        <CollectionBoard
          schema={schema}
          rows={processed}
          groupBy={config.groupBy}
          editable={editable}
          onEdit={onEdit}
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
      ) : (
        <CollectionTable schema={schema} rows={processed} editable={editable} onEdit={onEdit} />
      )}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

function CollectionTable({
  schema,
  rows,
  editable,
  onEdit,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr>
          <th className="border-b border-press-hair py-1 pr-3 text-xs font-medium text-press-muted">
            Name
          </th>
          {schema.map((def) => (
            <th
              key={def.id}
              className="border-b border-press-hair py-1 pr-3 text-xs font-medium text-press-muted"
            >
              {def.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={schema.length + 1} className="py-2 text-press-faint">
              No rows yet
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-press-line last:border-b-0 align-top">
            <td className="py-1.5 pr-3 font-medium text-press-ink">{row.title || 'Untitled'}</td>
            {schema.map((def) => (
              <td key={def.id} className="py-1.5 pr-3">
                <Cell
                  def={def}
                  value={coerceValue(def, row.values[def.id])}
                  editable={!!editable}
                  onChange={(v) => onEdit?.(row.id, def.id, v)}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
}) {
  const grouped = useMemo(() => groupRows(rows, schema, groupBy), [rows, schema, groupBy])
  const groupKey = (id: string | null) => id ?? NULL_BUCKET

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

  const draggingRow = drag?.active ? rows.find((r) => r.id === drag.rowId) : undefined
  // The other select/status properties shown as context chips on each card.
  const chipDefs = schema.filter(
    (d) => (d.type === 'select' || d.type === 'status') && d.id !== groupDef.id
  )

  return (
    <div {...containerHandlers}>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {groups.map((group) => {
          const key = groupKey(group.id)
          const isOver = editable && drag?.active && overKey === key
          return (
            <section
              key={key}
              ref={registerBucket(key)}
              className={[
                'min-w-[13rem] flex-1 rounded-md border px-3 py-2 transition-colors',
                isOver
                  ? 'border-press-accent bg-press-accent-wash'
                  : 'border-press-hair bg-press-card/40',
              ].join(' ')}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <OptionDot color={group.color} />
                  <span className="truncate text-[0.65rem] font-medium tracking-[0.14em] text-press-muted uppercase">
                    {group.label}
                  </span>
                </span>
                <span className="text-[0.65rem] text-press-muted tabular-nums">
                  {group.rows.length}
                </span>
              </header>

              <ul className="space-y-2">
                {group.rows.length === 0 && (
                  <li className="py-1 text-xs text-press-muted/70">
                    {editable ? 'Drop a card here' : 'Empty'}
                  </li>
                )}
                {group.rows.map((row) => {
                  const isDragging = drag?.active && drag.rowId === row.id
                  return (
                    <li
                      key={row.id}
                      className={[
                        'relative flex items-start gap-1.5 rounded-md border border-press-line bg-press-card px-2 py-2 shadow-sm',
                        'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-press)] hover:shadow-md motion-reduce:transition-none',
                        isDragging ? 'opacity-30' : '',
                      ].join(' ')}
                    >
                      {editable && (
                        <button
                          type="button"
                          aria-label={`Drag card: ${row.title || 'untitled'}`}
                          onPointerDown={(e) => onCardPointerDown(e, row.id)}
                          className="mt-0.5 cursor-grab touch-none leading-none text-press-muted/50 select-none hover:text-press-muted"
                        >
                          ⠿
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-press-ink">{row.title || 'Untitled'}</div>
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
          className="pointer-events-none fixed z-50 w-52 rotate-2 rounded-md border border-press-line bg-press-card px-2.5 py-2 shadow-lg motion-reduce:rotate-0"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          aria-hidden
        >
          <div className="font-medium text-press-ink">{draggingRow.title || 'Untitled'}</div>
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
      {buckets.length === 0 && <p className="py-2 text-press-faint">No rows yet</p>}
      <div className="space-y-4">
        {buckets.map((bucket) => {
          const key = laneKey(bucket.iso)
          const isOver = editable && drag?.active && overKey === key
          return (
            <section
              key={key}
              ref={registerBucket(key)}
              className={[
                'rounded-md border px-3 py-2 transition-colors',
                isOver
                  ? 'border-press-accent bg-press-accent-wash'
                  : 'border-press-hair bg-press-card/40',
              ].join(' ')}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-[0.65rem] font-medium tracking-[0.14em] text-press-muted uppercase">
                  {bucket.iso ? formatDateHeader(bucket.iso) : 'No date'}
                </span>
                <span className="text-[0.65rem] text-press-muted tabular-nums">
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
                        'relative flex items-start gap-1.5 rounded-md border border-press-line bg-press-card px-2 py-2 shadow-sm',
                        'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-press)] hover:shadow-md motion-reduce:transition-none',
                        isDragging ? 'opacity-30' : '',
                      ].join(' ')}
                    >
                      {editable && (
                        <button
                          type="button"
                          aria-label={`Drag card: ${row.title || 'untitled'}`}
                          onPointerDown={(e) => onCardPointerDown(e, row.id)}
                          className="mt-0.5 cursor-grab touch-none leading-none text-press-muted/50 select-none hover:text-press-muted"
                        >
                          ⠿
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-press-ink">{row.title || 'Untitled'}</div>
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
          className="pointer-events-none fixed z-50 w-52 rotate-2 rounded-md border border-press-line bg-press-card px-2.5 py-2 shadow-lg motion-reduce:rotate-0"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }}
          aria-hidden
        >
          <div className="font-medium text-press-ink">{draggingRow.title || 'Untitled'}</div>
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
    return <p className="py-2 text-press-faint">No rows yet</p>
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
      {rows.map((row) => (
        <article
          key={row.id}
          className="rounded-md border border-press-line bg-press-card px-3 py-2.5 shadow-sm"
        >
          <div className="font-medium text-press-ink">{row.title || 'Untitled'}</div>
          <dl className="mt-2 space-y-1">
            {schema.map((def) => (
              <div key={def.id} className="flex items-baseline gap-2 text-xs">
                <dt className="shrink-0 text-press-muted">{def.name}</dt>
                <dd className="min-w-0 text-press-body">
                  <Cell
                    def={def}
                    value={coerceValue(def, row.values[def.id])}
                    editable={false}
                    onChange={() => {}}
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

// ── Cells & chips ───────────────────────────────────────────────────────────────

/** One table cell — an inline editor when editable, a resolved read display otherwise. */
function Cell({
  def,
  value,
  editable,
  onChange,
}: {
  def: PropertyDef
  value: PropertyValue
  editable: boolean
  onChange: (value: PropertyValue) => void
}) {
  const label = `${def.name} value`

  if (!editable) {
    if (def.type === 'select' || def.type === 'status') {
      const opt = optionForValue(def, value)
      return opt ? <OptionChip label={opt.label} color={opt.color} /> : <Dash />
    }
    if (def.type === 'checkbox') {
      return value === true ? <span aria-label="checked">✓</span> : <Dash />
    }
    const text = displayValue(def, value)
    return text ? <span>{text}</span> : <Dash />
  }

  const cellInput =
    'w-full border-0 bg-transparent px-0 py-0.5 text-sm text-press-body outline-none placeholder:text-press-faint'

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
          className="h-4 w-4 accent-press-accent"
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
    case 'relation': {
      // Defined but not yet authorable (#20): show the link count, inert.
      const ids = Array.isArray(value) ? value : []
      return (
        <span className="text-press-muted">{ids.length === 0 ? '—' : `${ids.length} linked`}</span>
      )
    }
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
  return <span className="text-press-faint">—</span>
}

/** A select/status value chip: a colored dot + the option label. */
function OptionChip({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-press-line bg-press-paper px-1.5 py-0.5 text-xs text-press-body">
      <OptionDot color={color} />
      {label}
    </span>
  )
}

// A small set of token → dot classes; a hex/rgb color renders inline; anything else
// falls back to a neutral swatch (matching the schema doc: renderer falls back).
const TOKEN_DOT: Record<string, string> = {
  zinc: 'bg-zinc-400',
  gray: 'bg-zinc-400',
  slate: 'bg-slate-400',
  stone: 'bg-stone-400',
  red: 'bg-red-400',
  rust: 'bg-press-rust',
  orange: 'bg-orange-400',
  amber: 'bg-amber-400',
  yellow: 'bg-yellow-400',
  lime: 'bg-lime-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  accent: 'bg-press-accent',
}

function OptionDot({ color }: { color?: string }) {
  let className = 'bg-press-line'
  let style: CSSProperties | undefined
  if (color) {
    if (/^(#|rgb|hsl)/i.test(color)) style = { backgroundColor: color }
    else className = TOKEN_DOT[color.toLowerCase()] ?? 'bg-press-line'
  }
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${style ? '' : className}`}
      style={style}
    />
  )
}
