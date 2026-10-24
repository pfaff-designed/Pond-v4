/**
 * Should this click select the card? A click on a record selects it and opens its
 * peek, but a record also hosts controls of its own (the title input, a checkbox, a
 * calendar card's ⠿ drag handle). A click that lands on, or bubbles from inside, one
 * of those is that control's click. Pure (a DOM predicate, no React) so it is
 * unit-testable in isolation.
 */

/** Selector for elements whose clicks belong to themselves, not the card. */
const INTERACTIVE =
  'button, input, a, textarea, select, td, th, [contenteditable], ' +
  '[role="menu"], [role="menuitem"], [role="textbox"], [role="button"]'

export function shouldSelectCardFromClick(target: EventTarget | null): boolean {
  return target instanceof Element && !target.closest(INTERACTIVE)
}

/**
 * Should this click open the row's record (KAN-546)? Only the title cell is
 * the row's way in — a field cell, whether its own control or its bare
 * padding, belongs to that field and must never open the record.
 */
export function shouldOpenRowFromClick(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-part="title-cell"]') !== null
}
