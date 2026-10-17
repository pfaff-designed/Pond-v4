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
 * Cells resolve each stored value against the collection `_schema`, slice 1.
 * Filter/sort/group run through the pure `apply.ts`. Direct edits — a table cell, a
 * dragged board card — write OPTIMISTICALLY via `setValue`, bypassing the AI
 * (decision 17). Gallery (read-only card grid) is slice 4; calendar is its own
 * module, `collection-calendar.tsx` (#262).
 */

import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ModuleViewProps } from '../types'
import type { ViewBlock } from './schema'
import { useSiblingBlocks } from '../sibling-context'
import { viewCollectionId } from '../block-frame'
import { useCollectionRows } from './use-collection-rows'
import { useStruckRows } from '@/lib/change-log/undo-strike'
import { DIFF_REMOVAL_TEXT_CLASSNAME, PondMolecule } from '@/components/molecules/PondMolecule'
import { activeSavedView, applyConfigPatch } from './schema'
import { ActiveViewSelectionContext, SavedViewHostContext } from './active-view-context'
import { SavedViewBar } from './saved-view-bar'
import {
  addDays,
  applyView,
  displayValue,
  epochDay,
  galleryCardMeta,
  galleryCardTag,
  groupRows,
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
import { PondBlockEmpty } from '@/components/organisms/PondBlock'
import { BOARD_EMPTY_LINE, GANTT_EMPTY_LINE, type ViewConfigPatch } from './kinds'
import {
  addDateField,
  addStatusField,
  coerceValue,
  removeField,
  ROW_TYPE,
  type PropertySchema,
  type PropertyValue,
} from '@/lib/properties/schema'
import { useOptionalDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { usePageLinks } from '../page-link/context'
import { dueOfRow, firstOrangeToday, localDateIso } from './due'
import { AddRowInput } from './add-row-input'
import { DueMark } from './due-mark'
import { useDoneToggle } from './use-done-toggle'
import { useOrangeToday } from '../page-canvas'
import { Cell, RepeatMark } from './cells'
import { DraftInput } from '@/components/atoms/draft-input'
import { RecordPeek } from './record-peek'
import { CollectionList } from './list'
import { CollectionCalendar } from './collection-calendar'
import { ROW_FOCUS_VISIBLE, ROW_FOCUS_VISIBLE_BASE, useRecordSelection } from './use-record-selection'
import { shouldSelectCardFromClick, shouldSelectRowFromClick } from './card-click'
import { useBlockRow } from '../block-row-context'

/**
 * One field-add remedy (KAN-292's date field, KAN-351's status field): builds off
 * `schemaRef.current`, not the `schema` state closure, which two clicks fired
 * before React re-renders would both still see as stale — writes `schemaRef.current`
 * itself, synchronously, before `updateSchema`, so a second same-tick click reads
 * the field already there via `alreadyApplies` and no-ops instead of adding a
 * duplicate field and staging a second undo toast.
 */
function runFieldRemedy(
  schemaRef: { current: PropertySchema | null },
  updateSchema: (next: PropertySchema) => void,
  deletionUndo: NonNullable<ReturnType<typeof useOptionalDeletionUndo>>,
  addField: (schema: PropertySchema) => PropertySchema,
  alreadyApplies: (schema: PropertySchema) => boolean,
  message: string
): void {
  const schema = schemaRef.current
  if (!schema || alreadyApplies(schema)) return
  const next = addField(schema)
  const addedId = next[next.length - 1].id
  schemaRef.current = next
  updateSchema(next)
  deletionUndo.stageUndo({
    message,
    scope: 'block',
    undo: () => updateSchema(removeField(schemaRef.current ?? next, addedId)),
  })
}

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

  // KAN-292: the shared "add a date field" remedy a dateless calendar/list/gantt
  // offers from its own empty state — an own edit, applied at once, with an undo
  // toast (the same `stageUndo` seam `BlockCanvas` uses for every other block-scoped
  // change). Gated on `editable`, like every other view insert: a diff card or a
  // create-page proposal must never write to the collection it's rendering. The
  // provider lookup is the non-throwing variant: a diff/proposal preview and
  // Storybook mount `ViewView` with no `DeletionUndoProvider` ancestor at all.
  const deletionUndo = useOptionalDeletionUndo()
  // Undo must drop only the field it added, off whatever the schema has become by
  // the time the toast is actioned — restoring the schema captured at click would
  // also wipe any other schema edit made while the toast was open. `schemaRef`
  // tracks the latest schema so undo (an async closure) reads it fresh.
  const schemaRef = useRef(schema)
  useEffect(() => {
    schemaRef.current = schema
  }, [schema])
  const handleAddDateField =
    editable && schema && deletionUndo
      ? () =>
          runFieldRemedy(
            schemaRef,
            updateSchema,
            deletionUndo,
            addDateField,
            (s) => s.some((d) => d.type === 'date'),
            'Added a date field'
          )
      : undefined

  // KAN-351: the board's own remedy for a group-by-less schema, mirroring the
  // date remedy above — same `runFieldRemedy` seam, one field added.
  const handleAddStatusField =
    editable && schema && deletionUndo
      ? () =>
          runFieldRemedy(
            schemaRef,
            updateSchema,
            deletionUndo,
            addStatusField,
            (s) => s.some((d) => d.type === 'status' || d.type === 'select'),
            'Added a status field'
          )
      : undefined

  // Config edits (chart/big-number setup) rewrite the persisted view block through the
  // module's own onChange — the same whole-block save path every editable module uses.
  // `applyConfigPatch` (KAN-32) lands the patch on the ACTIVE saved view's config on a
  // `views`-shaped block, never the whole-block spread a legacy block still gets. The
  // active view is whichever one `CollectionView`'s bar has LOCALLY selected, not the
  // persisted `activeViewId` — a person can switch the bar without that being an edit,
  // so `activeId` arrives from `CollectionView` on every call.
  const onConfigChange = onChange
    ? (patch: ViewConfigPatch, activeId?: string) =>
        onChange(applyConfigPatch(data, patch, activeId))
    : undefined

  // A row IS a page: `open ›` on the record peek navigates to it through the page-link
  // seam. Absent off a page host (Storybook, the AI terminal), where the peek omits it.
  const links = usePageLinks()
  const handleOpenRow = links
    ? (rowId: string) =>
        links.navigateToPage({
          id: rowId,
          title: rows.find((r) => r.id === rowId)?.title || 'Untitled',
          type: ROW_TYPE,
          isNew: false,
        })
    : undefined

  return (
    <CollectionView
      config={data}
      schema={schema}
      rows={rows}
      collectionId={collectionId}
      collectionName={collectionName}
      isLoading={isLoading}
      isError={isError}
      editable={editable}
      linked={!!data.collectionId}
      onEdit={setValue}
      onAddRow={addRow}
      onRenameRow={renameRow}
      onConfigChange={onConfigChange}
      onOpenRow={handleOpenRow}
      chartProvenance={chartProvenance}
      onAddDateField={handleAddDateField}
      onAddStatusField={handleAddStatusField}
      updateSchema={updateSchema}
      onChange={onChange}
    />
  )
}

// ── Presentational core (story-testable) ──────────────────────────────────────

export interface CollectionViewProps {
  config: ViewBlock
  schema: PropertySchema | null
  rows: CollectionRow[]
  /** The collection's own page id — which row/block the undo-strike store's
   *  entries belong to. Absent off a page host (Storybook), where no row can
   *  ever be struck. */
  collectionId?: string
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
  /** Rewrite the view block's own config — chart and big-number setup. Never its
   *  kind (fixed once made, KAN-44). Absent on read-only / Storybook hosts. The
   *  optional second arg is which saved view's config to land the patch on (KAN-32
   *  fix) — `CollectionView` passes its own LOCAL active view, never the
   *  persisted `activeViewId`. */
  onConfigChange?: (patch: ViewConfigPatch, activeId?: string) => void
  /** Navigate to a row's page — a row IS a page, so this receives the row id. Draws
   *  the record peek's `open ›`; absent on Storybook/static renders (no dead affordance). */
  onOpenRow?: (rowId: string) => void
  /** The chart card's `on` / `reads` (#227). Absent off a page host; the rows are omitted. */
  chartProvenance?: ChartProvenance
  /** KAN-292: mint a `date` field onto this collection's schema, offered by a
   *  calendar/list/gantt view whose kind needs one and doesn't have it. Absent when
   *  not `editable` (Storybook, a diff/proposal render) — no undrawn affordance there. */
  onAddDateField?: () => void
  /** KAN-351: mint a `status` field onto this collection's schema, offered by a
   *  board whose schema has no status/select property to group by. Absent when
   *  not `editable` (Storybook, a diff/proposal render) — no undrawn affordance there. */
  onAddStatusField?: () => void
  /** KAN-243: writes the collection's schema — `SavedViewBar`'s own add-a-view
   *  remedy mints a field onto it the same way `onAddDateField`/`onAddStatusField`
   *  do. Absent when not `editable` (Storybook, a diff/proposal render). */
  updateSchema?: (next: PropertySchema) => void
  /** KAN-243: the whole-block write `SavedViewBar` lands an add through. Absent
   *  when not `editable` (Storybook, a diff/proposal render) — no undrawn
   *  affordance there. */
  onChange?: (next: ViewBlock) => void
}

export function CollectionView({
  config,
  schema,
  rows,
  collectionId,
  collectionName,
  isLoading,
  isError,
  editable,
  linked,
  onEdit,
  onAddRow,
  onRenameRow,
  onConfigChange,
  onOpenRow,
  chartProvenance,
  onAddDateField,
  onAddStatusField,
  updateSchema,
  onChange,
}: CollectionViewProps) {
  // What the page canvas keys this view's peek and orange pill by.
  const instanceKey = useId()
  const viewKey = config.id ?? instanceKey

  // KAN-36: which saved view is showing is READING, not editing — a reader (a
  // shared view-only page, the proposed view) can switch segments too, so this
  // lives in local state rather than behind `editable`/`onConfigChange`. Seeded
  // once from the persisted `activeViewId`; `config.views` is absent on a legacy
  // block, so the bar never renders and this stays undefined.
  const [localActiveViewId, setLocalActiveViewId] = useState<string | undefined>(() =>
    config.views?.length ? (config.activeViewId ?? config.views[0].id) : undefined
  )

  // KAN-321: BlockCanvas needs the bar's selection too, to resolve the block's
  // frame — but only when it has mounted a provider (BlockCanvas, not a bare
  // story/test render of CollectionView).
  const notifyActiveViewSelected = useContext(ActiveViewSelectionContext)
  // KAN-243 fix: BlockCanvas's own getters, which outlive both `SavedViewBar`
  // instances it draws for one block — absent off a bare story/test render of
  // `CollectionView`, where `SavedViewBar` falls back to its own local ref.
  const savedViewHost = useContext(SavedViewHostContext)
  const handleSelectView = useCallback(
    (id: string) => {
      setLocalActiveViewId(id)
      notifyActiveViewSelected?.(id)
    },
    [notifyActiveViewSelected]
  )

  // KAN-243: picking a kind from the ＋ view picker "makes it active" (the
  // spec's own words), and its undo restores the segment that was active
  // before — adjusted during render (React's own "you might not need an
  // effect" pattern), not in a `useEffect`, since the effect form would
  // commit the stale tab for one frame before correcting itself. A bar
  // CLICK never touches `config.activeViewId` (KAN-36 keeps it local-only),
  // so this only ever fires off the host's OWN edits.
  const [seenActiveViewId, setSeenActiveViewId] = useState(config.activeViewId)
  if (config.activeViewId !== seenActiveViewId) {
    setSeenActiveViewId(config.activeViewId)
    if (config.activeViewId) setLocalActiveViewId(config.activeViewId)
  }

  // KAN-32: every mode/groupBy/sort/filter/chart/bigNumber read below runs off the
  // ACTIVE saved view, never the raw block — a `views`-shaped block's other saved
  // views must never leak into what renders. `activeSavedView` (KAN-321) mirrors
  // the active view's kind+config onto a `ViewBlock` shape so every reader below
  // (most of which predate `views[]`) keeps reading the same fields it always has.
  const activeConfig: ViewBlock = useMemo(
    () => activeSavedView(config, localActiveViewId),
    [config, localActiveViewId]
  )

  const processed = useMemo(
    () => (schema ? applyView(rows, schema, activeConfig) : []),
    [rows, schema, activeConfig]
  )

  // KAN-139 (s6o5): the row an undo/redo just removed from `rows` stays
  // visible, struck through, while the notice shows — appended past whatever
  // filter/sort `applyView` already ran, since it is no longer live data.
  const struckRows = useStruckRows(collectionId)
  const tableRows = useMemo(() => {
    if (struckRows.length === 0) return processed
    const present = new Set(processed.map((row) => row.id))
    const extra = struckRows
      .filter((row) => !present.has(row.id))
      .map((row) => ({ id: row.id, title: row.title, values: row.values }))
    return extra.length === 0 ? processed : [...processed, ...extra]
  }, [processed, struckRows])
  const struckIds = useMemo(() => new Set(struckRows.map((row) => row.id)), [struckRows])

  // A config edit (chart/big-number setup) must land on whichever view the bar has
  // LOCALLY selected, never the persisted `activeViewId` — a bar click never calls
  // `onChange`, so without this the edit would silently land on `views[0]`.
  const handleConfigChange = useCallback(
    (patch: ViewConfigPatch) => onConfigChange?.(patch, localActiveViewId),
    [onConfigChange, localActiveViewId]
  )

  // #227: the chart CARD owns its loading state (the board's four-bar skeleton) —
  // every other mode shares the calm notice until its rows arrive.
  const chartCard = isChartCard(activeConfig)
  if (isLoading) {
    return chartCard ? (
      <CollectionChart
        config={activeConfig}
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
        config={activeConfig}
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
      <ViewControls
        config={activeConfig}
        rawBlock={config}
        schema={schema}
        collectionName={collectionName}
        recordCount={rows.length}
        activeViewId={localActiveViewId}
        onSelectView={handleSelectView}
        updateSchema={updateSchema}
        onChange={onChange}
        editable={editable}
        onConfigChange={onConfigChange ? handleConfigChange : undefined}
        latestBlock={savedViewHost?.latestBlock}
        getLatestSchema={savedViewHost?.getLatestSchema}
      />
      {activeConfig.mode === 'board' ? (
        <CollectionBoard
          schema={schema}
          rows={processed}
          viewKey={viewKey}
          groupBy={activeConfig.groupBy}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
          onAddStatusField={onAddStatusField}
        />
      ) : activeConfig.mode === 'list' ? (
        <CollectionList
          viewKey={viewKey}
          schema={schema}
          rows={processed}
          groupBy={activeConfig.groupBy}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
          onAddDateField={onAddDateField}
        />
      ) : activeConfig.mode === 'calendar' ? (
        <CollectionCalendar
          viewKey={viewKey}
          schema={schema}
          rows={processed}
          groupBy={activeConfig.groupBy}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
          onAddDateField={onAddDateField}
        />
      ) : activeConfig.mode === 'gallery' ? (
        <CollectionGallery
          viewKey={viewKey}
          schema={schema}
          rows={processed}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      ) : activeConfig.mode === 'gantt' ? (
        <CollectionGantt
          schema={schema}
          rows={processed}
          startId={activeConfig.startDate}
          endId={activeConfig.endDate}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onAddDateField={onAddDateField}
        />
      ) : activeConfig.mode === 'chart' ? (
        // #259: the chart's PRESENTATION — the compact inline mark (the board's
        // `bars` strip / `heat` grid) or the chart card. Same rows, same aggregation.
        !chartCard && activeConfig.chart ? (
          <CompactChart schema={schema} rows={processed} chart={activeConfig.chart} />
        ) : (
          <CollectionChart
            config={activeConfig}
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
      ) : activeConfig.mode === 'big-number' ? (
        <CollectionBigNumber schema={schema} rows={processed} bigNumber={activeConfig.bigNumber} />
      ) : (
        <CollectionTable
          viewKey={viewKey}
          schema={schema}
          rows={tableRows}
          struckIds={struckIds}
          editable={editable}
          onEdit={onEdit}
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}
    </div>
  )
}

// ── View controls (head row) ─────────────────────────────────────────────────

/**
 * The head row (6u.1 + KAN-36): the database's name, its record count and how
 * the board reads it (`grouped by status`) are IDENTIFICATION — they always
 * render, editable or not (KAN-36: "identification always renders, affordances
 * gate"). The saved-view bar is reading too (switching is not editing), so it
 * renders whenever the block has `views`; only "＋ view" and the chart/big-
 * number setup below it are affordances, gated on `editable && onConfigChange`.
 * A view's kind is fixed once made (ADR 0009), so there is no in-place switch
 * between kinds here.
 */
function ViewControls({
  config,
  rawBlock,
  schema,
  collectionName,
  recordCount,
  activeViewId,
  onSelectView,
  updateSchema,
  onChange,
  editable,
  onConfigChange,
  latestBlock,
  getLatestSchema,
}: {
  config: ViewBlock
  /** The raw, unresolved persisted block — `SavedViewBar`'s segments and its
   *  `addSavedView` write both need `.views[]` (or the legacy top-level
   *  mode+config) directly, never `config`'s per-saved-view resolved mirror. */
  rawBlock: ViewBlock
  schema: PropertySchema
  collectionName?: string
  recordCount: number
  activeViewId?: string
  onSelectView?: (id: string) => void
  updateSchema?: (next: PropertySchema) => void
  onChange?: (next: ViewBlock) => void
  editable?: boolean
  onConfigChange?: (patch: ViewConfigPatch) => void
  /** KAN-243 fix: `BlockCanvas`'s own host getters, forwarded to `SavedViewBar`
   *  — see `SavedViewHostContext`. Absent off a bare story/test render. */
  latestBlock?: { readonly current: ViewBlock }
  getLatestSchema?: () => PropertySchema | null
}) {
  // The head's fact: a board reads its lanes' property, a list the date it groups by.
  const groupDef =
    config.mode === 'board'
      ? pickGroupDef(schema, config.groupBy)
      : config.mode === 'list'
        ? pickDateDef(schema, config.groupBy)
        : undefined
  const groupName = groupDef?.name.toLowerCase()

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
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
          <span data-part="db-count" className="text-[10.5px] font-medium text-mn-text-meta">
            {recordCount} record{recordCount === 1 ? '' : 's'}
          </span>
          {groupName && (
            <>
              <span aria-hidden="true" className="text-[10.5px] font-medium text-mn-text-meta">
                ·
              </span>
              <span data-part="db-facts" className="text-[10.5px] font-medium text-mn-text-meta">
                grouped by {groupName}
              </span>
            </>
          )}
        </div>
        {onSelectView && (
          <SavedViewBar
            block={rawBlock}
            schema={schema}
            updateSchema={updateSchema ?? (() => {})}
            activeId={activeViewId}
            onSelect={onSelectView}
            editable={!!editable}
            onChange={onChange}
            latestBlock={latestBlock}
            getLatestSchema={getLatestSchema}
          />
        )}
      </div>

      {editable && onConfigChange && config.mode === 'chart' && (
        <ChartControls config={config} schema={schema} onConfigChange={onConfigChange} />
      )}

      {editable && onConfigChange && config.mode === 'big-number' && (
        <BigNumberControls config={config} schema={schema} onConfigChange={onConfigChange} />
      )}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

function CollectionTable({
  viewKey,
  schema,
  rows,
  struckIds,
  editable,
  onEdit,
  onAddRow,
  onRenameRow,
  onOpenRow,
}: {
  /** The view block's id — what the page canvas keys its one peek and one orange pill by. */
  viewKey: string
  schema: PropertySchema
  rows: CollectionRow[]
  /** Row ids an undo/redo just removed (KAN-139, s6o5) — still rendered,
   *  but painted struck through rather than editable. */
  struckIds?: ReadonlySet<string>
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
}) {
  const { stepOut } = useBlockRow()
  const [now] = useState(() => new Date())
  const { selectedRow, selectWithPointer, keyboardProps, selectOrOpenOnKey } = useRecordSelection(
    rows,
    viewKey
  )
  const done = useDoneToggle({ schema, editable, onEdit })

  // A click on the row's own space (not a cell's input/control) selects it and
  // opens the board's peek beside the table; `shouldSelectRowFromClick` is the
  // row-shaped predicate (unlike the card's, it doesn't exclude `td`/`th`,
  // which is the row's entire clickable surface). A struck row (KAN-139) is an
  // undo-removed record still drawn for the notice's duration — it must never
  // select, or its peek would let a person edit a record that no longer exists.
  function handleRowClick(rowId: string, struck: boolean, e: React.MouseEvent) {
    if (struck) return
    if (shouldSelectRowFromClick(e.target)) selectWithPointer(rowId)
  }

  // ↵ on the row itself (not a cell's input — `keyboardProps`' own guard) opens
  // the record's page once the row is already selected; a first ↵ (or Space,
  // any time) selects it instead, same as the board's keyboard behaviour, so
  // a keyboard user reaches the peek before the page. Focus never moves into
  // the peek from here (no `focusOnOpen`), so the second ↵ still lands on the
  // row.
  function handleRowKeyDown(rowId: string, e: React.KeyboardEvent<HTMLTableRowElement>) {
    selectOrOpenOnKey(rowId, e, onOpenRow)
  }

  // Return/↓ in the last row's last cell step out of the table (KAN-344) — the
  // "last cell" is the Row title input when there's no schema, else the last
  // field's Cell. Every other cell keeps reading those keys itself (multi-line
  // entry, moving down a column). `ci === -1` is the Row title sentinel, so an
  // empty schema's last cell (schema.length - 1 === -1) still matches it.
  function handleCellKeyDown(ri: number, ci: number, e: React.KeyboardEvent) {
    if (ri !== rows.length - 1 || ci !== schema.length - 1) return
    if (e.key !== 'Enter' && e.key !== 'ArrowDown') return
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return
    const target = e.target as HTMLElement
    if (target.closest('textarea, [role="listbox"], [role="menu"]')) return
    e.preventDefault()
    stepOut()
  }

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
          {rows.map((row, ri) => {
            const struck = struckIds?.has(row.id) ?? false
            // Never true for a struck row (see `handleRowClick`), even if it was
            // already selected before the undo that struck it — a stale selection
            // dropping its highlight and peek, not keeping them on a dead record.
            const selected = !struck && row.id === selectedRow?.id
            return (
              <tr
                key={row.id}
                data-row-id={row.id}
                onClick={(e) => handleRowClick(row.id, struck, e)}
                {...(struck ? {} : keyboardProps(row.id))}
                onKeyDown={struck ? undefined : (e) => handleRowKeyDown(row.id, e)}
                className={[
                  'border-b border-mn-line last:border-b-0 align-top',
                  struck ? DIFF_REMOVAL_TEXT_CLASSNAME : '',
                  // `border-collapse` keeps a <tr>'s own radius from ever painting, so
                  // the selected background and its outer rounding live on the end
                  // tds instead (first/last below).
                  ROW_FOCUS_VISIBLE,
                ].join(' ')}
              >
                <td
                  className={[
                    struck ? 'py-1.5 pr-3 font-medium' : 'py-1.5 pr-3 font-medium text-mn-text',
                    'rounded-l-[8px]',
                    schema.length === 0 ? 'rounded-r-[8px]' : '',
                    selected ? 'bg-mn-text/[0.07]' : '',
                  ].join(' ')}
                  onKeyDown={(e) => handleCellKeyDown(ri, -1, e)}
                >
                  {editable && onRenameRow && !struck ? (
                    <DraftInput
                      aria-label="Row title"
                      value={row.title}
                      placeholder="Untitled"
                      onCommit={(title) => onRenameRow(row.id, title)}
                      className="min-w-[4ch] max-w-full border-0 bg-transparent p-0 font-medium text-mn-text outline-none [field-sizing:content] placeholder:text-mn-text-secondary"
                    />
                  ) : (
                    row.title || 'Untitled'
                  )}
                </td>
                {schema.map((def, ci) => (
                  <td
                    key={def.id}
                    className={[
                      'py-1.5 pr-3',
                      ci === schema.length - 1 ? 'rounded-r-[8px]' : '',
                      selected ? 'bg-mn-text/[0.07]' : '',
                    ].join(' ')}
                    onKeyDown={(e) => handleCellKeyDown(ri, ci, e)}
                  >
                    <Cell
                      def={def}
                      value={coerceValue(def, row.values[def.id])}
                      editable={!!editable && !struck}
                      onChange={(v) => onEdit?.(row.id, def.id, v)}
                      schema={schema}
                      rowValues={row.values}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
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

      {selectedRow && !struckIds?.has(selectedRow.id) && (
        <RecordPeek
          key={selectedRow.id}
          row={selectedRow}
          schema={schema}
          done={done.isDone(selectedRow)}
          onToggleDone={done.toggle && (() => done.toggle?.(selectedRow))}
          now={now}
          editable={editable}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────────────────────

// The DOM key for a null (unset) bucket — a stable sentinel shared by board columns
// and calendar lanes so the drag hook can hit-test them uniformly.
const NULL_BUCKET = '__none__'

function CollectionBoard({
  viewKey,
  schema,
  rows,
  groupBy,
  editable,
  onEdit,
  onAddRow,
  onRenameRow,
  onOpenRow,
  onAddStatusField,
}: {
  /** The view block's id — what the page canvas keys its one peek and one orange pill by. */
  viewKey: string
  schema: PropertySchema
  rows: CollectionRow[]
  groupBy?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
  /** KAN-351: mint a `status` field, offered by a board whose schema has none to
   *  group by. Absent when not `editable` — the bare notice stands in instead. */
  onAddStatusField?: () => void
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
  // Guards handleAddCard against a second click while its write is in flight.
  const addingRef = useRef(false)

  // Dropping into a lane writes that option id onto the group-by property; the
  // "No <name>" lane clears it (null). A drop into the same lane is idempotent.
  const { drag, overKey, registerBucket, onCardPointerDown, isClickSuppressed, containerHandlers } =
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
    select,
    selectWithPointer,
    rowProps,
    keyboardProps,
  } = useRecordSelection(rows, viewKey, { isClickSuppressed })
  const done = useDoneToggle({ schema, groupBy, editable, onEdit })

  // Hide the trailing "No <name>" lane while it's empty — a fresh board then reads as
  // just its status lanes. It reappears the moment a card lands there unset. Except
  // when it's the only group: a status field with no options groups everything into
  // it, so hiding it would leave zero lanes and no "＋ task" to add the first row.
  const allGroups = grouped?.groups ?? []
  const visibleGroups = allGroups.filter(
    (g) => g.id !== null || g.rows.length > 0 || allGroups.length === 1
  )
  const dueOf = dueOfRow(pickDateDef(schema, undefined), now)
  const orangeTodayId = useOrangeToday(
    viewKey,
    boardRef,
    firstOrangeToday(
      visibleGroups.flatMap((g) => g.rows),
      dueOf,
      done.isDone
    )
  )

  if (!grouped) {
    // KAN-351: an editable host offers the remedy inline, same box as the
    // calendar/list/gantt's own "add a date field" (#260's `box`, action slot);
    // a read-only/Storybook render has no handler, so the bare notice stands.
    return onAddStatusField ? (
      <PondBlockEmpty
        box="box"
        line={BOARD_EMPTY_LINE}
        action="add a status field"
        onAction={onAddStatusField}
      />
    ) : (
      <ViewNotice>{BOARD_EMPTY_LINE}</ViewNotice>
    )
  }
  const { def: boardDef } = grouped

  // "＋ task": mint a row seeded with this lane's status (null → the "No <name>"
  // lane), then focus its title so you can name it immediately. A second click
  // while the first write is in flight is a no-op (AUDIT G9) — a fast double-click
  // must not mint two rows.
  const handleAddCard = async (optionId: string | null) => {
    if (!onAddRow || addingRef.current) return
    addingRef.current = true
    try {
      const id = await onAddRow(optionId ? { [boardDef.id]: optionId } : {})
      if (!id) return
      setFocusRowId(id)
      select({ id, via: 'pointer' })
    } finally {
      addingRef.current = false
    }
  }

  const draggingRow = drag?.active ? rows.find((r) => r.id === drag.rowId) : undefined
  const repeatDef = pickRepeatDef(schema)

  return (
    <div ref={boardRef} {...containerHandlers}>
      {/*
        The board is a GRID of equal lanes, not a horizontally scrolling row:
        `repeat(N, minmax(0,1fr))` at gap 10, N the lane count. A lane is an option of
        the group-by property, so adding, renaming and reordering lanes is editing
        that property, which the board does not do.
      */}
      <div
        data-part="lanes"
        className="grid gap-[10px]"
        style={{ gridTemplateColumns: `repeat(${visibleGroups.length}, minmax(0,1fr))` }}
      >
        {visibleGroups.map((group) => {
          const key = groupKey(group.id)
          const isOver = editable && drag?.active && overKey === key
          return (
            <section
              key={key}
              ref={registerBucket(key)}
              data-part="lane"
              data-lane={group.label}
              // A faint recessed wash — ink .04, radius 16, no shadow. The drop target
              // brightens it rather than lifting it: a lane with a shadow reads as a card.
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
                {/* Two bare spans, no option dot; the count inherits the head's type. */}
                <span className="truncate">{group.label}</span>
                <span data-part="lane-n">{group.rows.length}</span>
              </header>

              {group.rows.map((row) => {
                const isDragging = drag?.active && drag.rowId === row.id
                const isSelected = row.id === selectedRow?.id
                const rowDone = done.isDone(row)
                const repeat = repeatDef ? displayValue(repeatDef, row.values[repeatDef.id]) : ''
                const due = dueOf(row)
                const titleTone = rowDone ? 'text-mn-text-secondary' : 'text-mn-text'
                return (
                  <article
                    key={row.id}
                    data-part="card"
                    aria-label={row.title || 'Untitled'}
                    {...rowProps(row.id)}
                    {...keyboardProps(row.id)}
                    // The card is the drag target: a press anywhere on it starts a
                    // candidate drag, and below the hook's threshold it stays a click.
                    onPointerDown={
                      editable
                        ? (e) => {
                            if (!(e.target instanceof Element) || !e.target.closest('button, a')) {
                              onCardPointerDown(e, row.id)
                            }
                          }
                        : undefined
                    }
                    // The shadow matches no token (`--mn-shadow-card`'s second layer is
                    // 0 8px 24px), so it is written out.
                    className={[
                      'flex flex-col gap-[7px] rounded-[12px] bg-mn-card px-[11px] py-[10px]',
                      'shadow-[0_1px_2px_rgba(40,34,24,.06),0_2px_8px_rgba(40,34,24,.05)]',
                      'dark:shadow-[0_1px_2px_rgba(0,0,0,.34),0_2px_8px_rgba(0,0,0,.4)]',
                      'transition-shadow duration-[var(--motion-settle)] ease-[var(--ease-mn)] motion-reduce:transition-none',
                      // `mn-text` flips to paper in dark, so the outline does too.
                      ROW_FOCUS_VISIBLE_BASE,
                      isSelected ? 'outline-solid' : 'outline-none focus-visible:outline-solid',
                      isDragging ? 'opacity-30' : '',
                      editable ? 'cursor-grab' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    {editable && onRenameRow ? (
                      <DraftInput
                        aria-label="Card title"
                        value={row.title}
                        placeholder="Untitled"
                        autoFocus={row.id === focusRowId}
                        onClick={() => selectWithPointer(row.id)}
                        onCommit={(title) => onRenameRow(row.id, title)}
                        className={[
                          'w-full border-0 bg-transparent p-0 text-[13.5px] leading-[1.35] outline-none placeholder:text-mn-text-secondary',
                          titleTone,
                        ].join(' ')}
                      />
                    ) : (
                      <div className={['text-[13.5px] leading-[1.35]', titleTone].join(' ')}>
                        {row.title || 'Untitled'}
                      </div>
                    )}
                    {(due || repeat) && (
                      <div
                        data-part="card-meta"
                        className="flex flex-wrap gap-x-[10px] gap-y-[4px] text-[11px] font-medium text-mn-text-meta"
                      >
                        <DueMark due={due} orange={row.id === orangeTodayId} part="card-due" />
                        {repeat && (
                          <span
                            data-part="card-repeat"
                            className="inline-flex items-center gap-[4px]"
                          >
                            <RepeatMark />
                            {repeat}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}

              {/* The last line of every lane is ＋ task, inside the lane. */}
              {editable && onAddRow && (
                <button
                  type="button"
                  data-part="lane-add"
                  onClick={() => handleAddCard(group.id)}
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
          done={done.isDone(selectedRow)}
          onToggleDone={done.toggle && (() => done.toggle?.(selectedRow))}
          now={now}
          editable={editable}
          focusOnOpen={selection?.via === 'keyboard'}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}

      {/* The card lifted under the pointer: rotated -1.2deg, its own two-layer shadow. */}
      {draggingRow && drag && (
        <div
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

// ── Gallery ─────────────────────────────────────────────────────────────────────

/**
 * Gallery view — a card grid of `PondMolecule kind="record-card"`, the molecule
 * `PondBlock.dc.html`'s own gallery frame composes (`gallery: { display: 'flex',
 * gap: 12, flexWrap: 'wrap' }`). EVERY record is a card; the board's
 * `list.slice(0, mob ? 2 : 3)` is the template preview's truncation, not a product
 * rule. `untitled` and `—` are the molecule's own fallbacks; which field the one
 * meta line shows is `galleryCardMeta`, the one tag chip shows `galleryCardTag`.
 *
 * `useRecordSelection` drives hover/selected the same way the board does, but the
 * molecule owns no DOM props of its own (unlike the board's `<article>`, which IS
 * the card) — so each row gets a wrapper sized to the card, carrying
 * `rowProps`/`keyboardProps`, its own pointer-hover tracking, and the shared
 * focus-visible outline (the table row's and board card's, since this box — not the
 * molecule inside it — is the tab stop).
 */
function CollectionGallery({
  viewKey,
  schema,
  rows,
  editable,
  onEdit,
  onAddRow,
  onRenameRow,
  onOpenRow,
}: {
  /** The view block's id — what the page canvas keys its one peek and one orange pill by. */
  viewKey: string
  schema: PropertySchema
  rows: CollectionRow[]
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onOpenRow?: (rowId: string) => void
}) {
  const [now] = useState(() => new Date())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const { selectedRow, select, selectWithPointer, rowProps, keyboardProps, selectOrOpenOnKey } =
    useRecordSelection(rows, viewKey)
  const done = useDoneToggle({ schema, editable, onEdit })
  // Guards handleAddRecord against a second click while its write is in flight
  // (AUDIT G9), same shape as CollectionBoard's handleAddCard.
  const addingRef = useRef(false)

  const handleAddRecord = async () => {
    if (!onAddRow || addingRef.current) return
    addingRef.current = true
    try {
      const id = await onAddRow()
      if (!id) return
      select({ id, via: 'keyboard' })
    } finally {
      addingRef.current = false
    }
  }

  // ↵ on the card's own tab stop (not an inner control's) selects it; ↵ again on the
  // already-selected card opens its page — `useRecordSelection`'s own
  // `selectOrOpenOnKey`, shared with `CollectionTable`'s row and the calendar.
  function handleCardKeyDown(rowId: string, e: React.KeyboardEvent<HTMLElement>) {
    selectOrOpenOnKey(rowId, e, onOpenRow)
  }

  // A card's own click must never bubble to the block row underneath it: that
  // row's `handleClick` (BlockCanvas) focuses ITSELF on any click that isn't an
  // inner control's, which would steal focus off the card and make the block's
  // own ↵ fire instead of the card's — the calendar's own row click
  // (`handleCalendarRowClick`) stops propagation for the same reason. A real
  // browser moves focus to a clicked `tabIndex=0` element on its own; jsdom does
  // not, so the explicit `.focus()` also keeps this testable with `userEvent.click`.
  function handleCardClick(rowId: string, e: React.MouseEvent<HTMLElement>) {
    e.stopPropagation()
    if (!shouldSelectCardFromClick(e.target)) return
    selectWithPointer(rowId)
    e.currentTarget.focus()
  }

  return (
    <div>
      {/* No empty line of its own: the frame owns the empty state (#239). */}
      <div data-part="gallery" className="flex flex-wrap gap-[12px]">
        {rows.map((row) => {
          const selected = row.id === selectedRow?.id
          const state = selected ? 'selected' : hoveredId === row.id ? 'hover' : 'rest'
          return (
            <article
              key={row.id}
              aria-label={row.title || 'untitled'}
              className={`w-[170px] rounded-[20px] ${ROW_FOCUS_VISIBLE}`}
              {...rowProps(row.id)}
              {...keyboardProps(row.id)}
              onClick={(e) => handleCardClick(row.id, e)}
              onKeyDown={(e) => handleCardKeyDown(row.id, e)}
              onMouseEnter={() => setHoveredId(row.id)}
              onMouseLeave={() => setHoveredId((h) => (h === row.id ? null : h))}
            >
              <PondMolecule
                kind="record-card"
                state={state}
                title={row.title || 'untitled'}
                meta={galleryCardMeta(schema, row) || '—'}
                tag={galleryCardTag(schema, row)}
              />
            </article>
          )
        })}

        {editable && onAddRow && (
          <button
            type="button"
            data-part="gallery-add"
            onClick={handleAddRecord}
            className={[
              'w-[170px] rounded-[20px] bg-transparent p-[10px] text-[13px] font-medium text-mn-text-secondary',
              'ring-[1.4px] ring-inset ring-mn-text/20 transition-colors hover:bg-mn-text/[0.04] hover:text-mn-text',
              ROW_FOCUS_VISIBLE,
              'motion-reduce:transition-none',
            ].join(' ')}
          >
            ＋ add a record
          </button>
        )}
      </div>

      {selectedRow && (
        <RecordPeek
          key={selectedRow.id}
          row={selectedRow}
          schema={schema}
          done={done.isDone(selectedRow)}
          onToggleDone={done.toggle && (() => done.toggle?.(selectedRow))}
          now={now}
          editable={editable}
          onEdit={onEdit}
          onRenameRow={onRenameRow}
          onOpenRow={onOpenRow}
        />
      )}
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
  onAddRow,
  onRenameRow,
  onAddDateField,
}: {
  schema: PropertySchema
  rows: CollectionRow[]
  startId?: string
  endId?: string
  editable?: boolean
  onEdit?: (rowId: string, key: string, value: PropertyValue) => void
  onAddRow?: (values?: Record<string, PropertyValue>) => Promise<string | null>
  onRenameRow?: (rowId: string, title: string) => void
  onAddDateField?: () => void
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

  // The foot row's own `add a task` input — todayIso is frozen per mount, same
  // as the calendar's, so it doesn't drift mid-session.
  const [addingTask, setAddingTask] = useState(false)
  const [todayIso] = useState(() => localDateIso(new Date()))
  const handleAddTask = async (title: string) => {
    if (!defs) return
    try {
      const id = await onAddRow?.({
        [defs.startDef.id]: todayIso,
        ...(defs.endDef ? { [defs.endDef.id]: addDays(todayIso, 1) } : {}),
      })
      if (id) onRenameRow?.(id, title)
    } catch (err) {
      console.error('Failed to add a task', err)
    }
  }
  // No start property at all → nothing to date a new task with, so no row
  // (same guard as the void-box swap below).
  const canAddTask = !!editable && !!onAddRow && !!defs
  const addTaskRow = canAddTask && (
    <li data-part="gantt-add-row" className={GANTT_ROW}>
      {addingTask ? (
        <AddRowInput
          aria-label="Add a task"
          placeholder="Untitled"
          autoFocus
          staysOpen
          onCommit={(title) => void handleAddTask(title)}
          onCancel={() => setAddingTask(false)}
          className={`${GANTT_LABEL} border-0 bg-transparent p-0 font-mono text-mn-text outline-none placeholder:text-mn-text-secondary`}
        />
      ) : (
        <button
          type="button"
          data-part="gantt-add"
          onClick={() => setAddingTask(true)}
          className="rounded-[8px] p-[4px] text-left font-mono text-[11px] font-medium text-mn-text-secondary transition-colors hover:bg-mn-text/[0.04] hover:text-mn-text motion-reduce:transition-none"
        >
          add a task
        </button>
      )}
      <span />
    </li>
  )

  if (!defs) {
    // No date property at all: the void box has no action slot, so the remedy
    // uses the board's `box` emptyBox instead — same line, same action as the
    // other kinds' no-date case. A read-only render (no handler) has no button to
    // offer, so it keeps the bare voidBox, same as the "nothing dated" case below.
    return onAddDateField ? (
      <PondBlockEmpty
        box="box"
        line={GANTT_EMPTY_LINE}
        action="add a date field"
        onAction={onAddDateField}
      />
    ) : (
      <PondBlockEmpty box="void" line={GANTT_EMPTY_LINE} />
    )
  }
  // Nothing dated: the shared voidBox with the template's own line — true whether the
  // rows are missing or simply carry no dates. `add a task` still draws here, and it
  // must render at the SAME tree position as the bar list's own foot row below (one
  // `<ul>`, sibling after the head/void content) so adding the first task never
  // remounts it — a remount would drop an in-flight draft (KAN-352).
  const noBars = !layout || layout.bars.length === 0 || !layout.rangeStart || !layout.rangeEnd
  const bars = noBars ? [] : layout.bars
  const rangeStart = noBars ? null : layout.rangeStart
  const { endDef } = defs
  const startDay = rangeStart ? epochDay(rangeStart) : 0
  const pct = (day: number) => ((day - startDay) / totalDays) * 100
  const ticks = rangeStart ? quarterTicks(rangeStart, totalDays) : []

  return (
    <div {...containerHandlers}>
      <div className={drag?.active ? 'cursor-grabbing select-none' : undefined}>
        {noBars ? (
          <PondBlockEmpty box="void" line={GANTT_EMPTY_LINE} />
        ) : (
          /* gHead — an empty label cell, then the four ticks in their quarter cells. */
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
        )}

        {/* gRow — a 120px label column + a proportional track, each on its own hairline.
            Always the same `<ul>`, whether or not there are bars, so `addTaskRow` below
            never moves tree position. */}
        <ul role="list">
          {!noBars &&
            bars.map(({ row, startIso, endIso }, i) => {
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
                            onPointerDown={(e) =>
                              onBarPointerDown(e, row.id, 'resize-start', dates)
                            }
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
          {addTaskRow}
        </ul>
      </div>
    </div>
  )
}
