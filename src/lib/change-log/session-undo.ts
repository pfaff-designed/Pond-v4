'use client'

/**
 * The session's undo history: per pond, a stack of steps, each the change-log
 * record ids one action made.
 *
 * Undo covers the session, until the tab or app closes; after that, revert from
 * the change log. So the history lives in memory only; the log is what outlasts it.
 *
 * Keyed by pond — nothing crosses between ponds — so ⌘Z in one pond never takes
 * back a step made in another, and switching away and back keeps both histories. A shell-level key handler passes the active pond:
 * `undo(pondId)`, `redo(pondId)`, `useSessionUndo(pondId)`. Features that make an
 * undoable change hand its records to `remember`. Calls run one after another,
 * so a quick ⌘Z ⌘Z takes back two steps in order.
 */

import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { redoStep, undoStep, type HistoryStep, type StepResult } from './undo'

export interface SessionUndoSnapshot {
  canUndo: boolean
  canRedo: boolean
  /** The record ids of the step undo would take next — a caller that remembers
   *  its own step's record id can tell whether IT is what undo would hit, not
   *  just that the stack is non-empty. Empty when `canUndo` is false. */
  topUndoRecordIds: readonly string[]
  /** Every record id across the whole redo stack, not just its top — a step
   *  sinks below later ones as more are undone, but it still sits ON the redo
   *  stack, which is what a caller needs to know its own step left undo this way. */
  redoRecordIds: readonly string[]
}

/**
 * What `undo()` / `redo()` did. A `blocked` step stays on top, so it runs again
 * once the obstacle is cleared. A `stale` or `refused` step is dropped: the log
 * only grows, so it cannot succeed later — revert from the change log instead.
 * `empty` also covers a pending step that resolved to nothing written.
 */
export type SessionUndoOutcome = { outcome: 'empty' } | (StepResult & { step: HistoryStep })

/**
 * A step remembered the instant its action starts, before the write's round
 * trip returns — `recordIds` resolves once it lands. `undo`/`redo` await it
 * before calling the RPC; a resolution of `null` means the write made nothing
 * (the same case `persistBlocksAsOwnEdit` treats as "remember nothing"), so the
 * step is dropped rather than retried.
 */
export interface PendingHistoryStep {
  pondId: string
  recordIds: Promise<readonly string[] | null>
  /** Same as `HistoryStep`'s — carried over onto the settled step once `recordIds` resolves. */
  onUndone?: () => Promise<void> | void
  onRedone?: () => Promise<void> | void
  /**
   * The write that reserved this slot failed and is waiting to be retried
   * (KAN-495). ⌘Z puts the step back and resolves empty instead of waiting
   * out a promise the retry will fill — the slot stays in its original
   * place so that retry does not land a second step on top.
   */
  attemptFailed?: boolean
}

type StackStep = HistoryStep | PendingHistoryStep

const isPending = (step: StackStep): step is PendingHistoryStep => !Array.isArray(step.recordIds)

/** A step's settled shape: `onUndone`/`onRedone` travel with it, `attemptFailed` never does. */
const settledStep = (step: StackStep, recordIds: readonly string[]): HistoryStep => ({
  pondId: step.pondId,
  recordIds,
  onUndone: step.onUndone,
  onRedone: step.onRedone,
})

/**
 * Whether a pending step's `recordIds` had already resolved before THIS press
 * started popping it, set by a `.then()` attached the moment `rememberPending`
 * pushes it — not by awaiting `recordIds` at pop time, which would always read
 * as "settled" once we're past the await. A step still genuinely in flight when
 * the press reaches it (false here) resolving to nothing written means the
 * press's own target action made nothing, so it must not fall through to an
 * older, unrelated step; a step that was already dead on the stack before the
 * press ever touched it (true here) is safe to skip transparently.
 */
const pendingSettled = new WeakMap<PendingHistoryStep, boolean>()

