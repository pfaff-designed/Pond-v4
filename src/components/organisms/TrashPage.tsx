'use client'

/**
 * The trash page (KAN-451; `TRASH_NODE_ID`): a reserved virtual node like the
 * change log, rendered in `DocumentPanel` in place of the `getPage`/rows path.
 *
 * Rows come from `buildTrashRows` over EVERY `delete`/`restore` record for
 * the pond: the query fetches every keyset page itself (`RECORDS_PAGE_SIZE`
 * at a time, looping until a short page) rather than stopping at one, because
 * `N` and the empty state are derived from ROWS, not records — a pond whose
 * newest records are all delete/restore pairs would otherwise read as empty,
 * and `N` would only ever count the first page's worth. Delete/restore
 * records are low-volume (ordinary edits don't produce them), so fetching
 * every one is cheap; it's the derived ROWS that get paginated, client-side,
 * 50 at a time behind "load more". Once every record is in, one
 * `existingPageIds` call resolves every delete target at once — the same
 * "still in trash vs emptied" split `ChangeLogPage`'s `deleted` view makes
 * (0027 part 2 hides a trashed row from even its own owner's SELECT). No
 * board places trash in the rail; the lead line, table and empty state read
 * off the change log's own registers (s6o1's table shell, `change-log-empty`'s
 * mono secondary text).
 *
 * Restore: a per-row text control calling `restorePage`, invalidating the
 * same keys `ChangeLogPage`'s own restore does — the row leaves the table
 * once the refetch it triggers pairs its `delete` record with the new
 * `restore` (the same pairing `buildTrashRows` already excludes on), no
 * manual removal. A parent-fallback restore reads its own freshly-fetched
 * `restore` record for the flag and says so, same line as `ChangeLogPage`.
 *
 * A row's restore click is guarded by a ref (`inFlightRecordIds`), checked
 * and set synchronously in the click handler — `busy` alone only disables
 * the control after React re-renders, too late to catch two clicks fired
 * before that render (AUDIT G9). Once a restored row leaves the table, focus
 * moves to the next row's restore control, else the previous row's, else the
 * `trash` heading when the table is now empty — never left to fall to
 * `<body>`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { usePondName } from '@/lib/pond/name'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import { listRecords } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { existingPageIds, PARENT_FALLBACK_LINE } from '@/lib/change-log/trash'
import { personFacingMessage } from '@/lib/change-log/errors'
import { buildTrashRows, type TrashRow } from '@/lib/change-log/trash-view'
import { fellBackToPondRoot, groupByTarget, TRASH_RETENTION_DAYS } from '@/lib/change-log/deleted-view'
import { readTrashSnapshot } from '@/lib/change-log/summary'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { pagesKey } from '@/lib/pages/keys'
import { useFullPages } from '@/lib/pages/use-pages'
import { restorePageRelinked } from '@/lib/pages/child-links'
import { areaOf } from '@/lib/pages/mark'
import { areaGlyph } from '@/lib/rail/area-glyph'
import { AreaMark } from '@/components/atoms/AreaMark'
import { PondControl } from '@/components/atoms/PondControl'

/** The trash table's own six-column grid — no board places trash in the
 *  rail, so this reads off the change log's own `TABLE_COLUMNS` register
 *  (same shell, a column set sized for this table's own content instead),
 *  with a trailing column for the restore control. `page` carries the row's
 *  primary datum (the trashed page's own title), so its flexible share
 *  (1.6fr) stays wider than `was in`'s (1fr) at every surface width instead
 *  of the two splitting evenly. */
const TRASH_TABLE_COLUMNS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_96px_88px_104px_76px]'

/** Keyset page size for the records FETCH (every page is fetched, looped
 *  internally) and the client-side page size for the derived ROWS table —
 *  same value, same "load more" cursor feel as the change log's own "all"
 *  tab (`ChangeLogPage.tsx`), two different things it paginates. */
const RECORDS_PAGE_SIZE = 50

/** The trash page's own content column — no board of its own, so this reads
 *  off the change log's "all"/"by page" table width (s6o1). */
const TRASH_COLUMN_PX = 840

/** The trash page's own record page, pond-scoped, under the shared
 *  change-log root — same nesting every change-log query uses. */
function trashKey(pondId: string | null) {
  return [...changeLogKey(), pondId, 'trash'] as const
}

