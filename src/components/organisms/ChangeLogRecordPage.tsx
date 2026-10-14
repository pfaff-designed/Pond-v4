'use client'

/**
 * The change log record page (KAN-152; board `Pond 06.15 Change log`, frame
 * `s6o3`): "A record opens like a page" — title, fields grid (status,
 * proposed by, page › block, from thread, read, reverted by), the
 * before→after card, the "this change" lineage column and the action
 * buttons. A loading placeholder and the not-found state cover a record
 * missing or hidden by RLS (AUDIT G6).
 */

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { usePondId } from '@/lib/pond/context'
import { workspaceUrl } from '@/lib/pages/nav'
import { PAGE_COLUMN_PAD_PX, useSurfaceColumn } from '@/lib/layout/surface-column'
import { getRecord, listRevertsOf, listRevisionsOf } from '@/lib/change-log/store'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { getPage } from '@/lib/pages/client'
import { getThreadFirstQuestion } from '@/lib/conversation/client'
import { describeChange } from '@/lib/change-log/page-changes'
import { chainKey, changeLogKey, recordKey, threadFirstQuestionKey } from '@/lib/change-log/keys'
import { proposeRevert } from '@/lib/change-log/revert'
import { raiseRecordCard } from '@/lib/terminal-focus'
import { canRevertRecord } from '@/lib/change-log/revert-plan'
import { WAITING_STATUSES } from '@/lib/change-log/status'
import { personFacingMessage } from '@/lib/change-log/errors'
import { ChangeRows } from '@/components/molecules/diff-card-parts'
import { ChangeLogAnswerActions } from '@/components/molecules/ChangeLogAnswerActions'
import { PondControl } from '@/components/atoms/PondControl'
import { machineEyebrowClass } from '@/components/atoms/kicker'
import {
  buildChangeTimeline,
  changeLogRecordUrl,
  pageBlockField,
  proposedByField,
  readChipsOf,
  recordDiffRows,
  recordTitle,
  revertedByField,
  statusField,
} from '@/lib/change-log/record-page'

/**
 * Finds a revision chain's root by walking `links.revisedFrom` backward one
 * `getRecord` at a time. Stops at the first record with no `revisedFrom` (or
 * whose linked record is gone) — that is the root `listRevisionsOf` then
 * walks forward from, so the chain's middle is never fetched twice.
 */
async function findRevisionRoot(
  supabase: ReturnType<ReturnType<typeof useLazySupabase>>,
  record: ChangeLogRecord
): Promise<ChangeLogRecord> {
  let root = record
  while (root.links.revisedFrom) {
    const prev = await getRecord(supabase, root.links.revisedFrom)
    if (!prev) break
    root = prev
  }
  return root
}

/** s6o3's content column is 700px wide — the same `maxWidth` reasoning as
 *  every other change-log surface's own column constant (`ChangeLogPage`'s
 *  `DELETED_VIEW_COLUMN_PX`/`PROPOSED_VIEW_COLUMN_PX`). */
const RECORD_COLUMN_PX = 700 + 2 * PAGE_COLUMN_PAD_PX

/** s6o3's "this change" column rows — 40px/1fr grid, 10px gap, 7px/8px
 *  padding, 8px radius; the viewed record's own rows get the standard ink
 *  wash fill (the same token every other "currently selected" row in the
 *  product uses, not a one-off colour). */
const TIMELINE_ROW_CLASS = 'grid grid-cols-[40px_minmax(0,1fr)] gap-2.5 rounded-lg px-2 py-[7px]'

/** The fields grid's label/value row — 130px/1fr, 12px gap, 32px min-height;
 *  label 10.5px/.68/uppercase, value 13.5px (s6o3). */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[130px_minmax(0,1fr)] items-center gap-x-3">
      <span className="text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase">
        {label}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[13.5px]">{children}</span>
    </div>
  )
}

/** The read/from-thread chip's shared chrome — inset ring ink .2, mono
 *  10.5px, ink .8 (s6o3's "from thread" and "read" rows share one style). */
const RECORD_CHIP_CLASS =
  'rounded-full px-2 py-0.5 font-mono text-[10.5px] whitespace-nowrap text-mn-text-meta ring-1 ring-inset ring-mn-text/20'

