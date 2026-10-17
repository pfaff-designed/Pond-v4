/**
 * The composer's clearance contract (`PondComposer`) — one module so the
 * card that FLOATS and the surfaces that PAD against it read the same numbers.
 * The card is as tall as its content and grows upward from a fixed inset; it
 * publishes its measured footprint (card + inset) as a CSS custom property on the
 * shell (`COMPOSER_CLEARANCE_VAR`), and the page surfaces pad their bottom by
 * `composerClearancePadding()` — so the last lines can always scroll clear of the
 * glass, including the accept/reject gesture on an open proposal.
 */

/** The card's distance from the shell's bottom edge (`bottom: 24px` in the storyboards). */
export const COMPOSER_BOTTOM_INSET = 24
/** The custom property the card's own `bottom` reads, so a wrapping surface (zen) can move it. */
export const COMPOSER_CARD_BOTTOM_VAR = '--composer-card-bottom'
/** The card's height at rest: 14 padding ×2, a 25px line, 14 gap, a 32px toolbar, 1px border ×2. */
export const COMPOSER_REST_HEIGHT = 101

/** The custom property the card publishes its footprint through, on the shell element. */
export const COMPOSER_CLEARANCE_VAR = '--pond-composer-clearance'
/** Air between a surface's last line and the composer's top edge, once scrolled to the end. */
export const COMPOSER_CLEARANCE_GAP = 24

/** The collapsed tab sits on the shell's bottom edge, with no inset below it. */
export const COMPOSER_TAB_INSET = 0

/** Room above the card for the ⌘K pill: its 20px inset, its 40px, and 12px of air. */
export const COMPOSER_TOP_CLEARANCE = 72

/** The footprint the card publishes: its own height plus the inset below it. */
export const composerFootprintPx = (cardHeight: number, inset = COMPOSER_BOTTOM_INSET): number =>
  cardHeight + inset

/** The shell element the card publishes its footprint on, or null off a shell (SSR, Storybook). */
const queryShell = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-part="shell"]')

/** The footprint the shell is currently publishing, or null when nothing has. */
const publishedFootprintPx = (shell: HTMLElement): number | null => {
  const footprint = parseFloat(getComputedStyle(shell).getPropertyValue(COMPOSER_CLEARANCE_VAR))
  return Number.isNaN(footprint) ? null : footprint
}

/**
 * The bottom padding a page surface carries so its last lines clear the
 * floating composer. Reads the card's published footprint; when none has
 * published (Storybook, a surface rendered alone) it assumes the card at rest.
 */
export const composerClearancePadding = (): string => {
  const fallback = composerFootprintPx(COMPOSER_REST_HEIGHT)
  return `calc(var(${COMPOSER_CLEARANCE_VAR}, ${fallback}px) + ${COMPOSER_CLEARANCE_GAP}px)`
}

/**
 * The lowest a floating surface over the canvas may reach without landing
 * under the composer. Measured from the shell's own bottom edge, not the raw
 * viewport height — the shell can end a pixel short of it (scrollbars,
 * fractional layout), and a bound off the viewport alone lands the menu
 * under the composer by exactly that pixel. Reads the footprint published on
 * the shell; when nothing has published (no shell, or the composer never
 * mounted) the bound is the full viewport.
 */
export const composerBottomBound = (viewportHeight: number): number => {
  const shell = queryShell()
  if (!shell) return viewportHeight
  const footprint = publishedFootprintPx(shell)
  if (footprint === null) return viewportHeight
  return shell.getBoundingClientRect().bottom - footprint
}

/**
 * The numeric clearance a scroll-margin can read in JS (CSS custom
 * properties aren't readable as numbers): the published footprint plus
 * `COMPOSER_CLEARANCE_GAP`, or the card-at-rest footprint plus the gap when
 * nothing has published — the same fallback `composerClearancePadding()`'s
 * calc string uses.
 */
export const composerClearanceMarginPx = (): number => {
  const shell = queryShell()
  const footprint = shell ? publishedFootprintPx(shell) : null
  if (footprint === null) return composerFootprintPx(COMPOSER_REST_HEIGHT) + COMPOSER_CLEARANCE_GAP
  return footprint + COMPOSER_CLEARANCE_GAP
}