/** The trash query's own cache shape — EVERY `delete`/`restore` record for
 *  the pond, already fully paged in, named so the restore mutation can read
 *  it back out of `queryClient` after the invalidation it triggers, the same
 *  way `ChangeLogPage`'s own restore reads its deleted view's cache. */
interface TrashRecords {
  records: ChangeLogRecord[]
  goneIds: Set<string>
}

const pluralPages = (n: number): string => `${n} ${n === 1 ? 'page' : 'pages'}`

/** The slice of a live page `mark.ts`'s `areaOf` needs — a subset of
 *  `MarkSource`, built straight off the shared `useFullPages` cache (which
 *  carries no `glyph`/`area_role`, so only the title-derived automatic
 *  glyph is ever drawn here). */
interface LivePageNode {
  id: string
  parentId: string | null
  type?: string
  title: string
}

/**
 * A trashed page's leading glyph: walk its former parent up the LIVE pages
 * tree to the area it sat in (`mark.ts`'s own `areaOf` walk — this epic owns
 * that file), and draw that area's automatic glyph — none when the chain is
 * gone or the page was already at the pond root. A trashed page's own mark
 * is unreadable (RLS hides a trashed row's content, and 0027's
 * `TrashSnapshot` carries no mark), so the area is the only glyph this row
 * can truthfully draw without a migration.
 */
function areaGlyphForFormerParent(
  parentId: string | null,
  pagesById: ReadonlyMap<string, LivePageNode>
): string | null {
  if (parentId === null) return null
  const start = pagesById.get(parentId)
  if (!start) return null
  const area = areaOf(start, pagesById)
  return area ? areaGlyph(area.title) : null
}

/** One trash row: the page's title led by its area glyph (if any), then
 *  was-in / deleted / deleted-by / goes, then restore —
 *  `TRASH_TABLE_COLUMNS`'s six columns. `restore` is a plain text control,
 *  always drawn (never a hover-only affordance), so it's keyboard-reachable
 *  by tabbing through the table like every other control. */
function TrashTableRow({
  row,
  glyph,
  busy,
  onRestore,
  buttonRef,
}: {
  row: TrashRow
  glyph: string | null
  busy: boolean
  onRestore: () => void
  /** Keeps the row's own restore control findable by record id, for the
   *  focus hop {@link TrashPage}'s own restore handler makes once the row
   *  it was clicked on leaves the table. */
  buttonRef: (el: HTMLElement | null) => void
}) {
  return (
    <div
      data-testid="trash-row"
      className={`grid ${TRASH_TABLE_COLUMNS} min-h-[38px] w-full items-center gap-x-[14px] border-b border-mn-hair px-[10px] text-left text-[13.5px]`}
    >
      <span className="flex items-center gap-1.5 truncate">
        {glyph && <AreaMark glyph={glyph} />}
        <span className="truncate">{row.page}</span>
      </span>
      <span className="truncate text-[12.5px] text-mn-text-meta">{row.wasIn}</span>
      <span className="font-mono text-[10.5px] text-mn-text-secondary">{row.deletedAt}</span>
      <span className="text-[12.5px] text-mn-text-meta">{row.deletedBy}</span>
      <span className="text-[12.5px] font-medium text-mn-text">{row.goes}</span>
      <PondControl kind="button" variant="ghost" disabled={busy} onClick={onRestore} ref={buttonRef}>
        {busy ? 'restoring…' : 'restore'}
      </PondControl>
    </div>
  )
}

