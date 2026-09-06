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
import type { CSSProperties } from 'react'
import type { ModuleViewProps } from '../types'
import type { ViewBlock } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { useCollectionRows } from './use-collection-rows'
import {
  addDays,
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
import { usePointerBucketDrag } from './use-pointer-bucket-drag'
import { usePointerGanttDrag } from './use-gantt-bar-drag'
import {
  coerceValue,
  optionForValue,
  type PropertyDef,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import { RelationValueField } from '@/components/organisms/RelationValueField'
import { RollupValueField } from '@/components/organisms/RollupValueField'

// ── Registry entry: fetch, then draw ──────────────────────────────────────────

export function ViewView({ data, editable }: ModuleViewProps<ViewBlock>) {
  // Which collection's rows this view draws: a LINKED view names another collection
  // (data.collectionId, #41); otherwise it draws its HOST page's own rows, whose id
  // arrives from the page host (DocumentPanel) through SiblingBlocks — exactly as a
  // cross-page metric reads it. `useCollectionRows` fetches + writes against whichever.
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
  /** True when this is a linked view over another collection (#41) — words the
   *  "target unavailable" notice when a linked target is deleted or isn't a collection. */
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
      ) : config.mode === 'gantt' ? (
        <CollectionGantt
          schema={schema}
          rows={processed}
          startId={config.startDate}
          endId={config.endDate}
          editable={editable}
          onEdit={onEdit}
        />
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
                  schema={schema}
                  rowValues={row.values}
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

/** A short "Sep 8" tick label for a gridline, built at UTC noon so it never drifts. */
function formatTick(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** The bar rectangle's shared look — the editable wrapper and the read-only bar draw
 *  the same shape (position + fill), differing only in what they carry (grab zones vs
 *  an aria label). Kept in one place so the two never drift. */
const GANTT_BAR_SHELL = 'absolute top-0.5 bottom-0.5 min-w-[0.5rem] rounded-sm bg-press-accent/80'

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
    return <p className="py-2 text-press-faint">No dated rows to chart</p>
  }

  const { bars, rangeStart } = layout
  const { endDef } = defs
  const startDay = epochDay(rangeStart)
  const pct = (day: number) => ((day - startDay) / totalDays) * 100

  // Weekly gridlines from the first day through the range end (Mon-agnostic — just
  // every 7th day off the start), each labelled with its month/day.
  const ticks: { iso: string; left: number }[] = []
  for (let d = 0; d < totalDays; d += 7) {
    const iso = addDays(rangeStart, d)
    ticks.push({ iso, left: pct(epochDay(iso)) })
  }

  return (
    <div className="overflow-x-auto" {...containerHandlers}>
      <div className={`min-w-[28rem] ${drag?.active ? 'cursor-grabbing select-none' : ''}`}>
        {/* Axis header — weekly tick labels aligned to their gridlines. */}
        <div className="relative mb-1 ml-40 h-4">
          {ticks.map((t) => (
            <span
              key={t.iso}
              className="absolute top-0 -translate-x-1/2 text-[0.6rem] whitespace-nowrap text-press-muted tabular-nums"
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
                <span className="w-40 shrink-0 truncate text-xs font-medium text-press-ink">
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
                      className="absolute top-0 bottom-0 border-l border-press-hair"
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
                          className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-l-sm bg-press-accent"
                        />
                      )}
                      {/* Right edge — resize the End (creates one on a tick → span; hidden when too narrow). */}
                      {endDef && !narrow && (
                        <button
                          type="button"
                          aria-label={`Move end of ${row.title || 'Untitled'}`}
                          onPointerDown={(e) => onBarPointerDown(e, row.id, 'resize-end', dates)}
                          className="absolute top-0 right-0 bottom-0 z-10 w-1.5 cursor-ew-resize touch-none rounded-r-sm bg-press-accent"
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
      return value === true ? <span aria-label="checked">✓</span> : <Dash />
    }
    if (def.type === 'relation') {
      // Read-only host: chips (clickable), no picker (#20 decision 6).
      return <RelationValueField def={def} value={value} editable={false} onChange={onChange} />
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
