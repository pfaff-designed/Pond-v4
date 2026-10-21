/**
 * Grouping by pause — what "one edit" means to the change log.
 *
 * Writes land on every keystroke; the LOG gets one record per pause, from what
 * was stored before the first change of the run to what its landed changes
 * stored after it. A record says only what the database kept, so a group is
 * keyed to its writes settling, not to the keystrokes:
 *
 * - it closes once the person has paused AND none of its writes is in flight;
 * - a refused write drops that one change, and the rest of the run still counts;
 * - the next group starts from the last stored value, even while the view still
 *   shows a refused one (nothing has reloaded it yet).
 *
 * The page editor's debounced save already is a pause (one save = one record),
 * so it only borrows {@link EDIT_PAUSE_MS}. Record edits write through per
 * keystroke with no debounce, so they group here.
 */

import { jsonEqual } from '@/lib/json-equal'

/** How long the person stops before a run of edits counts as one. */
export const EDIT_PAUSE_MS = 600

export interface PauseGroupsOptions<State, Patch, Origin, Result = void> {
  /** Fold one change into a state; `null` is "does not exist yet". */
  apply: (state: State | null, patch: Patch) => State | null
  /** One closed group: what was stored before the run, what its landed changes stored.
   *  Its return (or resolved value) is what `change`'s promise settles to, for every
   *  call that ended up in this group. */
  onPause: (before: State | null, after: State, origin: Origin | null) => Result | Promise<Result>
  pauseMs?: number
}

export interface PauseChange<State, Patch, Origin> {
  key: string
  /** What the view held just before this change — the run's `before` if it opens one. */
  current: State | null
  patch: Patch
  /** The write persisting this change. */
  write: Promise<unknown>
  /** Where the change was made; the group keeps the latest one it was told. */
  origin?: Origin | null
}

export interface PauseGroups<State, Patch, Origin, Result = void> {
  /** Resolves to `onPause`'s result once the group this change joins closes — or
   *  `undefined` if the group never calls `onPause` (every write in it refused, or
   *  it nets no change). */
  change: (change: PauseChange<State, Patch, Origin>) => Promise<Result | undefined>
  /** Forget `key`'s open group: nothing it did is logged, whenever its writes land. */
  drop: (key: string) => void
  /** Pause every open group now. Each still closes only once its writes have settled. */
  flush: () => void
  /**
   * Pause and detach `key`'s open group right now, instead of waiting for its
   * pauseMs timer — and detach it so a `change` call made for `key` right after
   * this one starts a fresh group, never folding into the one just closed. The
   * detached group still closes itself (and calls `onPause`) once its own
   * writes settle; closing it early only stops it accepting more changes.
   */
  closeKey: (key: string) => void
}

type WriteStatus = 'pending' | 'landed' | 'refused'

interface Entry<Patch> {
  patch: Patch
  status: WriteStatus
}

interface OpenGroup<State, Patch, Origin, Result> {
  before: State | null
  entries: Entry<Patch>[]
  origin: Origin | null
  paused: boolean
  /** Set once this group has run its close (or been dropped) — never a second time,
   *  however many times a late-settling write re-triggers `close`. */
  closed: boolean
  timer: ReturnType<typeof setTimeout> | null
  /** One `change` caller per entry in this group, waiting for `onPause`'s result. */
  waiters: Array<(result: Result | undefined) => void>
}

/** A run that ended with a refusal: what was stored, and what the view was left holding. */
interface Refusal<State> {
  stored: State | null
  shown: State | null
}

export const groupByPause = <State, Patch, Origin, Result = void>({
  apply,
  onPause,
  pauseMs = EDIT_PAUSE_MS,
}: PauseGroupsOptions<State, Patch, Origin, Result>): PauseGroups<State, Patch, Origin, Result> => {
  const open = new Map<string, OpenGroup<State, Patch, Origin, Result>>()
  const refusals = new Map<string, Refusal<State>>()

  const fold = (from: State | null, entries: Entry<Patch>[]) =>
    entries.reduce((state, entry) => apply(state, entry.patch), from)

  const resolveWaiters = (group: OpenGroup<State, Patch, Origin, Result>, result: Result | undefined) => {
    for (const resolve of group.waiters) resolve(result)
    group.waiters = []
  }

  const close = (key: string, group: OpenGroup<State, Patch, Origin, Result>) => {
    if (group.closed) return
    if (!group.paused || group.entries.some((entry) => entry.status === 'pending')) return
    group.closed = true
    if (open.get(key) === group) open.delete(key)

    const landed = group.entries.filter((entry) => entry.status === 'landed')
    const stored = fold(group.before, landed)
    const shown = fold(group.before, group.entries)
    if (!jsonEqual(stored, shown)) refusals.set(key, { stored, shown })

    if (landed.length === 0 || stored === null) {
      resolveWaiters(group, undefined)
      return
    }
    void Promise.resolve(onPause(group.before, stored, group.origin)).then((result) =>
      resolveWaiters(group, result)
    )
  }

  const pause = (key: string, group: OpenGroup<State, Patch, Origin, Result>) => {
    if (group.timer) clearTimeout(group.timer)
    group.timer = null
    group.paused = true
    close(key, group)
  }

  const openGroup = (key: string, current: State | null): OpenGroup<State, Patch, Origin, Result> => {
    const refusal = refusals.get(key)
    refusals.delete(key)
    const before = refusal && jsonEqual(refusal.shown, current) ? refusal.stored : current
    const group: OpenGroup<State, Patch, Origin, Result> = {
      before,
      entries: [],
      origin: null,
      paused: false,
      closed: false,
      timer: null,
      waiters: [],
    }
    open.set(key, group)
    return group
  }

  const change = ({
    key,
    current,
    patch,
    write,
    origin,
  }: PauseChange<State, Patch, Origin>): Promise<Result | undefined> => {
    const group = open.get(key) ?? openGroup(key, current)
    const entry: Entry<Patch> = { patch, status: 'pending' }
    group.entries.push(entry)
    group.origin = origin ?? group.origin
    group.paused = false
    if (group.timer) clearTimeout(group.timer)
    group.timer = setTimeout(() => pause(key, group), pauseMs)

    const result = new Promise<Result | undefined>((resolve) => group.waiters.push(resolve))

    const settle = (status: WriteStatus) => {
      entry.status = status
      close(key, group)
    }
    write.then(
      () => settle('landed'),
      () => settle('refused')
    )
    return result
  }

  const drop = (key: string) => {
    const group = open.get(key)
    if (group) {
      if (group.timer) clearTimeout(group.timer)
      group.closed = true
      resolveWaiters(group, undefined)
    }
    open.delete(key)
    refusals.delete(key)
  }

  const closeKey = (key: string) => {
    const group = open.get(key)
    if (!group) return
    open.delete(key)
    pause(key, group)
  }

  const flush = () => {
    for (const key of [...open.keys()]) closeKey(key)
  }

  return { change, drop, flush, closeKey }
}
