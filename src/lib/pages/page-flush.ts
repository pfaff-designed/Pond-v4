/**
 * "Flush this page's pending debounced save now" (KAN-302). `usePageDraft`
 * registers its immediate-save flush for the page it holds; the composer
 * awaits it for the open node before sending so the next chat turn's DB read
 * never lands inside the save's debounce window. Same decoupling as
 * `terminal-focus.ts`'s event registry, but a registry (not an event) since
 * the caller needs the flush's completion, not just to fire it.
 */

// `undefined` means "nothing was pending" — a caller with no save to wait on
// can carry on in the same tick rather than deferring a microtask for no reason.
type Flush = () => Promise<void> | undefined

const flushes = new Map<string, Flush>()

export function registerPageFlush(pageId: string, flush: Flush): () => void {
  flushes.set(pageId, flush)
  return () => {
    if (flushes.get(pageId) === flush) flushes.delete(pageId)
  }
}

export function flushPendingPageSave(pageId: string | null | undefined): Promise<void> | undefined {
  if (!pageId) return undefined
  return flushes.get(pageId)?.()
}
