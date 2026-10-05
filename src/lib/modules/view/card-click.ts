/**
 * Board-card click filter (#64) — should this click select the card?
 *
 * A click on a card selects it and opens its record peek, but it can also host
 * interactive children (the title input, a calendar card's ⠿ drag handle,
 * select/status chips-to-come). A click that lands on — or bubbles from inside —
 * any of those is that control's click, not a "select the card" gesture. Kept pure (a DOM predicate, no React)
 * so the filter is unit-testable in isolation.
 */

/** Selector for elements whose clicks belong to themselves, not the card. */
const INTERACTIVE = 'button, input, a, textarea, select, [role="menu"], [role="menuitem"]'

export function shouldOpenCardFromClick(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest(INTERACTIVE)
}
