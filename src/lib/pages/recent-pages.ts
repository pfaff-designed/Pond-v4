/**
 * The ⌘K palette's recency list (`Pond 02` 2g: "before anything is typed: the
 * last three pages"), moved out of `ShellCommands.tsx` so the composer's @
 * picker (KAN-99) can read the same localStorage key without restating it.
 */

const RECENT_PAGES_PREFIX = 'pond:recent-pages:'
const RECENT_MAX = 20

/** How many of the stored 20 ever surface to a person — `Pond 02` 2g: "the last three pages". */
export const RECENT_SHOWN = 3

interface RecentEntry {
  id: string
  type: string
  title: string
}

// Scoped per pond: visiting another pond must not empty (or inherit) this one's list.
function recentPagesKey(pondId: string): string {
  return `${RECENT_PAGES_PREFIX}${pondId}`
}

function readRecents(pondId: string | null): RecentEntry[] {
  if (!pondId) return []
  try {
    // Capped on read as well as on write: a list written under an older, larger cap
    // would otherwise list whole until the next page is opened from the palette.
    const stored: RecentEntry[] = JSON.parse(
      window.localStorage.getItem(recentPagesKey(pondId)) ?? '[]'
    )
    return stored.slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

/** Ids only, newest first — what the palette and the @ picker both need. */
export function readRecentPageIds(pondId: string | null): string[] {
  return readRecents(pondId).map((r) => r.id)
}

export function writeRecent(entry: RecentEntry, pondId: string | null) {
  if (!pondId) return
  try {
    const prev = readRecents(pondId).filter((r) => r.id !== entry.id)
    window.localStorage.setItem(
      recentPagesKey(pondId),
      JSON.stringify([entry, ...prev].slice(0, RECENT_MAX))
    )
  } catch {
    /* ignore */
  }
}
