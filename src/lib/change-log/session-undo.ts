'use client'

/**
 * The session's undo history (KAN-93): per pond, a stack of steps, each the
 * change-log record ids one action made.
 *
 * AUDIT C1: "undo covers the session, until the tab or app closes. After that,
 * revert from the change log." So the history lives in memory only and is
 * emptied on `pagehide`; the log is what outlasts it.
 *
 * Keyed by pond — `s6m5`: nothing crosses between ponds — so ⌘Z in one pond
 * never takes back a step made in another, and switching away and back keeps
 * both histories. A shell-level key handler passes the active pond:
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

/** What `undo()` / `redo()` did. A `stale` or `refused` step is dropped: the log
 *  only grows, so it cannot succeed later — revert from the change log instead. */
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

export const createSessionUndo = (run: SessionUndoRunner): SessionUndo => {
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
      let result: StepResult
      try {
        result = await run[direction](taken)
      } catch (err) {
        // Still applied (undo) or still undone (redo), so it goes back where it was
        // — unless the history was cleared, or a new change has emptied redo.
        if (current() && (direction === 'undo' || history.generation === generation)) {
          from.splice(Math.min(takenFrom, from.length), 0, taken)
          notify(history)
        }
        throw err
      }
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

/** Empty `undo` when the tab or app goes away. Returns the release. */
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
