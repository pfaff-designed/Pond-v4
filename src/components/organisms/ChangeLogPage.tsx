'use client'

/**
 * The change log page (KAN-94; board `Pond 06.15 Change log`, frame `s6o1`):
 * the title, the "N proposed, waiting on you" lead figure wired to
 * `countWaiting`, the view bar, and the table — grouped by day, built from
 * the page's own `listRecords` + page-title fetch through `buildLogRows`.
 * Renders in `DocumentPanel` in place of the virtual-node stub.
 */

import { useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { useSurfaceColumn } from '@/lib/layout/surface-column'
import { countWaiting, listRecords } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { buildLogRows } from '@/lib/change-log/log-page'
import { clockTime } from '@/lib/change-log/page-changes'
import { labelForStatus } from '@/lib/change-log/status'
import { listPages } from '@/lib/pages/client'
import { pagesKey } from '@/lib/pages/keys'

/** s6o1's table: the five-column grid every header, day-group and record row shares. */
const TABLE_COLUMNS = 'grid-cols-[52px_minmax(0,1fr)_150px_92px_118px]'

/** Keyset page size — "load more" reads the next one via the prior page's oldest `createdAt`. */
const RECORDS_PAGE_SIZE = 50

/** The waiting-count query's key — pond-scoped, under the shared change-log root. */
export function changeLogWaitingKey(pondId: string | null) {
  return [...changeLogKey(), pondId, 'waiting'] as const
}

/** The log's record page, pond-scoped, under the shared change-log root. */
function changeLogRecordsKey(pondId: string | null) {
  return [...changeLogKey(), pondId, 'records'] as const
}

/** s6o1's content column (840px, left of the 1180px frame after the rail). */
const CHANGE_LOG_COLUMN_PX = 840

/**
 * s6o1's view bar. Only "all" is built — the rest are drawn per the board but
 * stay inert (PROJECT_RULES "nothing locked in": visible-but-inert over
 * hidden, since no view beyond "all" exists yet).
 */
const INERT_VIEWS = ['proposed', 'by page', 'memory', 'deleted'] as const

export function ChangeLogPage() {
  const getSupabase = useLazySupabase()
  const pondId = usePondId()
  const { column } = useSurfaceColumn(CHANGE_LOG_COLUMN_PX)

  const { data: waiting, isLoading } = useQuery({
    queryKey: changeLogWaitingKey(pondId),
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return 0
      return countWaiting(supabase, user.id, pondId)
    },
  })

  const {
    data: recordPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: recordsLoading,
  } = useInfiniteQuery({
    queryKey: changeLogRecordsKey(pondId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      return listRecords(supabase, {
        userId: user.id,
        pondId,
        limit: RECORDS_PAGE_SIZE,
        before: pageParam,
      })
    },
    // A short page means there's nothing older left — the cursor is the page's
    // own oldest `createdAt` (keyset, not an offset).
    getNextPageParam: (lastPage) =>
      lastPage.length < RECORDS_PAGE_SIZE
        ? undefined
        : lastPage[lastPage.length - 1].createdAt,
  })

  const records = useMemo(() => recordPages?.pages.flat() ?? [], [recordPages])

  // The same `['pages', pondId, 'full']` cache AITerminal's destination picker
  // reads — one page-title fetch, not a second one just for this table.
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
  const groups = useMemo(() => buildLogRows(records, pageTitleById), [records, pageTitleById])

  return (
    <div className="h-full overflow-y-auto">
      <div {...column} className={`${column.className} flex flex-col gap-4`}>
        <span className="font-serif text-[50px] leading-none font-extralight tracking-[-0.01em] text-mn-text">
          change log
        </span>
        <p className="max-w-[560px] font-serif text-[17px] leading-[1.6] font-extralight text-mn-text">
          Every action in this pond, by you, by Pond and by anyone you share a page with. One
          record for each, newest first.
        </p>
        <div className="flex items-end gap-[14px] pt-1 pb-[2px]">
          <span
            className="text-[88px] leading-[.9] font-light tracking-[-0.03em] text-mn-text"
            data-testid="change-log-waiting-count"
          >
            {isLoading ? '–' : waiting}
          </span>
          <span className="pb-2 text-[13.5px] leading-[1.4] text-mn-text-meta">
            proposed,
            <br />
            waiting on you
          </span>
        </div>
        <div className="flex items-center gap-1 text-[12.5px]">
          <button
            type="button"
            aria-pressed="true"
            className="rounded-full bg-mn-hover-fill px-[11px] py-[5px] font-medium text-mn-text"
          >
            all
          </button>
          {INERT_VIEWS.map((view) => (
            <span
              key={view}
              aria-disabled="true"
              className="rounded-full px-[11px] py-[5px] text-mn-text-secondary"
            >
              {view}
            </span>
          ))}
          <span
            aria-disabled="true"
            className="px-[9px] py-[5px] font-mono text-[11px] lowercase tracking-[0.02em] text-mn-text-secondary"
          >
            ＋ view
          </span>
        </div>
        <div className="rounded-mn-card bg-mn-card px-[10px] pt-[14px] pb-[6px] shadow-mn-card">
          {recordsLoading ? null : records.length === 0 ? (
            <p
              data-testid="change-log-empty"
              className="px-[10px] pb-[8px] font-mono text-[12.5px] text-mn-text-secondary"
            >
              nothing logged in this pond yet
            </p>
          ) : (
            <>
              <div
                className={`grid ${TABLE_COLUMNS} gap-x-[14px] border-b border-mn-line px-[10px] pb-2 text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase`}
              >
                <span>time</span>
                <span>what</span>
                <span>page</span>
                <span>by</span>
                <span>status</span>
              </div>
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="px-[10px] pt-3 pb-[6px] text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase">
                    {group.label}
                  </div>
                  {group.rows.map((row) => (
                    <div
                      key={row.record.id}
                      className={`grid ${TABLE_COLUMNS} min-h-[38px] items-center gap-x-[14px] border-b border-mn-hair px-[10px] text-[13.5px]`}
                    >
                      <span className="font-mono text-[10.5px] text-mn-text-secondary">
                        {clockTime(row.record)}
                      </span>
                      <span className="truncate">{row.label}</span>
                      <span className="truncate text-[12.5px] text-mn-text-meta">{row.page}</span>
                      <span className="text-[12.5px] text-mn-text-meta">{row.by}</span>
                      {row.status.kind === 'pill' ? (
                        <span
                          data-testid={`change-log-status-${row.record.id}`}
                          className="justify-self-start rounded-full px-2 py-0.5 font-mono text-[10.5px] text-mn-text ring-1 ring-mn-mark-faint ring-inset"
                        >
                          {labelForStatus(row.status.text)}
                        </span>
                      ) : (
                        <span
                          data-testid={`change-log-status-${row.record.id}`}
                          className="font-mono text-[10.5px] text-mn-text-secondary"
                        >
                          {labelForStatus(row.status.text)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {hasNextPage && (
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  data-testid="change-log-load-more"
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