/**
 * The step object `rememberPending` just pushed, held by reference — a caller
 * that stages its own undo control (a toast) can ask `isTopUndo` whether THIS
 * step is still what a ⌘Z would hit, rather than blindly taking the current
 * top of the stack (which may by then be a later step, or this one already
 * moved to redo).
 */
export type UndoHandle = object

export interface SessionUndo {
  /** Make one action's records the next thing undo takes back in its pond. Clears that pond's redo. */
  remember: (step: HistoryStep) => void
  /** A `remember` for this pond is still in flight (e.g. the own-edit record a
   *  save is still appending) — `undo`/`redo` wait for it before taking a step,
   *  so a ⌘Z that lands in the gap between the save resolving and its record's
   *  `remember` call never takes the WRONG step. Self-removing: callers hand in
   *  the promise once and never clear it themselves. */
  trackPending: (pondId: string, pending: Promise<unknown>) => void
  /** Same as `remember`, for a step whose record ids are still in flight. Returns a handle for `isTopUndo`. */
  rememberPending: (step: PendingHistoryStep) => UndoHandle
  /** Every still-open pending step in `pondId` failed with its write and is
   *  waiting to be retried in place. ⌘Z resolves empty until one is filled. */
  markPendingFailed: (pondId: string) => void
  /** Whether `handle` (from `rememberPending`) is still the step undo would take next in `pondId`. */
  isTopUndo: (pondId: string, handle: UndoHandle) => boolean
  /** Like `undo`, but only acts on `handle`'s own step, re-checked at its own
   *  turn in the queue (a click's `isTopUndo` read can go stale behind
   *  already-queued ⌘Zs) — `empty`, with no fall-through, if it's not on top
   *  by then or its write resolved to nothing. */
  undoHandle: (pondId: string, handle: UndoHandle) => Promise<SessionUndoOutcome>
  undo: (pondId: string) => Promise<SessionUndoOutcome>
  redo: (pondId: string) => Promise<SessionUndoOutcome>
  clear: () => void
  subscribe: (listener: () => void) => () => void
  getSnapshot: (pondId: string) => SessionUndoSnapshot
}

export interface SessionUndoRunner {
  undo: (step: HistoryStep) => Promise<StepResult>
  redo: (step: HistoryStep) => Promise<StepResult>
}

interface PondHistory {
  undo: StackStep[]
  redo: StackStep[]
  /** Bumped by every `remember`; a result that finds it moved arrived too late. */
  generation: number
  snapshot: SessionUndoSnapshot
}

const EMPTY: SessionUndoSnapshot = {
  canUndo: false,
  canRedo: false,
  topUndoRecordIds: [],
  redoRecordIds: [],
}

/** One hung RPC must not freeze every later ⌘Z/⇧⌘Z in the tab. */
export const STEP_TIMEOUT_MS = 10_000

export class SessionUndoTimeoutError extends Error {
  constructor() {
    super('undo/redo timed out')
    this.name = 'SessionUndoTimeoutError'
  }
}

export interface SessionUndoOptions {
  timeoutMs?: number
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SessionUndoTimeoutError()), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })

