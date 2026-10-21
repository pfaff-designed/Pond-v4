/**
 * The page-write registry (KAN-302, extended for KAN-495): one place that
 * outlives any single `DocumentPanel`/`usePageDraft` mount, keyed by page id.
 *
 * `registerPageFlush`/`flushPendingPageSave` — "flush this page's pending
 * debounced save now". `usePageDraft` registers its immediate-save flush for
 * the page it holds; the composer awaits it for the open node before sending
 * so the next chat turn's DB read never lands inside the save's debounce
 * window. Same decoupling as `terminal-focus.ts`'s event registry, but a
 * registry (not an event) since the caller needs the flush's completion, not
 * just to fire it.
 *
 * `getPageWriteQueue` (KAN-495) — the page's write queue, module-level like
 * `flushes` below so a save still in flight from a page just left finishes
 * in its own queue rather than being torn down with the component that
 * started it. Lazy: the caller's `createQueue` only runs on that page's
 * first call, never again.
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

const writeQueues = new Map<string, unknown>()

export function getPageWriteQueue<T>(pageId: string, createQueue: () => T): T {
  const existing = writeQueues.get(pageId)
  if (existing !== undefined) return existing as T
  const queue = createQueue()
  writeQueues.set(pageId, queue)
  return queue
}
