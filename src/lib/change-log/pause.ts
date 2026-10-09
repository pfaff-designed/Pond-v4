/**
 * Grouping by pause — what "one edit" means to the change log.
 *
 * `Pond 06.17` 6q frame 11: "your own edits apply as you type, grouped by pause
 * in the change log." Writes still land on every keystroke; the LOG gets one
 * record per pause, whose `before` is what stood before the first edit of the
 * run and whose `after` is what the last one left.
 *
 * The page editor's debounced save already is a pause (one save = one record),
 * so it only borrows {@link EDIT_PAUSE_MS}. Record edits write through per
 * keystroke with no debounce, so they group here.
 */

/** How long the person stops before a run of edits counts as one. */
export const EDIT_PAUSE_MS = 600

export interface PauseGroups<T> {
  /** One more edit to `key`. An open group keeps its first `before` and takes this `after`. */
  note: (key: string, before: T | null, after: T) => void
  /** Drop `key`'s open group without closing it — its writes did not land. */
  discard: (key: string) => void
  /** Close every open group now, as if the person had paused. */
  flush: () => void
}

interface OpenGroup<T> {
  before: T | null
  after: T
  timer: ReturnType<typeof setTimeout>
}

export const groupByPause = <T>(
  onPause: (before: T | null, after: T) => void,
  pauseMs: number = EDIT_PAUSE_MS
): PauseGroups<T> => {
  const open = new Map<string, OpenGroup<T>>()

  const close = (key: string) => {
    const group = open.get(key)
    if (!group) return
    clearTimeout(group.timer)
    open.delete(key)
    onPause(group.before, group.after)
  }

  const note = (key: string, before: T | null, after: T) => {
    const group = open.get(key)
    if (group) clearTimeout(group.timer)
    open.set(key, {
      before: group ? group.before : before,
      after,
      timer: setTimeout(() => close(key), pauseMs),
    })
  }

  const discard = (key: string) => {
    const group = open.get(key)
    if (!group) return
    clearTimeout(group.timer)
    open.delete(key)
  }

  const flush = () => {
    for (const key of [...open.keys()]) close(key)
  }

  return { note, discard, flush }
}
