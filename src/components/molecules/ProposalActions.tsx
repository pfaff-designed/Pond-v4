'use client'

/**
 * The accept / reject / request changes control row for an AI proposal (t16
 * Phase 5, #98).
 *
 * Extracted from `ModuleDiffCard` so the card footer, the group-level "accept
 * all / reject all" bar and the change-log rows share one implementation.
 * Purely presentational — the caller owns the decision state and raises the
 * intents.
 *
 *   - `status === 'pending'` → the buttons. PROJECT_RULES: the buttons on a diff
 *     are accept, reject and request changes; an accept may be named for what it
 *     does ("make page"), which is what `labels` is for.
 *   - resolved → a status line, kept for the thread's audit trail. One label per
 *     status (W6, `labelForStatus`), so all eight read distinctly.
 *
 * `onRequestChanges` is optional: omit it to drop the third button (the group bar
 * and the change-log rows have none). `divider` draws the card-footer top border
 * + padding; set false when embedded in a container that supplies its own chrome.
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { labelForStatus } from '@/lib/change-log/status'
import type { ProposalDecision } from '@/lib/conversation/resolutions'

/** A card's status: the seven settled decisions, or pending (= `proposed`). */
export type ProposalStatus = 'pending' | ProposalDecision

interface ProposalActionsProps {
  status?: ProposalStatus
  onAccept: () => void
  onReject: () => void
  /** Omit to hide the request-changes button (e.g. a group-level bar). */
  onRequestChanges?: () => void
  /** Override the default button text (e.g. "accept all", "make page"). */
  labels?: { accept?: string; reject?: string; requestChanges?: string }
  /** Card-footer divider + padding. False when the container supplies its own. */
  divider?: boolean
  /** Quieten the controls while the decision's write is in flight (#103). */
  disabled?: boolean
  className?: string
}

/** Board 6c: pills at 11px / 500, 7px 13px — accept ink-on-paper, the rest on
 *  the ink .07 wash. Lowercase: the machine surface. */
export const proposalButtonClass = 'h-7 px-[13px] text-[11px] lowercase'

export function ProposalActions({
  status = 'pending',
  onAccept,
  onReject,
  onRequestChanges,
  labels,
  divider = true,
  disabled = false,
  className,
}: ProposalActionsProps) {
  if (status !== 'pending') {
    return (
      <div
        aria-live="polite"
        data-part="status"
        className={cn(
          // Audit-trail line: machine surface → mono voice (lowercase, tracked).
          'font-mono text-xs lowercase tracking-wider text-mn-text-meta',
          divider && 'border-t border-mn-hair px-3 py-1.5',
          className
        )}
      >
        {labelForStatus(status)}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-[7px]',
        divider && 'border-t border-mn-hair px-3 py-2',
        className
      )}
    >
      <Button
        size="sm"
        variant="default"
        className={proposalButtonClass}
        disabled={disabled}
        onClick={onAccept}
      >
        {labels?.accept ?? 'accept'}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className={proposalButtonClass}
        disabled={disabled}
        onClick={onReject}
      >
        {labels?.reject ?? 'reject'}
      </Button>
      {onRequestChanges && (
        <Button
          size="sm"
          variant="secondary"
          className={proposalButtonClass}
          disabled={disabled}
          onClick={onRequestChanges}
        >
          {labels?.requestChanges ?? 'request changes'}
        </Button>
      )}
    </div>
  )
}