export function ChangeLogRecordPage({ recordId }: { recordId: string }) {
  const getSupabase = useLazySupabase()
  const { column } = useSurfaceColumn(RECORD_COLUMN_PX)
  const router = useRouter()
  const pondId = usePondId()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  // G9: a ref, not state — the second of two rapid clicks can land before a
  // state update guarding on a render would have committed (mirrors
  // `ChangeLogAnswerActions`'s own `busyRef`).
  const revertingRef = useRef(false)

  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: recordKey(recordId),
    queryFn: () => getRecord(getSupabase(), recordId),
  })

  const targetPageId = record?.targetPageId ?? null
  const { data: targetPage } = useQuery({
    // The same `['page', id]` key `ChangeLogAnswerActions` invalidates after
    // an answer, so an accept/reject/revert on this very record refreshes it.
    queryKey: ['page', targetPageId],
    enabled: targetPageId !== null,
    queryFn: () => getPage(getSupabase(), targetPageId as string),
  })

  const threadId = record?.sourceThreadId ?? null
  const { data: firstQuestion } = useQuery({
    queryKey: threadFirstQuestionKey(threadId ?? 'none'),
    enabled: threadId !== null,
    queryFn: () => getThreadFirstQuestion(getSupabase(), threadId as string),
  })

  // "This change" column: the FULL revision lineage, root first — found by
  // walking `links.revisedFrom` backward to the root, then `listRevisionsOf`
  // forward from there (so the middle of the chain is fetched once, not once
  // per direction).
  const { data: chain = [] } = useQuery({
    queryKey: chainKey(recordId),
    enabled: record !== null && record !== undefined,
    queryFn: async () => {
      if (!record) return []
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return [record]
      const root = await findRevisionRoot(supabase, record)
      const forward = await listRevisionsOf(supabase, { userId: user.id, pondId, recordId: root.id })
      return [root, ...forward]
    },
  })

  // The "reverted by" field (fields grid) needs every chain record's own
  // reverts, not just the viewed one's — a revert can target any record in
  // the lineage.
  const { data: revertsByRecordId } = useQuery({
    queryKey: [...chainKey(recordId), 'reverts', chain.map((r) => r.id)] as const,
    enabled: chain.length > 0,
    queryFn: async () => {
      const supabase = getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return new Map<string, ChangeLogRecord[]>()
      const entries = await Promise.all(
        chain.map(
          async (r) =>
            [r.id, await listRevertsOf(supabase, { userId: user.id, pondId, recordId: r.id })] as const
        )
      )
      return new Map(entries)
    },
  })

  const timeline = record ? buildChangeTimeline(chain, record.id) : []
  const revertedBy = revertedByField(revertsByRecordId?.get(recordId) ?? [])

  const handleOpenPage = useCallback(() => {
    if (!targetPage) return
    router.push(workspaceUrl({ id: targetPage.id, type: targetPage.type, title: targetPage.title }))
  }, [router, targetPage])

  // Raises ONE new `proposed` revert record (`proposeRevert`), re-reading the
  // target page fresh rather than trusting a stale copy — the same reason
  // `PageChangesPanel`'s own revert re-reads before planning. Stays on this
  // record; refetching it is what surfaces "reverted by" once the revert
  // lands (the chain/reverts queries key off this record's own query).
  const handleRevert = useCallback(() => {
    if (revertingRef.current) return
    if (record === null || record === undefined || record.targetPageId === null) return
    revertingRef.current = true
    const toRevert = record
    void (async () => {
      try {
        const supabase = getSupabase()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const page = await getPage(supabase, toRevert.targetPageId as string)
        if (!page) return
        const revert = await proposeRevert(supabase, {
          userId: user.id,
          pondId,
          record: toRevert,
          current: page.blocks,
        })
        setActionError(null)
        // s6o4 f4: the revert record raises its own card in the composer,
        // accept/reject alongside this page's own "reverted by" link.
        raiseRecordCard(revert.id)
        await queryClient.invalidateQueries({ queryKey: recordKey(recordId) })
        // A revert's a NEW record (`links.revertOf`), not a change to this
        // one's own revision chain — `listRevertsOf` must be re-asked, since
        // nothing about `chain`'s own query key changed.
        await queryClient.invalidateQueries({ queryKey: [...chainKey(recordId), 'reverts'] })
        // The new revert record is also a row in every OTHER change-log
        // view (the "all" table, the waiting count, a page's changes panel)
        // — none of which key off this record's id, so the shared root
        // needs its own invalidation here too.
        await queryClient.invalidateQueries({ queryKey: changeLogKey() })
      } catch (err) {
        setActionError(personFacingMessage(err))
      } finally {
        revertingRef.current = false
      }
    })()
  }, [record, recordId, getSupabase, pondId, queryClient])

  if (recordLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div {...column} className={`${column.className} flex flex-col gap-4`}>
          <p
            data-testid="change-log-record-loading"
            className="font-mono text-[12.5px] text-mn-text-secondary"
          >
            loading…
          </p>
        </div>
      </div>
    )
  }

  if (record === null || record === undefined) {
    return (
      <div className="h-full overflow-y-auto">
        <div {...column} className={`${column.className} flex flex-col gap-4`}>
          <span className="font-serif text-[38px] leading-none font-extralight tracking-[-0.01em] text-mn-text">
            this record isn’t here
          </span>
          <p
            data-testid="change-log-record-not-found"
            className="font-mono text-[12.5px] text-mn-text-secondary"
          >
            it may not exist, or isn’t shared with you
          </p>
        </div>
      </div>
    )
  }

  const pageTitleById = new Map(targetPage ? [[targetPage.id, targetPage.title] as const] : [])
  const { page, block } = pageBlockField(record, pageTitleById, targetPage?.blocks ?? [])
  const readChips = readChipsOf(record)
  const diffRows = recordDiffRows(record)

  return (
    <div className="h-full overflow-y-auto">
      <div
        {...column}
        data-testid="change-log-record-column"
        className={`${column.className} flex flex-col gap-4`}
      >
        <span
          data-testid="change-log-record-title"
          className="font-serif text-[38px] leading-none font-extralight tracking-[-0.01em] text-mn-text"
        >
          {recordTitle(record, targetPage?.blocks)}
        </span>
        <div className="grid grid-cols-[minmax(0,1fr)_250px] items-start gap-7">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <Field label="status">{statusField(record)}</Field>
              <Field label="proposed by">{proposedByField(record)}</Field>
              <Field label="page">
                <span className="underline decoration-mn-mark-faint underline-offset-[3px]">
                  {page}
                </span>
                {block !== null && (
                  <span className="font-mono text-[10.5px] text-mn-text-secondary">
                    › {block}
                  </span>
                )}
              </Field>
              {firstQuestion !== null && firstQuestion !== undefined && (
                <Field label="from thread">
                  <span className={RECORD_CHIP_CLASS}>{firstQuestion}</span>
                </Field>
              )}
              {readChips.length > 0 && (
                <Field label="read">
                  {readChips.map((chip, index) => (
                    <span key={index} className={RECORD_CHIP_CLASS}>
                      {chip}
                    </span>
                  ))}
                </Field>
              )}
              {revertedBy !== null && (
                <Field label="reverted by">
                  <button
                    type="button"
                    onClick={() => router.push(changeLogRecordUrl(revertedBy.recordId))}
                    className="underline decoration-mn-mark-faint underline-offset-[3px]"
                  >
                    {revertedBy.clockLabel}
                  </button>
                  <span className="rounded-full px-2 py-0.5 font-mono text-[10.5px] text-mn-text ring-1 ring-inset ring-mn-mark-faint">
                    {revertedBy.statusPillText}
                  </span>
                </Field>
              )}
            </div>
            <div
              data-testid="change-log-record-diff-card"
              className="flex flex-col gap-[3px] rounded-mn-card bg-mn-card px-[10px] py-3 shadow-mn-card"
            >
              <span className={`${machineEyebrowClass} px-[10px] pb-1`}>before → after</span>
              {diffRows !== null ? (
                diffRows.map((row) => (
                  <ChangeRows key={row.before?.id ?? row.after?.id} change={row} />
                ))
              ) : (
                <p className="font-mono text-[12px] text-mn-text">{describeChange(record, null)}</p>
              )}
            </div>
            {WAITING_STATUSES.includes(record.status) ? (
              <ChangeLogAnswerActions record={record} pondId={pondId} onError={setActionError} />
            ) : (
              <div className="flex items-center gap-2">
                <PondControl
                  kind="button"
                  variant="secondary"
                  disabled={!targetPage}
                  onClick={handleOpenPage}
                >
                  open page
                </PondControl>
                {canRevertRecord(record) && (
                  <PondControl kind="button" variant="ghost" onClick={handleRevert}>
                    revert
                  </PondControl>
                )}
              </div>
            )}
            {actionError && (
              <p role="alert" className="font-mono text-[12.5px] text-mn-text-secondary">
                {actionError}
              </p>
            )}
          </div>
          <div data-testid="change-log-record-timeline" className="flex flex-col gap-2">
            <span className="text-[10.5px] font-medium tracking-[.1em] text-mn-text-secondary uppercase">
              this change
            </span>
            {timeline.map((row, index) => (
              <div
                key={index}
                data-testid="change-log-record-timeline-row"
                className={`${TIMELINE_ROW_CLASS} ${row.highlighted ? 'bg-mn-hover-fill' : ''}`}
              >
                <span className="font-mono text-[10.5px] text-mn-text-secondary">{row.time}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-mn-text">{row.event}</span>
                  <span className="font-mono text-[10.5px] text-mn-text-secondary">
                    {row.detail}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
