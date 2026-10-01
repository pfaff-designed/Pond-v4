/**
 * The composer drawer's height contract (ticket-24, #96) — one module so the
 * drawer that SIZES the card and the surfaces that PAD against it read the same
 * numbers. The drawer is user-draggable between the min and max, auto-grows to
 * the proposal floor while a diff needs review, and shrinks to the collapsed
 * strip; whichever applies, it publishes the result as a CSS custom property
 * on the shell (`COMPOSER_CLEARANCE_VAR`) and the page surfaces pad their
 * bottom by `composerClearancePadding()` — so the last lines can always scroll
 * clear of the glass, including the accept/reject gesture on an open proposal.
 */

export const TERMINAL_MIN_HEIGHT = 160
export const TERMINAL_MAX_HEIGHT = 640
export const TERMINAL_DEFAULT_HEIGHT = 288 // 18rem — the incumbent fixed height
/** Header height shown when collapsed (just the grab/context strip). */
export const TERMINAL_COLLAPSED_HEIGHT = 40
/**
 * Auto-grow floor while any proposal is unresolved: a hidden decision is worse
 * than a big drawer, so the drawer grows to at least this (never past the max).
 */
export const PROPOSAL_MIN_HEIGHT = 500

export function clampTerminalHeight(h: number): number {
  return Math.min(TERMINAL_MAX_HEIGHT, Math.max(TERMINAL_MIN_HEIGHT, h))
}

/** The drawer's full footprint in px — the strip alone when collapsed, else body + strip. */
export function drawerFootprintPx(height: number, collapsed: boolean): number {
  return collapsed ? TERMINAL_COLLAPSED_HEIGHT : height + TERMINAL_COLLAPSED_HEIGHT
}

/** The custom property the drawer publishes its footprint through, on the shell element. */
export const COMPOSER_CLEARANCE_VAR = '--pond-composer-clearance'
/** Air between a surface's last line and the composer's top edge, once scrolled to the end. */
export const COMPOSER_CLEARANCE_GAP = 24

/**
 * The bottom padding a page surface carries so its last lines clear the
 * floating composer. Reads the drawer's published footprint; when no drawer
 * has published (Storybook, a surface rendered alone) it assumes the default
 * expanded drawer rather than none.
 */
export function composerClearancePadding(): string {
  const fallback = drawerFootprintPx(TERMINAL_DEFAULT_HEIGHT, false)
  return `calc(var(${COMPOSER_CLEARANCE_VAR}, ${fallback}px) + ${COMPOSER_CLEARANCE_GAP}px)`
}
