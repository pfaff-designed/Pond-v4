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

export interface PauseGroupsOptions<State, Patch, Origin> {
  /** Fold one change into a state; `null` is "does not exist yet". */
  apply: (state: State | null, patch: Patch) => State | null
  /** One closed group: what was stored before the run, what its landed changes stored. */
  onPause: (before: State | null, after: State, origin: Origin | null) => void
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

export interface PauseGroups<State, Patch, Origin> {
  change: (change: PauseChange<State, Patch, Origin>) => void
  /** Forget `key`'s open group: nothing it did is logged, whenever its writes land. */
  drop: (key: string) => void
  /** Pause every open group now. Each still closes only once its writes have settled. */
  flush: () => void
}

type WriteStatus = 'pending' | 'landed' | 'refused'

interface Entry<Patch> {
  patch: Patch
  status: WriteStatus
}

interface OpenGroup<State, Patch, Origin> {
  before: State | null
  entries: Entry<Patch>[]
  origin: Origin | null
  paused: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/** A run that ended with a refusal: what was stored, and what the view was left holding. */
interface Refusal<State> {
  stored: State | null
  shown: State | null
}

export const groupByPause = <State, Patch, Origin>({
  apply,
  onPause,
  pauseMs = EDIT_PAUSE_MS,
}: PauseGroupsOptions<State, Patch, Origin>): PauseGroups<State, Patch, Origin> => {
  const open = new Map<string, OpenGroup<State, Patch, Origin>>()
  const refusals = new Map<string, Refusal<State>>()

  const fold = (from: State | null, entries: Entry<Patch>[]) =>
    entries.reduce((state, entry) => apply(state, entry.patch), from)

  const close = (key: string, group: OpenGroup<State, Patch, Origin>) => {
    if (open.get(key) !== group) return
    if (!group.paused || group.entries.some((entry) => entry.status === 'pending')) return
    open.delete(key)

    const landed = group.entries.filter((entry) => entry.status === 'landed')
    const stored = fold(group.before, landed)
    const shown = fold(group.before, group.entries)
    if (!jsonEqual(stored, shown)) refusals.set(key, { stored, shown })

    if (landed.length === 0 || stored === null) return
    onPause(group.before, stored, group.origin)
  }

  const pause = (key: string, group: OpenGroup<State, Patch, Origin>) => {
    if (group.timer) clearTimeout(group.timer)
    group.timer = null
    group.paused = true
    close(key, group)
  }

  const openGroup = (key: string, current: State | null): OpenGroup<State, Patch, Origin> => {
    const refusal = refusals.get(key)
    refusals.delete(key)
    const before = refusal && jsonEqual(refusal.shown, current) ? refusal.stored : current
    const group: OpenGroup<State, Patch, Origin> = {
      before,
      entries: [],
      origin: null,
      paused: false,
      timer: null,
    }
    open.set(key, group)
    return group
  }

  const change = ({ key, current, patch, write, origin }: PauseChange<State, Patch, Origin>) => {
    const group = open.get(key) ?? openGroup(key, current)
    const entry: Entry<Patch> = { patch, status: 'pending' }
    group.entries.push(entry)
    group.origin = origin ?? group.origin
    group.paused = false
    if (group.timer) clearTimeout(group.timer)
    group.timer = setTimeout(() => pause(key, group), pauseMs)

    const settle = (status: WriteStatus) => {
      entry.status = status
      close(key, group)
    }
    write.then(
      () => settle('landed'),
      () => settle('refused')
    )
  }

  const drop = (key: string) => {
    const group = open.get(key)
    if (group?.timer) clearTimeout(group.timer)
    open.delete(key)
    refusals.delete(key)
  }

  const flush = () => {
    for (const [key, group] of [...open.entries()]) pause(key, group)
  }

  return { change, drop, flush }
}
