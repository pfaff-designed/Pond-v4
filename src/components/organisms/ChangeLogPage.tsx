'use client'

/**
 * The change log page (KAN-94; board `Pond 06.15 Change log`, frame `s6o1`):
 * the title, the "N proposed, waiting on you" lead figure wired to
 * `countWaiting`, the view bar, and the table — grouped by day, built from
 * the page's own `listRecords` + page-title fetch through `buildLogRows`.
 * Renders in `DocumentPanel` in place of the virtual-node stub.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { usePondName } from '@/lib/pond/name'
import { PAGE_COLUMN_PAD_PX, useSurfaceColumn } from '@/lib/layout/surface-column'
import { countWaiting, listRecords } from '@/lib/change-log/store'
import { changeLogKey } from '@/lib/change-log/keys'
import { buildLogRows } from '@/lib/change-log/log-page'
import { changeLogRecordUrl } from '@/lib/change-log/record-page'
import { clockTime } from '@/lib/change-log/page-changes'
import { labelForStatus, WAITING_STATUSES } from '@/lib/change-log/status'
import { buildDeletedCards, type DeletedCard } from '@/lib/change-log/deleted-view'
import { buildProposedCards } from '@/lib/change-log/proposed-view'
import { ChangeLogAnswerActions } from '@/components/molecules/ChangeLogAnswerActions'
import { ChangeRows } from '@/components/molecules/diff-card-parts'
import { existingPageIds, restorePage } from '@/lib/change-log/trash'
import { personFacingMessage } from '@/lib/change-log/errors'
import { PondControl } from '@/components/atoms/PondControl'
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

/** The deleted view's own cards, pond-scoped, under the shared change-log root. */
function changeLogDeletedKey(pondId: string | null) {
  return [...changeLogKey(), pondId, 'deleted'] as const
}

/** The proposed view's own records (KAN-96, s6o2), pond-scoped, under the
 *  shared change-log root. */
export function changeLogProposedKey(pondId: string | null) {
  return [...changeLogKey(), pondId, 'proposed'] as const
}

/** s6o1's content column (840px, left of the 1180px frame after the rail). */
const CHANGE_LOG_COLUMN_PX = 840

/** s6o6's content column is 700px wide — but `useSurfaceColumn`'s `maxWidth`
 *  bounds the border-box column, which eats `PAGE_COLUMN_PAD_PX` on each side,
 *  so the content box itself would land at 636px without adding it back. */
const DELETED_VIEW_COLUMN_PX = 700 + 2 * PAGE_COLUMN_PAD_PX

/** s6o2's content column is 640px wide (same `maxWidth` reasoning as
 *  `DELETED_VIEW_COLUMN_PX` above). */
const PROPOSED_VIEW_COLUMN_PX = 640 + 2 * PAGE_COLUMN_PAD_PX

/**
 * s6o1's view bar. "all", "proposed" (KAN-96, s6o2) and "deleted" (KAN-97,
 * s6o6) are built; the rest are drawn per the board but stay inert
 * (PROJECT_RULES "nothing locked in": visible-but-inert over hidden, since no
 * view beyond those three exists yet).
 */
const INERT_VIEWS = ['by page', 'memory'] as const

type ChangeLogView = 'all' | 'proposed' | 'deleted'

/** s6o2's own chip: "status is proposed" · "newest first" — an inset hairline
 *  pill, ink .8, no fill (distinct from the filled `chipBaseClass` family). */
const PROPOSED_CHIP_CLASS =
  'rounded-full px-2 py-0.5 font-mono text-[10.5px] text-mn-text-meta ring-1 ring-inset ring-mn-text/20'

/** `restore_page` (0027) falls back to the pond root when the original parent
 *  is itself trashed or gone — PATH_STEPS 6's "say so". */
const PARENT_FALLBACK_LINE = 'put back at the top of the pond — its old place is gone'

/** s6o6's row label/value pair: `130px minmax(0,1fr)`, the label at ink .68
 *  uppercase, the value at 13.5px. */
function DeletedRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[130px_minmax(0,1fr)] items-center gap-x-3">
      <span className="text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase">
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[13.5px]">{children}</span>
    </div>
  )
}

