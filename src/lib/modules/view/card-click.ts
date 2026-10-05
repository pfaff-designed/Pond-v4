/**
 * Should this click select the card? A click on a record selects it and opens its
 * peek, but a record also hosts controls of its own (the title input, a checkbox, a
 * calendar card's ⠿ drag handle). A click that lands on, or bubbles from inside, one
 * of those is that control's click. Pure (a DOM predicate, no React) so it is
 * unit-testable in isolation.
 */

/** Selector for elements whose clicks belong to themselves, not the card. */
const INTERACTIVE = 'button, input, a, textarea, select, [role="menu"], [role="menuitem"]'

export function shouldSelectCardFromClick(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest(INTERACTIVE)
}
