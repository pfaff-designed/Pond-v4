'use client'

/**
 * An AI-proposed block edit, rendered inline in the AI terminal (ticket-10).
 *
 * Presentational — the terminal owns all state and the write path; this molecule
 * only shows the before/after and raises Accept / Reject / Edit. Text blocks this
 * slice: the old content is struck through and the proposed content shown
 * alongside. Once resolved, the actions are replaced by a status line so the chat
 * stays a readable audit trail.
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type DiffCardStatus = 'pending' | 'accepted' | 'rejected'

interface DiffCardProps {
  /** Human label for the block being changed (text-only this slice). */
  blockType?: string
  /** Current block content. Empty string when proposing brand-new content. */
  before: string
  /** Proposed replacement content. */
  after: string
  /** Optional one-line note from the model on what changed and why. */
  reason?: string
  /** pending → actions shown; accepted/rejected → resolved status line. */
  status?: DiffCardStatus
  onAccept: () => void
  onReject: () => void
  onEdit: () => void
  className?: string
}

export function DiffCard({
  blockType = 'text',
  before,
  after,
  reason,
  status = 'pending',
  onAccept,
  onReject,
  onEdit,
  className,
}: DiffCardProps) {
  const resolved = status !== 'pending'

  return (
    <div
      role="group"
      aria-label="Proposed edit"
      className={cn(
        'rounded-lg border border-zinc-200 bg-white text-left shadow-sm',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Proposed edit · {blockType}
        </span>
      </div>

      {/* Before / after */}
      <div className="space-y-1.5 px-3 py-2 text-sm">
        {before ? (
          <del className="block whitespace-pre-wrap text-zinc-400 line-through decoration-zinc-300">
            {before}
          </del>
        ) : (
          <span className="block text-xs italic text-zinc-400">New content</span>
        )}
        <ins className="block whitespace-pre-wrap text-zinc-900 no-underline">{after}</ins>
      </div>

      {reason && <p className="px-3 pb-2 text-xs text-zinc-500">{reason}</p>}

      {/* Actions / resolved status */}
      {resolved ? (
        <div
          className="border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-500"
          aria-live="polite"
        >
          {status === 'accepted' ? 'Accepted' : 'Rejected'}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t border-zinc-100 px-3 py-2">
          <Button size="xs" variant="default" onClick={onAccept}>
            Accept
          </Button>
          <Button size="xs" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button size="xs" variant="ghost" onClick={onReject}>
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
