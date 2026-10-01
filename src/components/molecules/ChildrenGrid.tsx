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

import { Fragment } from 'react'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import type { OverviewCardModel } from '@/lib/pages/overview'

/**
 * The grid's section label — one component so the label can't drift between
 * ChildrenGrid's inline rendering and OverviewSurface's rise-animated copy. It
 * lives on a page, so it is the sans page eyebrow (10.5 / .1em / .68), not a
 * mono label at a fourth ink tier (#220).
 */
export function ChildrenGridLabel({
  children = 'Everything within',
}: {
  children?: React.ReactNode
}) {
  return <div className={`${pageEyebrowClass} mb-3.5`}>{children}</div>
}

/**
 * The interactive host around a `record-card` PondMolecule in stat mode (#95,
 * the OverviewCard absorption): the whole card is one calm click target.
 * ticket-41: hover lift + pressed-state settle, token-timed — the active state
 * presses the card back to rest (a physical "click") so the tap reads as
 * cause, not just a hover flourish. Reduced-motion still gets the visual
 * change instantly (no travel is perceptible at the token durations).
 */
function OverviewCardButton({ card, onOpen }: { card: OverviewCardModel; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full cursor-pointer rounded-mn-card text-left outline-none transition-transform duration-[var(--motion-settle)] ease-[var(--ease-mn)] hover:-translate-y-px active:translate-y-0 active:scale-[0.994] active:duration-[var(--motion-instant)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mn-area-b motion-reduce:transition-none"
    >
      <PondMolecule
        kind="record-card"
        title={card.title}
        stat={card.stat}
        sub={card.sub}
        accent={card.accent}
        className="transition-shadow duration-[var(--motion-settle)] group-hover:shadow-mn-md"
      />
    </button>
  )
}

export interface ChildrenGridProps {
  cards: OverviewCardModel[]
  onOpenCard: (card: OverviewCardModel) => void
  /**
   * Wrapper for each cell — lets the surface apply its staggered rise-on-mount.
   * Each cell is keyed internally (a keyed Fragment per card), so wrappers do NOT
   * need to supply their own key.
   */
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
      {label !== false && <ChildrenGridLabel>{label}</ChildrenGridLabel>}
      <div className="grid grid-cols-2 gap-3.5">
        {cards.map((card) => (
          <Fragment key={card.id}>
            {cell(card, <OverviewCardButton card={card} onOpen={() => onOpenCard(card)} />)}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
