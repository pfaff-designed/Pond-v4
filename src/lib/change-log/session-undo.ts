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
}

/**
 * What `undo()` / `redo()` did. A `blocked` step stays on top, so it runs again
 * once the obstacle is cleared. A `stale` or `refused` step is dropped: the log
 * only grows, so it cannot succeed later — revert from the change log instead.
 */
export type SessionUndoOutcome = { outcome: 'empty' } | (StepResult & { step: HistoryStep })

export interface SessionUndo {
  /** Make one action's records the next thing undo takes back in its pond. Clears that pond's redo. */
  remember: (step: HistoryStep) => void
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
  undo: HistoryStep[]
  redo: HistoryStep[]
  /** Bumped by every `remember`; a result that finds it moved arrived too late. */
  generation: number
  snapshot: SessionUndoSnapshot
}

const EMPTY: SessionUndoSnapshot = { canUndo: false, canRedo: false }

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
  const listeners = new Set<() => void>()
  let queue: Promise<unknown> = Promise.resolve()

  const historyOf = (pondId: string): PondHistory => {
    const existing = histories.get(pondId)
    if (existing) return existing
    const created: PondHistory = { undo: [], redo: [], generation: 0, snapshot: EMPTY }
    histories.set(pondId, created)
    return created
  }

  const notify = (history?: PondHistory) => {
    if (history) {
      history.snapshot = { canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 }
    }
    for (const listener of listeners) listener()
  }

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task)
    queue = next.catch(() => undefined)
    return next
  }

  /** Pops at run time, not call time, so queued calls each take the then-newest step. */
  const runQueued = (pondId: string, direction: 'undo' | 'redo'): Promise<SessionUndoOutcome> =>
    enqueue(async () => {
      const history = histories.get(pondId)
      const from = direction === 'undo' ? history?.undo : history?.redo
      const taken = from?.pop()
      if (!history || !from || taken === undefined) return { outcome: 'empty' }
      const takenFrom = from.length
      const undoDepth = history.undo.length
      const generation = history.generation
      notify(history)

      const current = () => histories.get(pondId) === history
      // Nothing was written, so it is still applied (undo) or still undone (redo)
      // and goes back where it was — unless the history was cleared, or a new
      // change has emptied redo.
      const putBack = () => {
        if (!current() || (direction === 'redo' && history.generation !== generation)) return
        from.splice(Math.min(takenFrom, from.length), 0, taken)
        notify(history)
      }
      let result: StepResult
      try {
        // A call that times out may still land later: it already ran putBack,
        // so the step is back on the stack, and the next ⌘Z on it comes back
        // `refused already-undone` and is dropped — not undone twice.
        result = await withTimeout(run[direction](taken), timeoutMs)
      } catch (err) {
        putBack()
        throw err
      }
      if (result.outcome === 'blocked') putBack()
      if (result.outcome === 'done' && current()) {
        if (direction === 'undo' && history.generation === generation) {
          history.redo.push(taken)
        }
        if (direction === 'redo') {
          // Beneath anything remembered while it ran: those happened after it.
          const redone = { pondId, recordIds: result.records.map((r) => r.id) }
          history.undo.splice(Math.min(undoDepth, history.undo.length), 0, redone)
        }
        notify(history)
      }
      return { ...result, step: taken }
    })

  return {
    remember: (step) => {
      if (step.recordIds.length === 0) return
      const history = historyOf(step.pondId)
      history.undo.push(step)
      history.redo.length = 0
      history.generation += 1
      notify(history)
    },
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
