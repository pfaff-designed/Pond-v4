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

const HIGHLIGHT_CLASSES = ['ring-2', 'ring-press-faint', 'rounded-sm']

/** Scroll a block into view and (by default) briefly highlight it. */
export function scrollToBlock(blockId: string, opts: { highlight?: boolean } = {}) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(blockDomId(blockId))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (opts.highlight ?? true) {
    el.classList.add(...HIGHLIGHT_CLASSES)
    window.setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), 1200)
  }
}
