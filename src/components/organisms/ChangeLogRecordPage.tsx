'use client'

/**
 * The change log record page (KAN-152; board `Pond 06.15 Change log`, frame
 * `s6o3`): "A record opens like a page" — title, then the fields grid
 * (status, proposed by, page › block, from thread, read). The before→after
 * card, the "this change" column and the action buttons land in later passes
 * of this ticket; this skeleton only needs the record (and its target page,
 * for the block/title resolution) to render, a loading placeholder, and the
 * not-found state for a record missing or hidden by RLS (AUDIT G6).
 */

import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { PAGE_COLUMN_PAD_PX, useSurfaceColumn } from '@/lib/layout/surface-column'
import { getRecord } from '@/lib/change-log/store'
import { getPage } from '@/lib/pages/client'
import { getThreadFirstQuestion } from '@/lib/conversation/client'
import {
  pageBlockField,
  proposedByField,
  readChipsOf,
  recordTitle,
  statusField,
} from '@/lib/change-log/record-page'

/** s6o3's content column is 700px wide — the same `maxWidth` reasoning as
 *  every other change-log surface's own column constant (`ChangeLogPage`'s
 *  `DELETED_VIEW_COLUMN_PX`/`PROPOSED_VIEW_COLUMN_PX`). */
const RECORD_COLUMN_PX = 700 + 2 * PAGE_COLUMN_PAD_PX

function recordKey(recordId: string) {
  return ['change-log-record', recordId] as const
}

function threadFirstQuestionKey(threadId: string) {
  return ['change-log-record', 'thread-first-question', threadId] as const
}

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
          </div>
        </div>
      </div>
    </div>
  )
}
