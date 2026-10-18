'use client'

/**
 * The trash page (KAN-451; `TRASH_NODE_ID`): a reserved virtual node like the
 * change log, rendered in `DocumentPanel` in place of the `getPage`/rows path.
 *
 * Rows come from `buildTrashRows` over every `delete`/`restore` record, read
 * keyset-paginated the same way the change log's own "all" tab reads its
 * records (`RECORDS_PAGE_SIZE`, `useInfiniteQuery`) — each page also resolves
 * `existingPageIds` for its own delete targets, the same "still in trash vs
 * emptied" split `ChangeLogPage`'s `deleted` view makes (0027 part 2 hides a
 * trashed row from even its own owner's SELECT). No board places trash in the
 * rail; the lead line, table and empty state read off the change log's own
 * registers (s6o1's table shell, `change-log-empty`'s mono secondary text).
 *
 * Restore: a per-row text control calling `restorePage`, invalidating the
 * same keys `ChangeLogPage`'s own restore does — the row leaves the table
 * once the refetch it triggers pairs its `delete` record with the new
 * `restore` (the same pairing `buildTrashRows` already excludes on), no
 * manual removal. A parent-fallback restore reads its own freshly-fetched
 * `restore` record for the flag and says so, same line as `ChangeLogPage`.
 */

import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { usePondName } from '@/lib/pond/name'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import { listRecords } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { existingPageIds, PARENT_FALLBACK_LINE, restorePage } from '@/lib/change-log/trash'
import { personFacingMessage } from '@/lib/change-log/errors'
import { buildTrashRows, type TrashRow } from '@/lib/change-log/trash-view'
import { fellBackToPondRoot, groupByTarget, TRASH_RETENTION_DAYS } from '@/lib/change-log/deleted-view'
import { readTrashSnapshot } from '@/lib/change-log/summary'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { listPages } from '@/lib/pages/client'
import { pagesKey } from '@/lib/pages/keys'
import { isArea } from '@/lib/pages/mark'
import { areaGlyph } from '@/lib/rail/area-glyph'
import { AreaMark } from '@/components/atoms/AreaMark'
import { PondControl } from '@/components/atoms/PondControl'

/** The trash table's own six-column grid — no board places trash in the
 *  rail, so this reads off the change log's own `TABLE_COLUMNS` register
 *  (same shell, a column set sized for this table's own content instead),
 *  with a trailing column for the restore control. */
const TRASH_TABLE_COLUMNS = 'grid-cols-[minmax(0,1fr)_170px_96px_88px_104px_76px]'

/** Keyset page size — same value and cursor pattern as the change log's own
 *  "all" tab (`ChangeLogPage.tsx`). */
const RECORDS_PAGE_SIZE = 50

/** The trash page's own content column — no board of its own, so this reads
 *  off the change log's "all"/"by page" table width (s6o1). */
const TRASH_COLUMN_PX = 840

/** The trash page's own record page, pond-scoped, under the shared
 *  change-log root — same nesting every change-log query uses. */
function trashKey(pondId: string | null) {
  return [...changeLogKey(), pondId, 'trash'] as const
}

/** One keyset page of the trash query's own cache — named so the restore
 *  mutation can read it back out of `queryClient` after the invalidation it
 *  triggers, the same way `ChangeLogPage`'s own restore reads its deleted
 *  view's cache. */
interface TrashRecordsPage {
  records: ChangeLogRecord[]
  goneIds: Set<string>
}

const pluralPages = (n: number): string => `${n} ${n === 1 ? 'page' : 'pages'}`

/** The slice of a live page this walk needs — a subset of `MarkSource`, built
 *  straight off the shared `listPages` cache (which carries no `glyph`/
 *  `area_role`, so only the title-derived automatic glyph is ever drawn
 *  here). */
interface LivePageNode {
  id: string
  parentId: string | null
  type?: string
  title: string
}

/**
 * A trashed page's leading glyph: walk its former parent up the LIVE pages
 * tree to the area it sat in, and draw that area's automatic glyph — none
 * when the chain is gone or the page was already at the pond root. A
 * trashed page's own mark is unreadable (RLS hides a trashed row's content,
 * and 0027's `TrashSnapshot` carries no mark), so the area is the only glyph
 * this row can truthfully draw without a migration.
 */
