'use client'

/**
 * A page's nested pages: a two-up grid of child-page cards under the page's own
 * content. One grid for every page — Life, an area, a project — so the way
 * nested pages read can't drift between pages (ticket-22, #234).
 *
 * No section label: no board draws one. The boards describe nesting only in
 * prose ("a page with pages inside it"), and the one storyboard that shows a
 * nested page on its parent (`Pond 06.11`) places it in the flow with no heading
 * over it. The hairline the caller draws above the grid is the whole separation;
 * each card says what it is.
 *
 * Renders nothing when there are no cards, so a content section collapses to
 * nothing on a childless page.
 */

import { PondMolecule } from '@/components/molecules/PondMolecule'
import type { ChildCardModel } from '@/lib/pages/child-cards'

/**
 * The interactive host around a `record-card` PondMolecule in stat mode (#95):
 * the whole card is one calm click target. ticket-41: hover lift + pressed-state
 * settle, token-timed — the active state presses the card back to rest (a
 * physical "click") so the tap reads as cause, not just a hover flourish.
 * Reduced-motion still gets the visual change instantly (no travel is
 * perceptible at the token durations).
 */
function ChildCardButton({ card, onOpen }: { card: ChildCardModel; onOpen: () => void }) {
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
  cards: ChildCardModel[]
  onOpenCard: (card: ChildCardModel) => void
}

export function ChildrenGrid({ cards, onOpenCard }: ChildrenGridProps) {
  if (cards.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {cards.map((card) => (
        <ChildCardButton key={card.id} card={card} onOpen={() => onOpenCard(card)} />
      ))}
    </div>
  )
}
