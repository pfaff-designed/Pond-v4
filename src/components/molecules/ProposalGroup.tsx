'use client'

/**
 * The diff cards of one assistant message (t16 Phase 5 → #98).
 *
 * One AI message can touch several pages, one `propose_changes` batch each —
 * "one card per page touched" (board 6c frame 2). This stacks those cards and,
 * ONLY when more than one is still pending, adds the "accept all / reject all"
 * bar above them (C10: accept all appears when there is more than one card, and
 * must not be reintroduced on a single card).
 *
 * Purely presentational: the terminal owns the decision state (each card's
 * `status`) and the write path.
 */

import { cn } from '@/lib/utils'
import { ModuleDiffCard } from './ModuleDiffCard'
import { ProposalActions, type ProposalStatus } from '@/components/molecules/ProposalActions'
import type { ChangePreview } from '@/lib/modules/preview'

export interface ProposalGroupCard {
  /** The batch's toolCallId. */
  id: string
  changes: ChangePreview[]
  status: ProposalStatus
  targetName?: string
  targetMissing?: boolean
  onOpenTarget?: () => void
  note?: string
  revised?: boolean
  skippedCount?: number
  skippedReasons?: string[]
}

interface ProposalGroupProps {
  cards: ProposalGroupCard[]
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onRequestChanges: (id: string, note: string) => void
  onRevise: (id: string) => void
  onAskAgain?: (id: string) => void
  /** Accept every card still pending. */
  onAcceptAll: () => void
  onRejectAll: () => void
  className?: string
}

export function ProposalGroup({
  cards,
  onAccept,
  onReject,
  onRequestChanges,
  onRevise,
  onAskAgain,
  onAcceptAll,
  onRejectAll,
  className,
}: ProposalGroupProps) {
  if (cards.length === 0) return null
  const pending = cards.filter((c) => c.status === 'pending')
  const showGroupBar = pending.length > 1

  return (
    <div
      role="group"
      aria-label={`${cards.length} ${cards.length === 1 ? 'diff' : 'diffs'}`}
      className={cn('space-y-3', className)}
    >
      {showGroupBar && (
        <div className="flex items-center justify-between gap-4 rounded-mn-inner bg-mn-wash px-3 py-1.5">
          <span className="whitespace-nowrap font-mono text-[11px] lowercase text-mn-text-meta">
            {pending.length} proposed edits
          </span>
          <ProposalActions
            status="pending"
            divider={false}
            onAccept={onAcceptAll}
            onReject={onRejectAll}
            labels={{ accept: 'accept all', reject: 'reject all' }}
          />
        </div>
      )}

      {cards.map((card) => (
        <ModuleDiffCard
          key={card.id}
          changes={card.changes}
          targetName={card.targetName}
          targetMissing={card.targetMissing}
          onOpenTarget={card.onOpenTarget}
          status={card.status}
          note={card.note}
          revised={card.revised}
          skippedCount={card.skippedCount}
          skippedReasons={card.skippedReasons}
          onAccept={() => onAccept(card.id)}
          onReject={() => onReject(card.id)}
          onRequestChanges={(note) => onRequestChanges(card.id, note)}
          onRevise={() => onRevise(card.id)}
          onAskAgain={onAskAgain ? () => onAskAgain(card.id) : undefined}
        />
      ))}
    </div>
  )
}