/**
 * One s6o6 card: title / actor-time, then "was in" / "held" / "in trash" rows,
 * then restore (while still trashed) or the emptied note. `held` is the one
 * row an emptied card drops — the board's own two-card contrast (frame 6):
 * what a trashed page held only means something while the content it counts
 * is still there to come back to.
 */
function DeletedRecordCard({
  card,
  busy,
  highlightDated,
  onRestore,
}: {
  card: DeletedCard
  busy: boolean
  /** Only the soonest `restorable until` on the screen gets the burnt-orange
   *  signal colour (AUDIT.md "one dated thing per screen") — every other
   *  in-trash card's date renders in ink at the same weight. */
  highlightDated: boolean
  onRestore: () => void
}) {
  return (
    <div className="flex flex-col gap-[10px] rounded-mn-card bg-mn-card px-[18px] py-4 shadow-mn-card">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-medium text-mn-text">deleted page {card.title}</span>
        <span className="font-mono text-[10.5px] text-mn-text-secondary">{card.actorTime}</span>
      </div>
      <div className="flex flex-col">
        <DeletedRow label="was in">{card.wasIn}</DeletedRow>
        {card.status.kind !== 'emptied' && <DeletedRow label="held">{card.held}</DeletedRow>}
        <DeletedRow label={card.status.kind === 'restored' ? 'restored' : 'in trash'}>
          {card.status.kind === 'in_trash' && (
            <span
              className={`font-medium ${highlightDated ? 'text-mn-signal-dated' : 'text-mn-text'}`}
            >
              restorable until {card.status.restorableUntil}
            </span>
          )}
          {card.status.kind === 'emptied' && <span>emptied {card.status.emptiedOn}</span>}
          {card.status.kind === 'restored' && card.status.parentFallback && (
            <span>{PARENT_FALLBACK_LINE}</span>
          )}
        </DeletedRow>
      </div>
      {card.status.kind === 'emptied' && (
        <span className="rounded-[10px] bg-mn-text/[0.04] px-[10px] py-2 font-mono text-[10.5px] text-mn-text-meta">
          the page’s content left with the trash. this record keeps its name and when it went.
        </span>
      )}
      {card.restoreOffered && (
        <div className="flex gap-2">
          <PondControl kind="button" variant="secondary" disabled={busy} onClick={onRestore}>
            {busy ? 'restoring…' : 'restore'}
          </PondControl>
          {/* No trash view to open yet (KAN-311's neighbour) — drawn per the
           *  board, inert rather than hidden (PROJECT_RULES "nothing locked in"). */}
          <PondControl kind="button" variant="ghost" label="open in trash" disabled />
        </div>
      )}
    </div>
  )
}

