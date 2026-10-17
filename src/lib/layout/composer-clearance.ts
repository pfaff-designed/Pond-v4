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

/**
 * What a scrolling caret actually has to clear, on the shell element. Equal
 * to `COMPOSER_CLEARANCE_VAR` while the card or its tab is on screen — but
 * zen hiding the card (ZenChrome `hidden`) leaves `COMPOSER_CLEARANCE_VAR` at
 * its last value on purpose (so the page's content padding doesn't jump),
 * and nothing is drawn where that footprint says — the zen pill is, lower
 * down. Two facts, two vars (`TerminalDrawer.tsx`'s publish effect).
 */
export const COMPOSER_SCROLL_CLEARANCE_VAR = '--pond-composer-scroll-clearance'

/** The zen pill's own footprint (`ZenPill.tsx`): `bottom-[30px]`, plus its
 *  height (the row's `p-[5px]` round its `h-[36px]` items: 36 + 5 + 5). What
 *  zen actually draws at the screen's bottom once the card itself is hidden. */
export const ZEN_PILL_BOTTOM_INSET_PX = 30
export const ZEN_PILL_HEIGHT_PX = 46
export const ZEN_PILL_FOOTPRINT_PX = ZEN_PILL_BOTTOM_INSET_PX + ZEN_PILL_HEIGHT_PX

/** The collapsed tab sits on the shell's bottom edge, with no inset below it. */
export const COMPOSER_TAB_INSET = 0

/** Room above the card for the ⌘K pill: its 20px inset, its 40px, and 12px of air. */
export const COMPOSER_TOP_CLEARANCE = 72

/** One text line (prose 17.5px × 1.6 line-height) — the least a caret band may be. */
export const COMPOSER_MIN_CARET_BAND = 28

/** The footprint the card publishes: its own height plus the inset below it. */
export const composerFootprintPx = (cardHeight: number, inset = COMPOSER_BOTTOM_INSET): number =>
  cardHeight + inset

/** The shell element the card publishes its footprint on, or null off a shell (SSR, Storybook). */
const queryShell = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-part="shell"]')

/** The number the shell is currently publishing under `cssVar`, or null when nothing has. */
const publishedPx = (shell: HTMLElement, cssVar: string): number | null => {
  const value = parseFloat(getComputedStyle(shell).getPropertyValue(cssVar))
  return Number.isNaN(value) ? null : value
}

/** The footprint the shell is currently publishing, or null when nothing has. */
const publishedFootprintPx = (shell: HTMLElement): number | null => publishedPx(shell, COMPOSER_CLEARANCE_VAR)

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
 * calc string uses. Clamped so it never swallows the whole scroller: maximized
 * or dragged to its max height, the card's footprint plus the top clearance
 * can exceed the scroller itself, leaving no band for the caret to sit in.
 * Clamped against the shell's own height (the page scroller spans the
 * shell's full column); with no shell there is nothing to clamp against.
 *
 * Reads `COMPOSER_SCROLL_CLEARANCE_VAR` first — what a caret actually has to
 * clear — falling back to the content-padding footprint, then the
 * card-at-rest fallback, same order as `composerScrollPadding`'s CSS.
 */
export const composerClearanceMarginPx = (): number => {
  const shell = queryShell()
  const published = shell ? publishedPx(shell, COMPOSER_SCROLL_CLEARANCE_VAR) ?? publishedFootprintPx(shell) : null
  const margin =
    published === null ? composerFootprintPx(COMPOSER_REST_HEIGHT) + COMPOSER_CLEARANCE_GAP : published + COMPOSER_CLEARANCE_GAP
  if (!shell) return margin
  const maxMargin = shell.getBoundingClientRect().height - COMPOSER_TOP_CLEARANCE - COMPOSER_MIN_CARET_BAND
  return Math.max(0, Math.min(margin, maxMargin))
}

/**
 * The inline `scroll-padding` a page's own scroller carries so native
 * caret-follow and `scrollIntoView` land clear of the pill above and the
 * card below — whichever element actually scrolls the page (`<main>`,
 * `PageCanvas`'s own div) reads the same two values. The bottom value reads
 * `COMPOSER_SCROLL_CLEARANCE_VAR` first (what a caret actually has to
 * clear), falling back to the content-padding footprint, then the
 * card-at-rest fallback — the same order `composerClearanceMarginPx` reads
 * in JS. Clamped the same way too: `scroll-padding`'s `%` resolves against
 * the scrollport's own height, so `100%` here is the scroller's height
 * without a shell lookup.
 */
export const composerScrollPadding = (): { scrollPaddingTop: string; scrollPaddingBottom: string } => {
  const fallback = composerFootprintPx(COMPOSER_REST_HEIGHT)
  const bottom = `calc(var(${COMPOSER_SCROLL_CLEARANCE_VAR}, var(${COMPOSER_CLEARANCE_VAR}, ${fallback}px)) + ${COMPOSER_CLEARANCE_GAP}px)`
  return {
    scrollPaddingTop: `${COMPOSER_TOP_CLEARANCE}px`,
    scrollPaddingBottom: `min(${bottom}, calc(100% - ${COMPOSER_TOP_CLEARANCE + COMPOSER_MIN_CARET_BAND}px))`,
  }
}
