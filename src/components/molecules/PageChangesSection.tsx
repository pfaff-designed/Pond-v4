'use client'

/**
 * "Changes to this page" (issue #103, storyboard frame 8) — the log filtered to
 * the open page, newest first, with the affordances a revert needs.
 *
 * Purely presentational: the rows are derived by `buildPageChanges` and the
 * intents are raised to the connected `PageChangesPanel`. Press aesthetics —
 * kicker header, mono meta, hairline rows — matching `BacklinksSection`.
 *
 * Records are READ-ONLY ("the log only grows"), so nothing here edits one. The
 * only controls are the three the design puts on a record: revert on an accepted
 * change, and accept / reject on a proposed one.
 *
 * What this is NOT: the pond-wide `databases › change log` with its saved views,
 * its "N proposed, waiting on you" figure and its record page showing before/after
 * and the source thread. That is #147. This panel is a view of the same log, not a
 * second history.
 */

import { Button } from '@/components/ui/button'
import { kickerClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'
import type { PageChangeRow } from '@/lib/change-log/page-changes'
import type { ChangeLogStatus } from '@/lib/change-log/types'

export interface PageChangesSectionProps {
  rows: PageChangeRow[]
  loading?: boolean
  /** Raise a revert of an accepted change. */
  onRevert: (recordId: string) => void
  /** Answer a proposed revert. */
  onAccept: (recordId: string) => void
  onReject: (recordId: string) => void
  /** The record a write is in flight for — its controls go quiet. */
  busyId?: string | null
  /** Shown once, above the rows, when something failed. */
  error?: string | null
  className?: string
}

/** Statuses the design draws as an outlined pill rather than quiet mono text. */
const PILLED: readonly ChangeLogStatus[] = ['proposed', 'outdated']

function statusLabel(status: ChangeLogStatus): string {
  return status === 'changes_requested' ? 'changes requested' : status
}

function Status({ status }: { status: ChangeLogStatus }) {
  if (PILLED.includes(status)) {
    return (
      <span className="rounded-mn-pill border border-mn-line px-2 py-0.5 font-mono text-[0.65rem]">
        {statusLabel(status)}
      </span>
    )
  }
  return <span className="font-mono text-[0.65rem] text-mn-text-meta">{statusLabel(status)}</span>
}

/**
 * `2026-09-30T09:31:00Z` → `09:31`, in the reader's own timezone.
 *
 * `hourCycle: 'h23'` because the design's rows read `09:31` and `18:40`, and
 * because a locale-default 12-hour clock renders `02:32 PM` — which overflowed
 * the column when this was first run against the real log.
 */
function timeOf(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

export function PageChangesSection({
  rows,
  loading = false,
  onRevert,
  onAccept,
  onReject,
  busyId = null,
  error = null,
  className,
}: PageChangesSectionProps) {
  return (
    <section aria-label="Changes to this page" className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className={cn(kickerClass, 'text-mn-text-secondary')}>Changes to this page</h2>
        <span className="font-mono text-[0.65rem] text-mn-text-faint">⌥⌘H</span>
      </div>

      {error && (
        <p role="alert" className="mb-2 font-mono text-xs text-mn-text-secondary">
          {error}
        </p>
      )}

      {loading && rows.length === 0 && (
        <p className="font-mono text-xs text-mn-text-faint">loading…</p>
      )}

      {!loading && rows.length === 0 && (
        // Most pages have never been changed by Pond. Say so plainly rather than
        // showing an empty frame that looks broken.
        <p className="font-mono text-xs text-mn-text-faint">nothing logged for this page yet</p>
      )}

      <ul className="divide-y divide-mn-hair">
        {rows.map(({ record, label, revertable, revertBlockedBy }) => {
          const busy = busyId === record.id
          const answerable = record.action === 'revert' && record.status === 'proposed'
          return (
            <li key={record.id} className="flex items-center gap-3 py-2">
              <span className="w-10 shrink-0 font-mono text-[0.65rem] text-mn-text-faint">
                {timeOf(record.createdAt)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
              <span className="shrink-0 font-mono text-[0.65rem] text-mn-text-faint">
                {record.actor}
              </span>
              <Status status={record.status} />

              {answerable && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="default"
                    disabled={busy}
                    onClick={() => onAccept(record.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onReject(record.id)}
                  >
                    Reject
                  </Button>
                </span>
              )}

              {revertable && (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onRevert(record.id)}
                  className="shrink-0"
                >
                  Revert
                </Button>
              )}

              {revertBlockedBy === 'waiting' && (
                // The revert exists already and is sitting in this same list —
                // saying so beats a button that would refuse.
                <span className="shrink-0 font-mono text-[0.65rem] text-mn-text-faint">
                  revert waiting
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
