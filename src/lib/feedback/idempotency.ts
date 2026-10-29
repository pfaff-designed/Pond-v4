/**
 * Idempotent filing for `/api/feedback` (KAN-572, AUDIT G9). A caller that
 * sends an `idempotencyKey` — the composer's report card sends its tool call's
 * id — files ONE issue per key: a second request with the same key, whether it
 * arrives while the first is still in flight or after it landed, gets the first
 * one's answer instead of filing again. A filing that failed is forgotten, so
 * the person can retry it.
 *
 * Module-level state like `rate-limit.ts`: a size-S guard that resets on
 * deploy. The card's own guard and the resolutions envelope cover the client;
 * this covers a second tab or a request the client lost track of.
 */

const TTL_MS = 24 * 60 * 60 * 1000

export interface FiledReport {
  key: string
  url: string
  [field: string]: unknown
}

interface Filing {
  at: number
  /** Resolves to the filed issue, or null when the filing failed. */
  result: Promise<FiledReport | null>
}

const filings = new Map<string, Filing>()

/** A key is scoped to the caller, so two people can never collide on one. */
export function filingKey(userId: string, idempotencyKey: string): string {
  return `${userId}:${idempotencyKey}`
}

/** The earlier filing under `key`, if one is in flight or landed within the TTL. */
export function priorFiling(
  key: string,
  now = Date.now()
): Promise<FiledReport | null> | undefined {
  const filing = filings.get(key)
  if (!filing) return undefined
  if (now - filing.at > TTL_MS) {
    filings.delete(key)
    return undefined
  }
  return filing.result
}

/**
 * Record a filing under `key` — call it synchronously right after
 * `priorFiling` comes back empty, before any await, so a concurrent request
 * sees it. A filing that resolves to null is dropped, so a retry files.
 */
export function rememberFiling(
  key: string,
  result: Promise<FiledReport | null>,
  now = Date.now()
): void {
  const filing: Filing = { at: now, result }
  filings.set(key, filing)
  void result.then((filed) => {
    if (filed === null && filings.get(key) === filing) filings.delete(key)
  })
}

/** Test seam: forget every filing. */
export function resetFilings(): void {
  filings.clear()
}
