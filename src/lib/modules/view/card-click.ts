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

/**
 * Should a right-click on this target keep the browser's native menu instead of
 * opening the block menu (KAN-485)? `INTERACTIVE` above is deliberately wide (a
 * whole `td`, a `role="button"` card like page-link/highlight) because a plain
 * click there means "this is that control's click, not the card's" — but a
 * right-click only ever needs the browser's own copy/paste, which exists on a
 * field with its own text content: `input`/`textarea`/`select`/a bare
 * `[contenteditable]`. A text block's own prose root is `[role="textbox"]
 * [contenteditable]`; `:not([role="textbox"])` excludes it so right-clicking
 * inside prose still opens the block menu.
 */
const CONTEXT_MENU_FIELD = 'input, textarea, select, [contenteditable]:not([role="textbox"])'

export function isContextMenuField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CONTEXT_MENU_FIELD) !== null
}
