'use client'

/**
 * The stack of diff cards for one `propose_changes` batch (t16 Phase 5).
 *
 * One AI message can propose several composition changes at once; this renders them
 * as a stack of {@link ModuleDiffCard}s plus a group-level "Accept all / Reject all"
 * bar. Partial accept is first-class — each card resolves on its own via the
 * per-index callbacks, and the group bar only acts on the changes still pending.
 *
 * Purely presentational: the terminal owns the decision state (the per-index
 * `statuses`) and the write path. The group bar appears only when there is more than
 * one change and at least one is still pending — for a single change the card's own
 * footer is enough.
 */

import { cn } from '@/lib/utils'
import { ModuleDiffCard } from './ModuleDiffCard'
import { ProposalActions, type ProposalStatus } from '@/components/atoms/ProposalActions'
import type { ChangePreview } from '@/lib/modules/preview'

interface ProposalGroupProps {
  /** One preview per change in the batch, in emission order. A preview's
   *  `inferred` flag (ticket-30) marks a model-inferred side-effect: its card is
   *  labelled distinctly and the group Accept action leaves it pending. */
  changes: ChangePreview[]
  /** Decision per change, index-aligned with `changes`. */
  statuses: ProposalStatus[]
  /** Name of the page this batch writes to on accept (the stamped proposal
   *  target), so an accept is auditable before it lands. */
  targetName?: string
  /** Ticket-30 review: the batch named a target page that does not exist
   *  (deleted or hallucinated id). A notice replaces the target label and
   *  accepting will skip — never fall back to the open page. */
  targetMissing?: boolean
  /** When the target is a page OTHER than the open one (ticket-30), a secondary
   *  action to navigate there. Omitted for a same-page proposal. */
  onOpenTarget?: () => void
  /** Fix-1 (F1a): how many accepted changes could NOT be placed (failed the
   *  accept-time re-validation gate or lost their target). Renders an honest
   *  notice under the cards — an accept that lands nothing must say so. */
  skippedCount?: number
  /** One short human reason per skipped change ("couldn't place — <reason>").
   *  May be shorter than `skippedCount` (reasons are session-scoped). */
  skippedReasons?: string[]
  onAccept: (index: number) => void
  onReject: (index: number) => void
  onEdit: (index: number) => void
  /** Accepts the pending REQUESTED changes only — the terminal must not sweep
   *  inferred changes into this (they stay individually actionable). */
  onAcceptAll: () => void
  onRejectAll: () => void
  className?: string
}

export function ProposalGroup({
  changes,
  statuses,
  targetName,
  targetMissing,
  onOpenTarget,
  skippedCount = 0,
  skippedReasons = [],
  onAccept,
  onReject,
  onEdit,
  onAcceptAll,
  onRejectAll,
  className,
}: ProposalGroupProps) {
  if (changes.length === 0) return null
  const isPending = (i: number) => (statuses[i] ?? 'pending') === 'pending'
  // The group Accept acts on requested changes only (ticket-30 review): an
  // inferred side-effect is its own decision, so a batch whose only pending
  // changes are inferred offers no group bar at all — each card's own footer
  // is the way to resolve it.
  const anyPendingRequested = changes.some((c, i) => !c.inferred && isPending(i))
  const anyPendingInferred = changes.some((c, i) => c.inferred === true && isPending(i))
  const showGroupBar = changes.length > 1 && anyPendingRequested

  return (
    <div
      role="group"
      aria-label={`${changes.length} proposed changes`}
      className={cn('space-y-2', className)}
    >
      {targetMissing ? (
        <div className="font-serif text-xs font-medium italic text-press-rust">
          Target page not found — this proposal can’t be applied.
        </div>
      ) : (
        targetName && (
          <div className="flex items-center gap-2 text-xs font-medium text-press-muted">
            <span>→ {targetName}</span>
            {onOpenTarget && (
              <button
                type="button"
                onClick={onOpenTarget}
                className="text-press-accent underline underline-offset-2 hover:decoration-press-accent"
              >
                open page
              </button>
            )}
          </div>
        )
      )}
      {showGroupBar && (
        <div className="flex items-center justify-between rounded-mn-inner bg-press-accent-wash px-3 py-1.5">
          <span className="text-xs font-medium text-press-muted">
            {changes.length} proposed changes
          </span>
          <ProposalActions
            status="pending"
            divider={false}
            onAccept={onAcceptAll}
            onReject={onRejectAll}
            labels={{
              // With inferred changes in the batch, the copy says exactly what
              // the group accept does: the requested ones. Inferred cards keep
              // their own Accept.
              accept: anyPendingInferred ? 'Accept requested' : 'Accept all',
              reject: 'Reject all',
            }}
          />
        </div>
      )}

      {changes.map((change, i) => (
        <ModuleDiffCard
          key={i}
          op={change.op}
          before={change.before}
          after={change.after}
          reason={change.reason}
          inferred={change.inferred ?? false}
          status={statuses[i] ?? 'pending'}
          onAccept={() => onAccept(i)}
          onReject={() => onReject(i)}
          onEdit={() => onEdit(i)}
        />
      ))}

      {/* Fix-1 (F1a): honest skip notice. An accepted change that failed the
          accept-time gate is called out with its reason — never a silent no-op. */}
      {skippedCount > 0 && (
        <div role="note" className="space-y-0.5 font-serif text-xs italic text-press-rust">
          {skippedReasons.length > 0 ? (
            skippedReasons.map((reason, i) => <p key={i}>couldn’t place — {reason}</p>)
          ) : (
            <p>
              {skippedCount} change{skippedCount > 1 ? 's' : ''} couldn’t be placed and{' '}
              {skippedCount > 1 ? 'were' : 'was'} skipped.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
