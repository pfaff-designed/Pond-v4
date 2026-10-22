/**
 * A menu drawn on top of a card. Light keeps the warm paper shadow.
 * Dark steps the fill up to the lifted chip and paints a black shadow:
 * the warm rgba(40,34,24) pair is invisible on the dark card, and a menu
 * the same colour as that card has no edge.
 */
export const MENU_ON_CARD =
  'box-border bg-mn-card shadow-[0_2px_6px_rgba(40,34,24,.08),0_16px_40px_rgba(40,34,24,.16)] dark:border dark:border-mn-text/15 dark:bg-mn-drag-ghost dark:shadow-[0_2px_8px_rgba(0,0,0,.55),0_18px_44px_rgba(0,0,0,.7)]'