export const createSessionUndo = (
  run: SessionUndoRunner,
  options: SessionUndoOptions = {}
): SessionUndo => {
  const timeoutMs = options.timeoutMs ?? STEP_TIMEOUT_MS
  let histories = new Map<string, PondHistory>()
  const pending = new Map<string, Set<Promise<unknown>>>()
  const listeners = new Set<() => void>()
  let queue: Promise<unknown> = Promise.resolve()

  const historyOf = (pondId: string): PondHistory => {
    const existing = histories.get(pondId)
    if (existing) return existing
    const created: PondHistory = { undo: [], redo: [], generation: 0, snapshot: EMPTY }
    histories.set(pondId, created)
    return created
  }

  // A pending step's ids aren't known yet — it reports as empty until it resolves.
  const settledIdsOf = (step: StackStep): readonly string[] =>
    isPending(step) ? [] : step.recordIds

  const notify = (history?: PondHistory) => {
    if (history) {
      const top = history.undo.at(-1)
      history.snapshot = {
        canUndo: history.undo.length > 0,
        canRedo: history.redo.length > 0,
        topUndoRecordIds: top ? settledIdsOf(top) : [],
        redoRecordIds: history.redo.flatMap(settledIdsOf),
      }
    }
    for (const listener of listeners) listener()
  }

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task)
    queue = next.catch(() => undefined)
    return next
  }

  /** Pops at run time, not call time, so queued calls each take the
   *  then-newest step. `targetHandle` (`undoHandle`) restricts this to that
   *  one step, re-checked here since a call ahead of it in the queue may
   *  have changed what's on top since the caller asked. */
  const runQueued = (
    pondId: string,
    direction: 'undo' | 'redo',
    targetHandle?: UndoHandle
  ): Promise<SessionUndoOutcome> =>
    enqueue(async () => {
      // Wait out every `remember` still being logged for this pond FIRST, before
      // reading the stack at all — the record that `remember` is about to push
      // may be the step this call is meant to take. Bounded: a hung append (no
      // timeout of its own) must not freeze every later ⌘Z/⇧⌘Z in the tab.
      const inFlight = pending.get(pondId)
      if (inFlight && inFlight.size > 0) {
        await withTimeout(Promise.allSettled([...inFlight]), timeoutMs).catch(() => {})
      }
      const history = histories.get(pondId)
      if (!history) return { outcome: 'empty' }
      const from = direction === 'undo' ? history.undo : history.redo
      const current = () => histories.get(pondId) === history

      // A pending step that resolves to nothing written is dropped, not
      // reported as `empty` — real steps may still sit beneath it on the stack.
      while (true) {
        if (targetHandle !== undefined && from.at(-1) !== targetHandle) return { outcome: 'empty' }
        const taken = from.pop()
        if (taken === undefined) return { outcome: 'empty' }
        const takenFrom = from.length
        const undoDepth = history.undo.length
        const generation = history.generation
        notify(history)

        const putTakenBack = (toPutBack: StackStep) => {
          if (!current()) return
          from.splice(Math.min(takenFrom, from.length), 0, toPutBack)
          notify(history)
        }

        // A pending step's write hasn't landed yet — wait for it before calling
        // the RPC, under the same timeout as the RPC itself: a hung write must
        // not stall every later ⌘Z/⇧⌘Z behind it in the queue.
        let step: HistoryStep
        if (isPending(taken)) {
          // A halted write has no record yet and will be retried in this
          // same slot. Waiting here parks ⌘Z until the timeout; putting the
          // step back leaves the retry able to fill it in place.
          if (taken.attemptFailed && pendingSettled.get(taken) !== true) {
            putTakenBack(taken)
            return { outcome: 'empty' }
          }
          const settledBeforePress = pendingSettled.get(taken) === true
          let recordIds: readonly string[] | null
          try {
            recordIds = await withTimeout(taken.recordIds, timeoutMs)
          } catch (err) {
            putTakenBack(taken)
            throw err
          }
          if (!recordIds || recordIds.length === 0) {
            // A handle-targeted call stops here rather than falling through —
            // its own step resolving to nothing written means there is
            // nothing for IT to take back, regardless of the stack beneath it.
            if (targetHandle === undefined && settledBeforePress) continue
            return { outcome: 'empty' }
          }
          step = settledStep(taken, recordIds)
        } else {
          step = taken
        }

        // Nothing was written, so it is still applied (undo) or still undone (redo)
        // and goes back where it was — unless the history was cleared, or a new
        // change has emptied redo.
        const putBack = () => {
          if (direction === 'redo' && history.generation !== generation) return
          putTakenBack(step)
        }
        let result: StepResult
        try {
          // A call that times out may still land later: it already ran putBack,
          // so the step is back on the stack, and the next ⌘Z on it comes back
          // `refused already-undone` and is dropped — not undone twice.
          result = await withTimeout(run[direction](step), timeoutMs)
        } catch (err) {
          putBack()
          throw err
        }
        if (result.outcome === 'blocked') putBack()
        if (result.outcome === 'done') {
          // The RPC already landed: losing the step here would strand it off
          // both stacks even though the write succeeded, so a broken side
          // effect is logged, not thrown.
          try {
            if (direction === 'undo') await step.onUndone?.()
            else await step.onRedone?.()
          } catch (err) {
            console.error(err)
          }
        }
        if (result.outcome === 'done' && current()) {
          if (direction === 'undo' && history.generation === generation) {
            history.redo.push(step)
          }
          if (direction === 'redo') {
            // Beneath anything remembered while it ran: those happened after it.
            const redone = settledStep(
              step,
              result.records.map((r) => r.id)
            )
            history.undo.splice(Math.min(undoDepth, history.undo.length), 0, redone)
          }
          notify(history)
        }
        return { ...result, step }
      }
    })

  const rememberStep = (step: StackStep) => {
    const history = historyOf(step.pondId)
    history.undo.push(step)
    history.redo.length = 0
    history.generation += 1
    notify(history)
  }

  return {
    remember: (step) => {
      if (step.recordIds.length === 0) return
      rememberStep(step)
    },
    trackPending: (pondId, promise) => {
      const set = pending.get(pondId) ?? new Set<Promise<unknown>>()
      pending.set(pondId, set)
      set.add(promise)
      const clear = () => set.delete(promise)
      // `.then(clear, clear)`, not `.finally`: the latter's own returned promise
      // re-rejects on a rejected `promise`, which nothing here consumes.
      promise.then(clear, clear)
    },
    rememberPending: (step) => {
      pendingSettled.set(step, false)
      step.recordIds.then(
        () => pendingSettled.set(step, true),
        () => pendingSettled.set(step, true)
      )
      rememberStep(step)
      return step
    },
    markPendingFailed: (pondId) => {
      const history = histories.get(pondId)
      if (!history) return
      for (const step of history.undo) {
        if (isPending(step) && pendingSettled.get(step) !== true) step.attemptFailed = true
      }
    },
    isTopUndo: (pondId, handle) => histories.get(pondId)?.undo.at(-1) === handle,
    undoHandle: (pondId, handle) => runQueued(pondId, 'undo', handle),
    undo: (pondId) => runQueued(pondId, 'undo'),
    redo: (pondId) => runQueued(pondId, 'redo'),
    clear: () => {
      histories = new Map()
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: (pondId) => histories.get(pondId)?.snapshot ?? EMPTY,
  }
}

/**
 * Empty `undo` on `pagehide`. A closed tab loses its memory anyway; this only
 * matters when the page is kept in the back/forward cache and restored, which
 * would otherwise bring the old history back with it. Returns the release.
 */
export const clearOnPageHide = (target: Window, undo: SessionUndo): (() => void) => {
  const handlePageHide = () => undo.clear()
  target.addEventListener('pagehide', handlePageHide)
  return () => target.removeEventListener('pagehide', handlePageHide)
}

/** The tab's history. */
export const sessionUndo: SessionUndo = createSessionUndo({
  undo: (step) => undoStep(createClient(), step),
  redo: (step) => redoStep(createClient(), step),
})

if (typeof window !== 'undefined') clearOnPageHide(window, sessionUndo)

/** `canUndo` / `canRedo` in a pond, re-rendering when either changes. No pond, no history. */
export const useSessionUndo = (pondId: string | null): SessionUndoSnapshot =>
  useSyncExternalStore(
    sessionUndo.subscribe,
    () => (pondId === null ? EMPTY : sessionUndo.getSnapshot(pondId)),
    () => EMPTY
  )
