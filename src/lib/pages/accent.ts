/**
 * The Press muted accent set (sage · slate · gold · clay · mauve · olive) and
 * the deterministic page→accent mapping the rail dots and overview cards share.
 * A page is colored by its top-level ancestor, so a whole area reads as one hue.
 */

const PAGE_ACCENTS = ['#5f7355', '#6b7a86', '#8a7a4a', '#9a6b43', '#8a6b74', '#7d8a5f']

/** Deterministic muted accent for a page id — stable across renders and sessions. */
export function pageAccent(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PAGE_ACCENTS[h % PAGE_ACCENTS.length]
}

/** Walk parent links up to the top-level ancestor (the page itself if root). */
export function rootAncestorId(id: string, parentById: ReadonlyMap<string, string | null>): string {
  let current = id
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    const parent = parentById.get(current)
    if (!parent) return current
    current = parent
  }
  return current // cycle guard — malformed data, color by where we stopped
}
