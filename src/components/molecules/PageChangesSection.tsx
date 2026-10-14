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
import { ProposalActions } from '@/components/molecules/ProposalActions'
import { kickerClass } from '@/components/atoms/kicker'
import { cn } from '@/lib/utils'
import type { PageChangeRow } from '@/lib/change-log/page-changes'
import { labelForStatus } from '@/lib/change-log/status'
import type { ChangeLogStatus } from '@/lib/change-log/types'

export interface PageChangesSectionProps {
  rows: PageChangeRow[]
  loading?: boolean
  /** Raise a revert of an accepted change. */
  onRevert: (recordId: string) => void
  /** Answer a proposed revert. */
  onAccept: (recordId: string) => void
  onReject: (recordId: string) => void
  /** Open the record's own page (KAN-152). */
  onOpenRecord: (recordId: string) => void
  /** The record a write is in flight for — its controls go quiet. */
  busyId?: string | null
  /** Shown once, above the rows, when something failed. */
  error?: string | null
  className?: string
}

/** Statuses the design draws as an outlined pill rather than quiet mono text. */
const PILLED: readonly ChangeLogStatus[] = ['proposed', 'outdated']

function Status({ status }: { status: ChangeLogStatus }) {
  if (PILLED.includes(status)) {
    return (
      <span className="rounded-mn-pill border border-mn-line px-2 py-0.5 font-mono text-[0.65rem]">
        {labelForStatus(status)}
      </span>
    )
  }
  return (
    <span className="font-mono text-[0.65rem] text-mn-text-meta">{labelForStatus(status)}</span>
  )
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
  onOpenRecord,
  busyId = null,
  error = null,
  className,
}: PageChangesSectionProps) {
  return (
    <section aria-label="Changes to this page" className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className={cn(kickerClass, 'text-mn-text-secondary')}>Changes to this page</h2>
        <span className="font-mono text-[0.65rem] text-mn-text-secondary">⌥⌘H</span>
      </div>

      {error && (
        <p role="alert" className="mb-2 font-mono text-xs text-mn-text-secondary">
          {error}
        </p>
      )}

      {loading && rows.length === 0 && (
        <p className="font-mono text-xs text-mn-text-secondary">loading…</p>
      )}

      {!loading && rows.length === 0 && (
        // Most pages have never been changed by Pond. Say so plainly rather than
        // showing an empty frame that looks broken.
        <p className="font-mono text-xs text-mn-text-secondary">nothing logged for this page yet</p>
      )}

      <ul className="divide-y divide-mn-hair">
        {rows.map(({ record, label, revertable, revertBlockedBy }) => {
          const busy = busyId === record.id
          const answerable = record.action === 'revert' && record.status === 'proposed'
          const outdated = record.action === 'revert' && record.status === 'outdated'
          return (
            <li key={record.id} className="flex flex-wrap items-center gap-3 py-2">
              {/* The row's own identity (not its controls) opens the record — a
                sibling, not a wrapper, so revert/accept/reject stay their own
                click/keyboard targets rather than needing to stop propagation. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenRecord(record.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  onOpenRecord(record.id)
                }}
                className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-3"
              >
                <span className="w-10 shrink-0 font-mono text-[0.65rem] text-mn-text-secondary">
                  {timeOf(record.createdAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                <span className="shrink-0 font-mono text-[0.65rem] text-mn-text-secondary">
                  {record.actor}
                </span>
                <Status status={record.status} />
              </div>

              {answerable && (
                // The same control row every other proposal uses. It was extracted
                // from ModuleDiffCard precisely so a second accept/reject pair
                // could not diverge from the first; `divider={false}` because this
                // row supplies its own chrome.
                <ProposalActions
                  status="pending"
                  divider={false}
                  disabled={busy}
                  className="shrink-0"
                  onAccept={() => onAccept(record.id)}
                  onReject={() => onReject(record.id)}
                />
              )}

              {outdated && (
                // Criterion 5 withdraws accept from an outdated diff and offers
                // revise. There is no revise verb on this surface yet, so say what
                // the person can actually do: the change it reverts offers Revert
                // again, and that re-plans against the page as it now stands.
                <span className="w-full font-mono text-[0.65rem] text-mn-text-secondary">
                  out of date — revert it again
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
                <span className="shrink-0 font-mono text-[0.65rem] text-mn-text-secondary">
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
