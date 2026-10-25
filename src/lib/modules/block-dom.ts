/**
 * Block DOM-id convention + scroll-to-block (ticket-23) — the ONE place the
 * `block-<id>` element-id convention is minted, shared by every host that lays
 * out blocks (DocumentPanel, PageView). A bound metric's `→` jumps to its source
 * through this. Plain DOM, no React; SSR-guarded, silently no-ops if the host
 * didn't stamp the id.
 *
 * (AITerminal's scroll-into-view predates this helper and still inlines the
 * string — that file is owned by another ticket; fold it in when it's next open.)
 */

/** The element id a host stamps on a block's wrapper. */
export function blockDomId(blockId: string): string {
  return `block-${blockId}`
}

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-mn-mark-faint', 'rounded-sm']

/**
 * Scroll a block into view and (by default) briefly highlight it. `block`
 * (default `'center'`) is the native `scrollIntoView` alignment — the TOC's
 * entries pass `'start'` so a heading lands clear of the composer
 * (`scroll-padding-top`, KAN-400), not centred under it.
 */
export function scrollToBlock(
  blockId: string,
  opts: { highlight?: boolean; block?: ScrollLogicalPosition } = {}
) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(blockDomId(blockId))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: opts.block ?? 'center' })
  if (opts.highlight ?? true) {
    el.classList.add(...HIGHLIGHT_CLASSES)
    window.setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), 1200)
  }
}

/**
 * Focus the page title input (`DocumentPanel`) and place the caret at its
 * start or end — the fallback when a block delete leaves no block behind
 * (KAN-369's ↑/Backspace-to-title land at `'end'`; a future start-of-title
 * caller is free to pass `'start'`).
 */
export function focusPageTitle(at: 'start' | 'end' = 'end') {
  if (typeof document === 'undefined') return
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    '[data-pond-page-title]'
  )
  if (!el) return
  el.focus()
  const pos = at === 'start' ? 0 : el.value.length
  el.setSelectionRange(pos, pos)
}