function areaGlyphForFormerParent(
  parentId: string | null,
  pagesById: ReadonlyMap<string, LivePageNode>
): string | null {
  if (parentId === null) return null
  const seen = new Set<string>()
  let cursor = pagesById.get(parentId)
  while (cursor && !isArea(cursor) && cursor.parentId !== null && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    cursor = pagesById.get(cursor.parentId)
  }
  return cursor && isArea(cursor) ? areaGlyph(cursor.title) : null
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
}: {
  row: TrashRow
  glyph: string | null
  busy: boolean
  onRestore: () => void
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
      <PondControl kind="button" variant="ghost" disabled={busy} onClick={onRestore}>
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

  // Each page resolves its own `existingPageIds` alongside its own records —
  // the same "still in trash vs emptied" split `changeLogDeletedKey` makes,
  // just paginated: a delete's answering `restore` always has an earlier
  // (newer) `createdAt`, so it is always loaded by the time a later page
  // reaches the delete it answers.
  const {
    data: recordPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: recordsLoading,
  } = useInfiniteQuery({
    queryKey: trashKey(pondId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<TrashRecordsPage> => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return { records: [], goneIds: new Set<string>() }
      const records = await listRecords(supabase, {
        userId: user.id,
        pondId,
        action: ['delete', 'restore'],
        limit: RECORDS_PAGE_SIZE,
        before: pageParam,
      })
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
    getNextPageParam: (lastPage) =>
      lastPage.records.length < RECORDS_PAGE_SIZE
        ? undefined
        : lastPage.records[lastPage.records.length - 1].createdAt,
  })

  const records = useMemo(() => recordPages?.pages.flatMap((p) => p.records) ?? [], [recordPages])
  const goneIds = useMemo(() => {
    const all = new Set<string>()
    for (const page of recordPages?.pages ?? []) {
      for (const id of page.goneIds) all.add(id)
    }
    return all
  }, [recordPages])

  // The same `[...pagesKey(pondId), 'full']` cache `ChangeLogPage` reads —
  // one page-title/tree fetch, not a second one just for this table.
  const { data: pages = [] } = useQuery({
    queryKey: [...pagesKey(pondId), 'full'],
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      return listPages(supabase, user.id, pondId)
    },
  })

  const pageTitleById = useMemo(() => new Map(pages.map((p) => [p.id, p.title])), [pages])
  const pagesById = useMemo(
    () => new Map(pages.map((p) => [p.id, { id: p.id, parentId: p.parentId, type: p.type, title: p.title }])),
    [pages]
  )

  const rows = useMemo(
    () => buildTrashRows(records, pageTitleById, goneIds, pondName, new Date()),
    [records, pageTitleById, goneIds, pondName]
  )

  const restoreMutation = useMutation({
    mutationFn: (vars: { recordId: string; targetPageId: string | null }) =>
      restorePage(getSupabase(), vars.recordId),
    onMutate: () => {
      setRestoreError(null)
      setRestoreNotice(null)
    },
    onError: (err) => setRestoreError(personFacingMessage(err)),
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
      const refreshed = queryClient.getQueryData<{ pages: TrashRecordsPage[] }>(trashKey(pondId))
      const allRecords = refreshed?.pages.flatMap((p) => p.records) ?? []
      const sameTarget =
        vars.targetPageId === null ? [] : groupByTarget(allRecords).get(vars.targetPageId) ?? []
      const next = sameTarget[sameTarget.findIndex((r) => r.id === vars.recordId) + 1]
      if (next?.action === 'restore' && fellBackToPondRoot(next.after)) {
        setRestoreNotice(PARENT_FALLBACK_LINE)
      }
    },
  })

  return (
    <div className="h-full overflow-y-auto">
      <div
        {...column}
        data-testid="trash-column"
        className={`${column.className} flex flex-col gap-4`}
      >
        <span className="font-serif text-[50px] leading-none font-extralight tracking-[-0.01em] text-mn-text">
          trash
        </span>
        {!recordsLoading && (
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
              {rows.map((row) => (
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
                  onRestore={() =>
                    restoreMutation.mutate({
                      recordId: row.record.id,
                      targetPageId: row.record.targetPageId,
                    })
                  }
                />
              ))}
              {hasNextPage && (
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  data-testid="trash-load-more"
                  className="mt-1 w-full py-2 text-center font-mono text-[11px] lowercase tracking-[0.02em] text-mn-text-secondary disabled:opacity-60"
                >
                  {isFetchingNextPage ? 'loading…' : 'load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