export function ChangeLogPage() {
  const getSupabase = useLazySupabase()
  const router = useRouter()
  const pondId = usePondId()
  const pondName = usePondName()
  const queryClient = useQueryClient()
  const [view, setView] = useState<ChangeLogView>('all')
  const { column } = useSurfaceColumn(
    view === 'deleted'
      ? DELETED_VIEW_COLUMN_PX
      : view === 'proposed'
        ? PROPOSED_VIEW_COLUMN_PX
        : CHANGE_LOG_COLUMN_PX
  )
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)

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
      lastPage.length < RECORDS_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].createdAt,
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

  // s6o2: every record still waiting on a decision (`proposed` or
  // `outdated`), newest first — refetched on each switch, same reasoning as
  // the deleted view's own `staleTime: 0` above.
  const { data: proposedRecords = [], isLoading: proposedLoading } = useQuery({
    queryKey: changeLogProposedKey(pondId),
    enabled: view === 'proposed',
    staleTime: 0,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      return listRecords(supabase, { userId: user.id, pondId, status: [...WAITING_STATUSES] })
    },
  })
  const proposedCards = useMemo(
    () => buildProposedCards(proposedRecords, pageTitleById),
    [proposedRecords, pageTitleById]
  )

  const [answerError, setAnswerError] = useState<string | null>(null)

  // s6o6: every delete/restore record, pond-wide — not the "all" view's paged
  // slice, since a trashing from months back must still show up here. Read
  // only while the view is open; switching back to "all" leaves it cached.
  const { data: deletedCards = [], isLoading: deletedLoading } = useQuery({
    queryKey: changeLogDeletedKey(pondId),
    enabled: view === 'deleted',
    // The client's own default staleTime (30s) would otherwise let the pill
    // click re-enable this query against data still "fresh" from the last
    // time it was open, so a page trashed in between wouldn't show until a
    // reload. Always-stale means every switch to `deleted` refetches.
    staleTime: 0,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []
      const trashRecords = await listRecords(supabase, {
        userId: user.id,
        pondId,
        action: ['delete', 'restore'],
      })
      const rootIds = [
        ...new Set(
          trashRecords
            .filter((r) => r.action === 'delete')
            .map((r) => r.targetPageId)
            .filter((id): id is string => id !== null)
        ),
      ]
      const existing = await existingPageIds(supabase, rootIds)
      const goneIds = new Set(rootIds.filter((id) => !existing.has(id)))
      return buildDeletedCards(trashRecords, new Date(), goneIds, pondName)
    },
  })

  // The screen's one burnt-orange date: the soonest `restorable until` among
  // the cards still in trash. `restorableUntil` is `createdAt + 30 days`, so
  // the earliest `createdAt` among `in_trash` cards is the soonest — no
  // string-to-date parsing of the already-formatted label needed.
  const soonestDatedRecordId = useMemo(() => {
    let soonestId: string | null = null
    let soonestCreatedAt = Infinity
    for (const card of deletedCards) {
      if (card.status.kind !== 'in_trash') continue
      const createdAt = Date.parse(card.record.createdAt)
      if (createdAt < soonestCreatedAt) {
        soonestCreatedAt = createdAt
        soonestId = card.record.id
      }
    }
    return soonestId
  }, [deletedCards])

  const restoreMutation = useMutation({
    mutationFn: (recordId: string) => restorePage(getSupabase(), recordId),
    onMutate: () => {
      setRestoreError(null)
      setRestoreNotice(null)
    },
    onError: (err) => setRestoreError(personFacingMessage(err)),
    onSuccess: async (_data, recordId) => {
      // Puts the page back in the rail/⌘K/pickers and refreshes every
      // change-log view (the deleted card itself, and the new `restore` row
      // in "all") in one go.
      queryClient.invalidateQueries({ queryKey: pagesKey(pondId) })
      await queryClient.invalidateQueries({ queryKey: changeLogKey() })
      // The deleted view's own refetch now carries the `restore` record this
      // call just wrote — read its `parentFallback` back off it (rather than
      // the void RPC result) to say so, same as the card itself does.
      const refreshed = queryClient.getQueryData<DeletedCard[]>(changeLogDeletedKey(pondId))
      const restored = refreshed?.find((card) => card.record.id === recordId)
      if (restored?.status.kind === 'restored' && restored.status.parentFallback) {
        setRestoreNotice(PARENT_FALLBACK_LINE)
      }
    },
  })

  return (
    <div className="h-full overflow-y-auto">
      <div
        {...column}
        data-testid="change-log-column"
        className={`${column.className} flex flex-col gap-4`}
      >
        <span className="font-serif text-[50px] leading-none font-extralight tracking-[-0.01em] text-mn-text">
          change log
        </span>
        {view === 'all' && (
          <>
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
          </>
        )}
        <div className="flex items-center gap-1 text-[12.5px]">
          <button
            type="button"
            aria-pressed={view === 'all'}
            onClick={() => setView('all')}
            className={
              view === 'all'
                ? 'rounded-full bg-mn-hover-fill px-[11px] py-[5px] font-medium text-mn-text'
                : 'rounded-full px-[11px] py-[5px] text-mn-text-secondary'
            }
          >
            all
          </button>
          <button
            type="button"
            aria-pressed={view === 'proposed'}
            onClick={() => setView('proposed')}
            className={
              view === 'proposed'
                ? 'rounded-full bg-mn-hover-fill px-[11px] py-[5px] font-medium text-mn-text'
                : 'rounded-full px-[11px] py-[5px] text-mn-text-secondary'
            }
          >
            proposed
          </button>
          {INERT_VIEWS.map((inertView) => (
            <span
              key={inertView}
              aria-disabled="true"
              className="rounded-full px-[11px] py-[5px] text-mn-text-secondary"
            >
              {inertView}
            </span>
          ))}
          <button
            type="button"
            aria-pressed={view === 'deleted'}
            onClick={() => setView('deleted')}
            className={
              view === 'deleted'
                ? 'rounded-full bg-mn-hover-fill px-[11px] py-[5px] font-medium text-mn-text'
                : 'rounded-full px-[11px] py-[5px] text-mn-text-secondary'
            }
          >
            deleted
          </button>
          <span
            aria-disabled="true"
            className="px-[9px] py-[5px] font-mono text-[11px] lowercase tracking-[0.02em] text-mn-text-secondary"
          >
            ＋ view
          </span>
        </div>
        {view === 'all' ? (
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
                      <button
                        key={row.record.id}
                        type="button"
                        onClick={() => router.push(changeLogRecordUrl(row.record.id))}
                        className={`grid ${TABLE_COLUMNS} min-h-[38px] w-full items-center gap-x-[14px] border-b border-mn-hair px-[10px] text-left text-[13.5px]`}
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
                      </button>
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
        ) : view === 'proposed' ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <span className={PROPOSED_CHIP_CLASS}>status is proposed</span>
              <span className={PROPOSED_CHIP_CLASS}>newest first</span>
            </div>
            {answerError && (
              <p role="alert" className="font-mono text-[12.5px] text-mn-text-secondary">
                {answerError}
              </p>
            )}
            {proposedLoading ? null : proposedCards.length === 0 ? (
              <p
                data-testid="change-log-proposed-empty"
                className="font-mono text-[12.5px] text-mn-text-secondary"
              >
                nothing waiting
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {proposedCards.map((card) => {
                  return (
                    <div
                      key={card.record.id}
                      data-testid={`change-log-proposed-card-${card.record.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(changeLogRecordUrl(card.record.id))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        router.push(changeLogRecordUrl(card.record.id))
                      }}
                      className="flex cursor-pointer flex-col gap-[10px] rounded-mn-card bg-mn-card px-4 py-3.5 font-mono shadow-mn-card"
                    >
                      <div className="flex items-baseline gap-[8px]">
                        <span className="text-[11px] text-mn-text">{card.pageName}</span>
                        {card.statusPill !== null && (
                          <span
                            data-testid={`change-log-proposed-pill-${card.record.id}`}
                            className="rounded-full px-[7px] py-[1px] text-[11px] text-mn-text ring-1 ring-mn-mark-faint ring-inset"
                          >
                            {card.statusPill}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-mn-text-secondary">
                          {card.actorTime}
                        </span>
                      </div>
                      {card.diffRows.length > 0 && (
                        <div className="flex flex-col gap-[3px]">
                          {card.diffRows.map((row) => (
                            <ChangeRows key={row.before?.id ?? row.after?.id} change={row} />
                          ))}
                        </div>
                      )}
                      {card.reasonLine !== null && (
                        <span
                          data-testid={`change-log-proposed-reason-${card.record.id}`}
                          className="rounded-[10px] bg-mn-text/[0.04] px-[10px] py-2 font-mono text-[10.5px] text-mn-text-meta"
                        >
                          {card.reasonLine}
                        </span>
                      )}
                      {/* The card's own click/Enter/Space opens the record; answering it
                        (including typing a space into the note box) must not. */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <ChangeLogAnswerActions
                          record={card.record}
                          pondId={pondId}
                          onError={setAnswerError}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <>
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
            {deletedLoading ? null : deletedCards.length === 0 ? (
              <p
                data-testid="change-log-deleted-empty"
                className="font-mono text-[12.5px] text-mn-text-secondary"
              >
                nothing in the trash
              </p>
            ) : (
              deletedCards.map((card) => (
                <DeletedRecordCard
                  key={card.record.id}
                  card={card}
                  busy={restoreMutation.isPending && restoreMutation.variables === card.record.id}
                  highlightDated={card.record.id === soonestDatedRecordId}
                  onRestore={() => restoreMutation.mutate(card.record.id)}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
