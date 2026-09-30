'use client'

/**
 * The proposal card for an AI `link_records` tool call (#40).
 *
 * One link_records call proposes linking ONE existing source row to one or more
 * existing target rows through a relation property — everything named by TITLE
 * (the model never sees row ids; the terminal resolves titles on accept). This
 * card previews the link (source row → relation → targets) inline in the chat
 * stream and lets the user accept, reject, or correct WHICH collection the
 * source row lives in before anything is written. Purely presentational, like
 * AddRowProposalCard: the terminal owns the decision state, the resolution, and
 * the write path; this component only renders and raises intents.
 *
 * `error` carries a failed accept's message ("No row titled …" / "Multiple rows
 * titled …") — resolution is strict, a dangling id is never written, so the card
 * re-arms with the reason and the user can retry or dismiss.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { kickerClass } from '@/components/atoms/kicker'
import { ProposalActions, type ProposalStatus } from '@/components/molecules/ProposalActions'
import { TOP_LEVEL_VALUE, type ParentOption } from './CreatePageProposalCard'

interface LinkRecordsProposalCardProps {
  /** The source row's title (the row that gains the link). */
  fromRow: string
  /** The relation property's NAME on the source collection. */
  relation: string
  /** The target row title(s) to link to. */
  toRows: string[]
  /** Optional one-line note from the model on why these link. */
  reason?: string
  /** A failed accept's message (no such row / duplicate title); card re-arms. */
  error?: string
  /** The currently-selected source collection id. */
  selectedTargetId: string
  /** Candidate collections for the source picker (only pages with a schema). */
  targetOptions: ParentOption[]
  /** pending → actions + picker shown; accepted/rejected → resolved status line. */
  status?: ProposalStatus
  onTargetChange: (targetId: string) => void
  onAccept: () => void
  onReject: () => void
  className?: string
}

export function LinkRecordsProposalCard({
  fromRow,
  relation,
  toRows,
  reason,
  error,
  selectedTargetId,
  targetOptions,
  status = 'pending',
  onTargetChange,
  onAccept,
  onReject,
  className,
}: LinkRecordsProposalCardProps) {
  const resolved = status !== 'pending'
  // Unique per instance — multiple link cards can render in one chat stream.
  const targetSelectId = useId()

  return (
    <div
      role="group"
      aria-label="Proposed link"
      className={cn(
        'mn-letter overflow-hidden rounded-mn-inner text-left',
        resolved && 'opacity-70',
        className
      )}
    >
      {/* Header — "Link records" kicker + link count */}
      <div className="flex items-center justify-between border-b border-mn-hair px-3 py-1.5">
        <span className={kickerClass}>
          Link records · {toRows.length} {toRows.length === 1 ? 'link' : 'links'}
        </span>
      </div>

      {/* The source row, set as the display-serif line. */}
      <p className="px-3 pt-2.5 font-serif text-sm text-mn-text-meta">{fromRow}</p>

      {reason && <p className="px-3 pt-1.5 font-serif text-xs italic text-mn-text-secondary">{reason}</p>}

      {/* Link preview — the relation name and the target row(s) it gains. */}
      <dl className="mx-3 mt-2 max-h-[200px] divide-y divide-mn-hair overflow-y-auto rounded-mn-row bg-mn-wash px-3 text-sm">
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className={cn(kickerClass, 'text-mn-text-secondary')}>{relation}</dt>
          <dd className="text-right font-serif text-mn-text-meta">{toRows.join(', ')}</dd>
        </div>
      </dl>

      {/* A failed accept's reason — strict resolution never writes a dangling id,
          so the message is the whole outcome; the card stays pending to retry. */}
      {error && !resolved && (
        <p role="alert" className="px-3 pt-1.5 font-serif text-xs italic text-mn-text-secondary">
          {error}
        </p>
      )}

      {/* Source picker — which collection the source row lives in */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <label htmlFor={targetSelectId} className="text-xs text-mn-text-secondary">
          In collection
        </label>
        <select
          id={targetSelectId}
          aria-label="Source collection"
          value={selectedTargetId}
          disabled={resolved}
          onChange={(e) => onTargetChange(e.target.value)}
          className="flex-1 rounded-mn-chrome border border-mn-line bg-mn-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-mn-text disabled:opacity-60"
        >
          {/* No collection resolved yet (name matched nothing): a disabled hint. */}
          {!targetOptions.some((o) => o.id === selectedTargetId) && (
            <option value={TOP_LEVEL_VALUE} disabled>
              Choose a collection…
            </option>
          )}
          {targetOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Footer — accept / reject, or a domain-apt resolved status line. */}
      {resolved ? (
        <div
          aria-live="polite"
          className="mt-2.5 border-t border-mn-hair px-3 py-1.5 font-serif text-xs italic text-mn-text-secondary"
        >
          {status === 'accepted' ? 'Linked' : 'Dismissed'}
        </div>
      ) : (
        <ProposalActions
          status="pending"
          onAccept={onAccept}
          onReject={onReject}
          labels={{ accept: 'Link', reject: 'Dismiss' }}
          className="mt-2.5"
        />
      )}
    </div>
  )
}
