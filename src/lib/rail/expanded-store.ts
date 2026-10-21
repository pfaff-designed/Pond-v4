/**
 * Per-pond persistence for the rail's expanded rows (KAN-393, board `Pond 08
 * Edges` 8f: "What you open stays open"). One localStorage key per pond,
 * `pond:rail-expanded:<pondId>`, holding a JSON array of page ids ordered
 * oldest-to-newest-expanded so the cap can drop from the front.
 */

const EXPANDED_KEY_PREFIX = 'pond:rail-expanded:'
export const EXPANDED_CAP = 500

function keyForPond(pondId: string): string {
  return `${EXPANDED_KEY_PREFIX}${pondId}`
}

/** The stored ids for a pond, oldest-to-newest — or `[]` on missing, malformed, or blocked storage. */
export function readExpandedIds(pondId: string): string[] {
  try {
    const raw = window.localStorage.getItem(keyForPond(pondId))
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) return []
    return parsed
  } catch {
    return []
  }
}

/** Keeps the most-recently-expanded `EXPANDED_CAP` ids, dropping the oldest. */
function capExpandedIds(ids: string[]): string[] {
  return ids.length > EXPANDED_CAP ? ids.slice(ids.length - EXPANDED_CAP) : ids
}

/** Writes `ids` (oldest-to-newest) for a pond, capped. A blocked/throwing store is a no-op. */
export function writeExpandedIds(pondId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(keyForPond(pondId), JSON.stringify(capExpandedIds(ids)))
  } catch {
    /* ignore persistence failures */
  }
}

/** Drops ids no longer present in `validIds` — for reconciling against loaded pages on read. */
export function pruneExpandedIds(ids: string[], validIds: ReadonlySet<string>): string[] {
  return ids.filter((id) => validIds.has(id))
}
