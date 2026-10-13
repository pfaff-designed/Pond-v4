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

export function stageId(id: string): void {
  ensureLoaded()
  staged.add(id)
  writeStorage(staged)
}

export function unstageId(id: string): void {
  ensureLoaded()
  staged.delete(id)
  writeStorage(staged)
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
 * >0 while a {@link flushStagedDeletes} call (this registry's, not the
 * provider's own dismiss/scope/unmount flushes) is in flight. A depth, not a
 * boolean, in case a write's flush nests inside another's — settled before
 * the outer write's own writes get a chance to overlap in this single-flow
 * app, but cheap to make safe regardless.
 */
let flushDepth = 0

/**
 * True while a tree write's commit-first flush (this module's
 * `flushStagedDeletes`) is committing a staged deletion — i.e. `commitDelete`
 * is running NOT because its own grace window elapsed or its toast was
 * dismissed, but because some OTHER write (create/rename/move) needed it out
 * of the way first (KAN-273). Read by `Rail.tsx`'s `withUser` to skip that
 * commit's OWN pages-query invalidate: a refetch at that point would land
 * before the outer write's insert/update and revert its optimistic cache
 * change. The outer write's own invalidate (also `withUser`, one level up)
 * still runs once this has unwound back to 0.
 */
export function isFlushDrivenCommit(): boolean {
  return flushDepth > 0
}

/**
 * Commit every staged deletion ahead of a tree write that would otherwise
 * read a mid-delete sibling (KAN-273) — call at the top of a page-tree write,
 * never inside `deletePage` itself. A no-op when no provider is mounted (SSR,
 * a test harness with no `DeletionUndoProvider`).
 */
export function flushStagedDeletes(): Promise<void> {
  if (!stagedFlusher) return Promise.resolve()
  flushDepth++
  return Promise.resolve(stagedFlusher()).finally(() => {
    flushDepth--
  })
}
