/**
 * Staged-deletion id registry (KAN-300).
 *
 * Tracks page ids whose delete is staged behind the undo grace window
 * (deferred-commit.ts) so other reads can filter them out and a reload can
 * finish a commit a `pagehide` flush didn't reach in time. Mirrored to
 * `sessionStorage` so the set survives a reload; every storage read/write is
 * wrapped in try/catch so a disabled/unavailable Storage (private browsing,
 * quota) degrades to in-memory-only staging instead of throwing.
 */

const STORAGE_KEY = 'pond:pending-deletes'

let staged = new Set<string>()
let loaded = false
/** Snapshot of ids present in storage at this script's own first hydrate — a
 *  genuine prior tab life's leftovers, never an id staged later in this same
 *  script execution (that one still has a live toast somewhere). */
let priorLife = new Set<string>()

function readStorage(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function writeStorage(ids: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // storage unavailable — staging still works in-memory for this session
  }
}

/** Lazily hydrates from sessionStorage on first use (not at module import, which may run before storage exists). */
function ensureLoaded(): void {
  if (loaded) return
  staged = readStorage()
  priorLife = new Set(staged)
  loaded = true
}

type StagedListener = () => void

const stagedListeners = new Set<StagedListener>()
let stagedVersion = 0

function notifyStaged(): void {
  stagedVersion++
  for (const listener of stagedListeners) listener()
}

/**
 * Subscribes to every `stageId`/`unstageId` change (for `useSyncExternalStore`
 * readers). Returns an unsubscribe function.
 */
export function subscribeStaged(listener: StagedListener): () => void {
  stagedListeners.add(listener)
  return () => {
    stagedListeners.delete(listener)
  }
}

/** Bumped on every `stageId`/`unstageId` call — a snapshot value for `useSyncExternalStore`. */
export function stagedVersionNow(): number {
  return stagedVersion
}

export function stageId(id: string): void {
  ensureLoaded()
  staged.add(id)
  writeStorage(staged)
  notifyStaged()
}

export function unstageId(id: string): void {
  ensureLoaded()
  staged.delete(id)
  writeStorage(staged)
  notifyStaged()
}

export function isStaged(id: string): boolean {
  ensureLoaded()
  return staged.has(id)
}

export function stagedIds(): string[] {
  ensureLoaded()
  return [...staged]
}

/**
 * Ids left staged from BEFORE this script ever ran (a real reload/new tab
 * life), filtered to those still staged now. A mount-time sweep should only
 * ever hard-commit these — an id staged during this same script execution
 * still has a live toast/undo path somewhere, and sweeping it out from under
 * a remount would delete something Undo can still reach.
 */
export function priorLifeIds(): string[] {
  ensureLoaded()
  return [...priorLife].filter((id) => staged.has(id))
}

/**
 * Commit promises for deletes currently writing (KAN-310 gap 2): once a
 * grace timer fires, the provider's own `remove(id)` drops the toast from
 * `toastsRef` immediately, before the commit's write has resolved — so a
 * `flushStagedDeletes` that only re-scans the provider's pending-toast list
 * can race a commit that is in flight but no longer has a toast to show for
 * it. Tracked here instead, keyed by the page's backstop id, independent of
 * any toast's lifetime.
 */
const inFlightCommits = new Map<string, Promise<void>>()

/**
 * Registers a delete's commit promise as in-flight so {@link flushStagedDeletes}
 * can await it even after its toast is gone. Call the moment the commit
 * starts (before the toast can be removed), not after it resolves. Settles
 * itself out of the map once the commit settles, success or failure — a
 * failed commit must not wedge every future flush waiting on a promise that
 * will never resolve again.
 */
export function trackCommit(id: string, promise: Promise<void>): void {
  const tracked = promise.catch(() => undefined)
  inFlightCommits.set(id, tracked)
  void tracked.finally(() => {
    if (inFlightCommits.get(id) === tracked) inFlightCommits.delete(id)
  })
}

type StagedFlusher = () => Promise<void>

/** The one mounted `DeletionUndoProvider`'s commit-every-staged-deletion function (KAN-273). */
let stagedFlusher: StagedFlusher | null = null

/**
 * Registers the function that commits every currently-staged deletion right
 * now (`DeletionUndoProvider`, on mount). Returns an unregister function for
 * the provider's unmount cleanup. Framework-agnostic so `lib/pages/client.ts`
 * can call {@link flushStagedDeletes} without importing React.
 */
export function registerStagedFlush(fn: StagedFlusher): () => void {
  stagedFlusher = fn
  return () => {
    if (stagedFlusher === fn) stagedFlusher = null
  }
}

/**
 * Commit every staged deletion ahead of a tree write that would otherwise
 * read a mid-delete sibling (KAN-273) — call at the top of a page-tree write,
 * never inside `deletePage` itself. A no-op when no provider is mounted (SSR,
 * a test harness with no `DeletionUndoProvider`) and nothing is tracked.
 *
 * Also awaits every `trackCommit`-registered promise still in flight, not
 * only the provider's currently-active toast list: a grace timer that has
 * already fired removes its toast before the commit it started resolves, so
 * the toast list alone can miss a write this caller needs to see land first.
 *
 * `stagedFlusher` (the provider's own flush, `useDeletionUndo.tsx`) passes
 * `'flush-driven'` into each committed toast's `flush()` itself (KAN-310) —
 * this registry no longer tracks "is a flush in flight" at all, so a write's
 * commit-first flush and its own outer write can run nested without this
 * module conflating the two.
 */
export function flushStagedDeletes(): Promise<void> {
  const tracked = [...inFlightCommits.values()]
  const flusherResult = stagedFlusher ? Promise.resolve(stagedFlusher()) : Promise.resolve()
  return Promise.allSettled([flusherResult, ...tracked]).then(() => undefined)
}
