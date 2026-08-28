'use client'

/**
 * The Accept / Edit / Reject control row for an AI proposal (t16 Phase 5).
 *
 * Extracted from `ModuleDiffCard` so the single-card footer and the group-level
 * "Accept all / Reject all" bar share one implementation. Purely presentational —
 * the caller owns the decision state and raises the intents.
 *
 *   - `status === 'pending'` → the buttons.
 *   - resolved                → a status line, kept for the chat's audit trail.
 *
 * `onEdit` is optional: omit it to drop the Edit action (the group bar has none).
 * `divider` draws the card-footer top border + padding; set false when embedded in
 * a container that supplies its own chrome.
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

interface ProposalActionsProps {
  status?: ProposalStatus
  onAccept: () => void
  onReject: () => void
  /** Omit to hide the Edit button (e.g. a group-level bar). */
  onEdit?: () => void
  /** Override the default button text (e.g. "Accept all"). */
  labels?: { accept?: string; edit?: string; reject?: string }
  /** Card-footer divider + padding. False when the container supplies its own. */
  divider?: boolean
  className?: string
}

export function ProposalActions({
  status = 'pending',
  onAccept,
  onReject,
  onEdit,
  labels,
  divider = true,
  className,
}: ProposalActionsProps) {
  if (status !== 'pending') {
    return (
      <div
        aria-live="polite"
        className={cn(
          'font-serif text-xs italic text-press-muted',
          divider && 'border-t border-press-hair px-3 py-1.5',
          className
        )}
      >
        {status === 'accepted' ? 'Accepted' : 'Rejected'}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        divider && 'border-t border-press-hair px-3 py-2',
        className
      )}
    >
      <Button size="xs" variant="default" onClick={onAccept}>
        {labels?.accept ?? 'Accept'}
      </Button>
      {onEdit && (
        <Button size="xs" variant="outline" onClick={onEdit}>
          {labels?.edit ?? 'Edit'}
        </Button>
      )}
      <Button size="xs" variant="ghost" onClick={onReject}>
        {labels?.reject ?? 'Reject'}
      </Button>
    </div>
  )
}