export function TrashPage() {
  const getSupabase = useLazySupabase()
  const pondId = usePondId()
  const pondName = usePondName()
  const { column } = useSurfaceColumn(TRASH_COLUMN_PX)
  const queryClient = useQueryClient()
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(RECORDS_PAGE_SIZE)
  const headingRef = useRef<HTMLSpanElement>(null)
  const restoreButtonRefs = useRef<Map<string, HTMLElement>>(new Map())
  // A ref, not state: it must block a second click SYNCHRONOUSLY, in the
  // click handler itself, before React has a chance to re-render and
  // disable the button via `busy` — otherwise a fast double-click lands
  // both clicks before the first render that would have disabled it.
  const inFlightRecordIds = useRef<Set<string>>(new Set())
  // recordId -> the row to focus once that record's row leaves `rows` (next
  // row, else the previous row, else null for the heading) — set at click
  // time, read by the effect below once the restore actually lands.
  const pendingFocusTargets = useRef<Map<string, string | null>>(new Map())

  // N and the empty state are over derived ROWS, not records, so this fetches
  // EVERY delete/restore record for the pond — looping keyset pages itself
  // until a short page signals the end — rather than stopping at one page
  // and letting `buildTrashRows` see only a slice. Delete/restore records are
  // low-volume, so fetching all of them is cheap; it's the ROWS that get
  // paginated client-side, below.
  const { data: trashData, isLoading: recordsLoading } = useQuery({
    queryKey: trashKey(pondId),
    // Another tab can trash/restore the same pond's pages with no shared
    // `QueryClient` to learn from, so this table's only signal is its own
    // open/focus — the app-wide 30s `staleTime` (`providers.tsx`) would
    // silently swallow both for the first 30 seconds after any mount.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    queryFn: async (): Promise<TrashRecords> => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return { records: [], goneIds: new Set<string>() }
      const records: ChangeLogRecord[] = []
      let before: string | undefined
      for (;;) {
        const page = await listRecords(supabase, {
          userId: user.id,
          pondId,
          action: ['delete', 'restore'],
          limit: RECORDS_PAGE_SIZE,
          before,
        })
        records.push(...page)
        if (page.length < RECORDS_PAGE_SIZE) break
        before = page[page.length - 1].createdAt
      }
      const rootIds = [
        ...new Set(
          records
            .filter((r) => r.action === 'delete')
            .map((r) => r.targetPageId)
            .filter((id): id is string => id !== null)
        ),
      ]
      const existing = await existingPageIds(supabase, rootIds)
      const goneIds = new Set(rootIds.filter((id) => !existing.has(id)))
      return { records, goneIds }
    },
  })

  const records = useMemo(() => trashData?.records ?? [], [trashData])
  const goneIds = useMemo(() => trashData?.goneIds ?? new Set<string>(), [trashData])

  // The same `[...pagesKey(pondId), 'full']` cache `ChangeLogPage` reads —
  // one shared hook, not a second fetch just for this table.
  const { data: pages = [] } = useFullPages(pondId)

  const pageTitleById = useMemo(() => new Map(pages.map((p) => [p.id, p.title])), [pages])
  const pagesById = useMemo(
    () => new Map(pages.map((p) => [p.id, { id: p.id, parentId: p.parentId, type: p.type, title: p.title }])),
    [pages]
  )

  const rows = useMemo(
    () => buildTrashRows(records, pageTitleById, goneIds, pondName, new Date()),
    [records, pageTitleById, goneIds, pondName]
  )
  // N and "load more" paginate the derived ROWS, client-side — every record
  // is already fetched above, so this is a slice, not a query.
  const visibleRows = rows.slice(0, visibleCount)
  const hasMoreRows = visibleCount < rows.length

  const restoreMutation = useMutation({
    mutationFn: (vars: { recordId: string; targetPageId: string | null }) =>
      restorePageRelinked(getSupabase(), queryClient, {
        pondId,
        recordId: vars.recordId,
        rootPageId: vars.targetPageId,
      }),
    onMutate: () => {
      setRestoreError(null)
      setRestoreNotice(null)
    },
    onSettled: (_data, _error, vars) => {
      inFlightRecordIds.current.delete(vars.recordId)
    },
    onError: (err) => {
      // A refused restore (two tabs: the other already restored it) leaves a
      // stale row next to the error unless this also invalidates — the same
      // keys `onSuccess` below invalidates, so the refetch it triggers drops
      // the now-restored row from the table.
      setRestoreError(personFacingMessage(err))
      queryClient.invalidateQueries({ queryKey: trashKey(pondId) })
      queryClient.invalidateQueries({ queryKey: changeLogKey() })
    },
    onSuccess: async (_data, vars) => {
      // Puts the page back in the rail/⌘K/pickers and refreshes every
      // change-log view (this table included, since `trashKey` nests under
      // `changeLogKey()`) in one go — same keys `ChangeLogPage`'s own
      // restore invalidates.
      queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
      queryClient.invalidateQueries({ queryKey: ['rows'] })
      queryClient.invalidateQueries({ queryKey: ['page'] })
      await queryClient.invalidateQueries({ queryKey: changeLogKey() })
      // The refetch this just triggered carries the new `restore` record —
      // read its `parentFallback` back off it, the same pairing
      // `buildTrashRows` already uses to exclude a restored row.
      const refreshed = queryClient.getQueryData<TrashRecords>(trashKey(pondId))
      const allRecords = refreshed?.records ?? []
      const sameTarget =
        vars.targetPageId === null ? [] : groupByTarget(allRecords).get(vars.targetPageId) ?? []
      const next = sameTarget[sameTarget.findIndex((r) => r.id === vars.recordId) + 1]
      if (next?.action === 'restore' && fellBackToPondRoot(next.after)) {
        setRestoreNotice(PARENT_FALLBACK_LINE)
      }
    },
  })

  // One click = one write: `inFlightRecordIds` is checked and set here,
  // synchronously, before `mutate` ever runs — a second click on the same
  // row while the first is still in flight is a no-op, regardless of
  // whether React has re-rendered `busy` yet (AUDIT G9).
  const handleRestore = (recordId: string, targetPageId: string | null): void => {
    if (inFlightRecordIds.current.has(recordId)) return
    inFlightRecordIds.current.add(recordId)
    const index = rows.findIndex((r) => r.record.id === recordId)
    const neighborId =
      index === -1
        ? null
        : index < rows.length - 1
          ? rows[index + 1].record.id
          : index > 0
            ? rows[index - 1].record.id
            : null
    pendingFocusTargets.current.set(recordId, neighborId)
    restoreMutation.mutate({ recordId, targetPageId })
  }

  // Fires once a pending restore's own row has actually left `rows` (the
  // refetch landed) — never on the render where a restore merely started,
  // and never at all if it was refused (the row stays, so this never
  // consumes that entry). A keyboard user who just pressed this row's
  // restore should not drop to `<body>` once it disappears.
  useEffect(() => {
    if (pendingFocusTargets.current.size === 0) return
    for (const [recordId, neighborId] of pendingFocusTargets.current) {
      if (rows.some((r) => r.record.id === recordId)) continue
      pendingFocusTargets.current.delete(recordId)
      if (neighborId) {
        restoreButtonRefs.current.get(neighborId)?.focus()
      } else {
        headingRef.current?.focus()
      }
    }
  }, [rows])

  return (
    <div className="h-full overflow-y-auto">
      <div
        {...column}
        data-testid="trash-column"
        className={`${column.className} flex flex-col gap-4`}
      >
        <span
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-[50px] leading-none font-extralight tracking-[-0.01em] text-mn-text"
        >
          trash
        </span>
        {!recordsLoading && rows.length > 0 && (
          <p className="font-mono text-[12.5px] text-mn-text-secondary">
            {`${pluralPages(rows.length)} in trash · each goes ${TRASH_RETENTION_DAYS} days after it's deleted`}
          </p>
        )}
        {restoreError && (
          <p role="alert" className="font-mono text-[12.5px] text-mn-text-secondary">
            {restoreError}
          </p>
        )}
        {restoreNotice && (
          <p role="status" className="font-mono text-[12.5px] text-mn-text-secondary">
            {restoreNotice}
          </p>
        )}
        <div className="rounded-mn-card bg-mn-card px-[10px] pt-[14px] pb-[6px] shadow-mn-card">
          {recordsLoading ? null : rows.length === 0 ? (
            <p
              data-testid="trash-empty"
              className="px-[10px] pb-[8px] font-mono text-[12.5px] text-mn-text-secondary"
            >
              trash is empty
            </p>
          ) : (
            <>
              <div
                className={`grid ${TRASH_TABLE_COLUMNS} gap-x-[14px] border-b border-mn-line px-[10px] pb-2 text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase`}
              >
                <span>page</span>
                <span>was in</span>
                <span>deleted</span>
                <span>deleted by</span>
                <span>goes</span>
                <span />
              </div>
              {visibleRows.map((row) => (
                <TrashTableRow
                  key={row.record.id}
                  row={row}
                  glyph={areaGlyphForFormerParent(
                    readTrashSnapshot(row.record.before)?.parentId ?? null,
                    pagesById
                  )}
                  busy={
                    restoreMutation.isPending &&
                    restoreMutation.variables?.recordId === row.record.id
                  }
                  onRestore={() => handleRestore(row.record.id, row.record.targetPageId)}
                  buttonRef={(el) => {
                    if (el) restoreButtonRefs.current.set(row.record.id, el)
                    else restoreButtonRefs.current.delete(row.record.id)
                  }}
                />
              ))}
              {hasMoreRows && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + RECORDS_PAGE_SIZE)}
                  data-testid="trash-load-more"
                  className="mt-1 w-full py-2 text-center font-mono text-[11px] lowercase tracking-[0.02em] text-mn-text-secondary disabled:opacity-60"
                >
                  load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
