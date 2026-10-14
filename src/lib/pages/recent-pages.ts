/**
 * The ⌘K palette's recency list (`Pond 02` 2g: "before anything is typed: the
 * last three pages"), moved out of `ShellCommands.tsx` so the composer's @
 * picker (KAN-99) can read the same localStorage key without restating it.
 */

const RECENT_PAGES_KEY = 'pond:recent-pages'
const RECENT_MAX = 3

interface RecentEntry {
  id: string
  type: string
  title: string
}

function readRecents(): RecentEntry[] {
  try {
    // Capped on read as well as on write: a list written under an older, larger cap
    // would otherwise list whole until the next page is opened from the palette.
    const stored: RecentEntry[] = JSON.parse(window.localStorage.getItem(RECENT_PAGES_KEY) ?? '[]')
    return stored.slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

/** Ids only, newest first — what the palette and the @ picker both need. */
export function readRecentPageIds(): string[] {
  return readRecents().map((r) => r.id)
}

export function writeRecent(entry: RecentEntry) {
  try {
    const prev = readRecents().filter((r) => r.id !== entry.id)
    window.localStorage.setItem(
      RECENT_PAGES_KEY,
      JSON.stringify([entry, ...prev].slice(0, RECENT_MAX))
    )
  } catch {
    /* ignore */
  }
}
