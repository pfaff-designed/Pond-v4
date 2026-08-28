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
  /** One preview per change in the batch, in emission order. */
  changes: ChangePreview[]
  /** Decision per change, index-aligned with `changes`. */
  statuses: ProposalStatus[]
  /** Per-change "inferred" flag (ticket-30) — true marks a change the model
   *  inferred as a side-effect rather than one the user explicitly requested,
   *  so the card labels it distinctly. Index-aligned with `changes`. */
  inferredFlags?: boolean[]
  /** Name of the page this batch writes to on accept (the stamped proposal
   *  target), so an accept is auditable before it lands. */
  targetName?: string
  /** When the target is a page OTHER than the open one (ticket-30), a secondary
   *  action to navigate there. Omitted for a same-page proposal. */
  onOpenTarget?: () => void
  onAccept: (index: number) => void
  onReject: (index: number) => void
  onEdit: (index: number) => void
  onAcceptAll: () => void
  onRejectAll: () => void
  className?: string
}

export function ProposalGroup({
  changes,
  statuses,
  inferredFlags,
  targetName,
  onOpenTarget,
  onAccept,
  onReject,
  onEdit,
  onAcceptAll,
  onRejectAll,
  className,
}: ProposalGroupProps) {
  if (changes.length === 0) return null
  const anyPending = changes.some((_, i) => (statuses[i] ?? 'pending') === 'pending')
  const showGroupBar = changes.length > 1 && anyPending

  return (
    <div
      role="group"
      aria-label={`${changes.length} proposed changes`}
      className={cn('space-y-2', className)}
    >
      {targetName && (
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          <span>→ {targetName}</span>
          {onOpenTarget && (
            <button
              type="button"
              onClick={onOpenTarget}
              className="underline underline-offset-2 hover:text-zinc-700"
            >
              open page
            </button>
          )}
        </div>
      )}
      {showGroupBar && (
        <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5">
          <span className="text-xs font-medium text-zinc-500">
            {changes.length} proposed changes
          </span>
          <ProposalActions
            status="pending"
            divider={false}
            onAccept={onAcceptAll}
            onReject={onRejectAll}
            labels={{ accept: 'Accept all', reject: 'Reject all' }}
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
          inferred={inferredFlags?.[i] ?? false}
          status={statuses[i] ?? 'pending'}
          onAccept={() => onAccept(i)}
          onReject={() => onReject(i)}
          onEdit={() => onEdit(i)}
        />
      ))}
    </div>
  )
}
