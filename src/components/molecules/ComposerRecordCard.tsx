'use client'

/**
 * The composer's own raised record card (KAN-152; board `Pond 06.15 Change
 * log.dc.html` s6o4's f4): "proposed edit — {page}" · "revert of HH:MM"
 * (the ORIGINAL record's time, via `describeChange`'s own revert label),
 * the before→after diff, accept/reject through the shared
 * `ChangeLogAnswerActions` — a revert's accept already routes through
 * `acceptRecordFromLog` to `revert.ts`'s `acceptRevert`.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLazySupabase } from '@/lib/supabase/use-lazy-client'
import { getRecord } from '@/lib/change-log/store'
import { getPage } from '@/lib/pages/client'
import { pageLabel } from '@/lib/change-log/log-page'
import { describeChange } from '@/lib/change-log/page-changes'
import { recordDiffRows } from '@/lib/change-log/record-page'
import { recordKey } from '@/lib/change-log/keys'
import { WAITING_STATUSES } from '@/lib/change-log/status'
import { ChangeRows } from '@/components/molecules/diff-card-parts'
import { ChangeLogAnswerActions } from '@/components/molecules/ChangeLogAnswerActions'

export function ComposerRecordCard({
  recordId,
  pondId,
  onSettled,
}: {
  recordId: string
  pondId: string | null
  onSettled: () => void
}) {
  const getSupabase = useLazySupabase()
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: record } = useQuery({
    queryKey: recordKey(recordId),
    queryFn: () => getRecord(getSupabase(), recordId),
  })

  const originalId = record?.links.revertOf ?? null
  const { data: original } = useQuery({
    queryKey: recordKey(originalId ?? 'none'),
    enabled: originalId !== null,
    queryFn: () => getRecord(getSupabase(), originalId as string),
  })

  const targetPageId = record?.targetPageId ?? null
  const { data: page } = useQuery({
    queryKey: ['page', targetPageId],
    enabled: targetPageId !== null,
    queryFn: () => getPage(getSupabase(), targetPageId as string),
  })

  // The card leaves once its own record is answered — accepted/rejected, or
  // (a page moved on underneath it) outdated-without-a-revise-path here.
  useEffect(() => {
    if (record && !WAITING_STATUSES.includes(record.status)) onSettled()
  }, [record, onSettled])

  if (!record) return null

  const diffRows = recordDiffRows(record)
  const pageTitle = pageLabel(record, new Map(page ? [[page.id, page.title]] : []))

  return (
    <div
      data-testid="composer-record-card"
      className="flex flex-col gap-3 rounded-mn-card bg-mn-card px-[10px] py-3 font-mono shadow-mn-card"
    >
      <div className="flex items-baseline gap-2 text-[11px] text-mn-text">
        <span>{`proposed edit — ${pageTitle}`}</span>
        <div className="flex-1" />
        <span className="text-mn-text-secondary">{describeChange(record, original ?? null)}</span>
      </div>
      <div className="flex flex-col gap-[3px]">
        {diffRows?.map((row) => (
          <ChangeRows key={row.before?.id ?? row.after?.id} change={row} />
        ))}
      </div>
      <ChangeLogAnswerActions record={record} pondId={pondId} onError={setActionError} />
      {actionError && (
        <p role="alert" className="text-[12.5px] text-mn-text-secondary">
          {actionError}
        </p>
      )}
    </div>
  )
}
