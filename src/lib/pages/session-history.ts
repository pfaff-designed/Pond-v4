/**
 * The ⌘K `back`/`forward` rows' history — a stack of ids and a cursor, kept
 * by the shell itself rather than read from `window.history` (jsdom's
 * `history.back()`/`forward()` never traverse entries, so the native API
 * could never be proven by a path test; see KAN-568's PLAN notes).
 *
 * Pure so `back`/`forward`/re-recording the current id can each be a
 * table-of-cases test with no React or router involved.
 */

export interface SessionHistoryState {
  entries: string[]
  cursor: number
}

/** The history right after the first page opens — one entry, the cursor on it. */
export function initHistory(currentId: string): SessionHistoryState {
  return { entries: [currentId], cursor: 0 }
}

/**
 * Records a real navigation to `id`. A no-op when `id` is already the entry
 * under the cursor (re-recording the current page, e.g. an effect firing
 * without the id changing). Otherwise truncates any forward entries past the
 * cursor before appending — the standard back-then-browse-elsewhere stack
 * behaviour: a NEW visit after stepping back drops the old forward branch.
 */
export function recordVisit(state: SessionHistoryState, id: string): SessionHistoryState {
  if (state.entries[state.cursor] === id) return state
  const entries = [...state.entries.slice(0, state.cursor + 1), id]
  return { entries, cursor: entries.length - 1 }
}

/** The id one step back, or null at the stack's start — cursor unmoved on null. */
export function stepBack(state: SessionHistoryState): { state: SessionHistoryState; id: string } | null {
  if (state.cursor === 0) return null
  const cursor = state.cursor - 1
  return { state: { ...state, cursor }, id: state.entries[cursor] }
}

/** The id one step forward, or null at the stack's end — cursor unmoved on null. */
export function stepForward(state: SessionHistoryState): { state: SessionHistoryState; id: string } | null {
  if (state.cursor === state.entries.length - 1) return null
  const cursor = state.cursor + 1
  return { state: { ...state, cursor }, id: state.entries[cursor] }
}
