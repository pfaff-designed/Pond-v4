'use client'

/**
 * The "Everything within" section of an overview: a quiet mono label over a
 * two-up grid of child-page cards. Extracted from OverviewSurface so a page that
 * holds BOTH its own blocks AND children can show the same children grid *below*
 * its content (ticket-22) — the surface and the editor share one grid, so they
 * can't drift.
 *
 * Renders nothing when there are no cards, so a content section collapses to
 * nothing on a childless page.
 */

import { OverviewCard } from '@/components/molecules/OverviewCard'
import type { OverviewCardModel } from '@/lib/pages/overview'

export interface ChildrenGridProps {
  cards: OverviewCardModel[]
  onOpenCard: (card: OverviewCardModel) => void
  /** Wrapper for each cell — lets the surface apply its staggered rise-on-mount. */
  cell?: (card: OverviewCardModel, node: React.ReactNode) => React.ReactNode
  /**
   * The mono section label. A string renders the standard label; `false` omits it
   * so a caller (OverviewSurface) can own the label with its own rise animation.
   */
  label?: string | false
}

export function ChildrenGrid({
  cards,
  onOpenCard,
  cell = (_card, node) => node,
  label = 'Everything within',
}: ChildrenGridProps) {
  if (cards.length === 0) return null
  return (
    <div>
      {label !== false && (
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-press-faint mb-3.5">
          {label}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        {cards.map((card) =>
          cell(
            card,
            <OverviewCard
              key={card.id}
              title={card.title}
              stat={card.stat}
              sub={card.sub}
              accent={card.accent}
              onOpen={() => onOpenCard(card)}
            />
          )
        )}
      </div>
    </div>
  )
}
