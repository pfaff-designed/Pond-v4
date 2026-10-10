'use client'

/**
 * The session's undo history (KAN-93): a stack of undoable steps, each the
 * change-log record ids one action made.
 *
 * AUDIT C1: "undo covers the session, until the tab or app closes. After that,
 * revert from the change log." So the stack lives in memory only and is emptied
 * on `pagehide`; the log is what outlasts it. Undo and redo are themselves
 * records (`undo.ts`, migration 0021), so ⌘Z and the log always agree.
 *
 * Features that make an undoable change hand its records to {@link
 * SessionUndo.remember}; a key binding calls `undo()` / `redo()` and reads
 * `canUndo` / `canRedo` through `useSessionUndo` (or `subscribe` +
 * `getSnapshot`). Calls run one after another, so a quick ⌘Z ⌘Z takes back two
 * steps in order.
 */

import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { redoStep, undoStep, type StepResult, type UndoStep } from './undo'

export interface SessionUndoSnapshot {
  canUndo: boolean
  canRedo: boolean
}

/** What `undo()` / `redo()` did. A `stale` or `refused` step is dropped: the log
 *  only grows, so it cannot succeed later — revert from the change log instead. */
export type SessionUndoOutcome = { kind: 'empty' } | (StepResult & { step: UndoStep })

export interface SessionUndo {
  /** Make one action's records the next thing undo takes back. Clears redo. */
  remember: (step: UndoStep) => void
  undo: () => Promise<SessionUndoOutcome>
  redo: () => Promise<SessionUndoOutcome>
  clear: () => void
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => SessionUndoSnapshot
}

export interface SessionUndoRunner {
  undo: (step: UndoStep) => Promise<StepResult>
  redo: (step: UndoStep) => Promise<StepResult>
}

export const createSessionUndo = (run: SessionUndoRunner): SessionUndo => {
  const undoStack: UndoStep[] = []
  const redoStack: UndoStep[] = []
  const listeners = new Set<() => void>()
  let snapshot: SessionUndoSnapshot = { canUndo: false, canRedo: false }
  let queue: Promise<unknown> = Promise.resolve()

  const notify = () => {
    snapshot = { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
    for (const listener of listeners) listener()
  }

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task)
    queue = next.catch(() => undefined)
    return next
  }

  /** Pop at run time, not call time, so queued calls each take the then-newest step. */
  const step = (
    from: UndoStep[],
    apply: (step: UndoStep) => Promise<StepResult>,
    onDone: (step: UndoStep, result: Extract<StepResult, { kind: 'done' }>) => void
  ): Promise<SessionUndoOutcome> =>
    enqueue(async () => {
      const next = from.pop()
      if (next === undefined) return { kind: 'empty' }
      notify()
      let result: StepResult
      try {
        result = await apply(next)
      } catch (err) {
        from.push(next)
        notify()
        throw err
      }
      if (result.kind === 'done') {
        onDone(next, result)
        notify()
      }
      return { ...result, step: next }
    })

  return {
    remember: (next) => {
      if (next.recordIds.length === 0) return
      undoStack.push(next)
      redoStack.length = 0
      notify()
    },
    undo: () => step(undoStack, run.undo, (undone) => redoStack.push(undone)),
    redo: () =>
      step(redoStack, run.redo, (redone, result) =>
        undoStack.push({ pondId: redone.pondId, recordIds: result.records.map((r) => r.id) })
      ),
    clear: () => {
      undoStack.length = 0
      redoStack.length = 0
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
  }
}

/** Empty `undo` when the tab or app goes away. Returns the release. */
export const clearOnPageHide = (target: Window, undo: SessionUndo): (() => void) => {
  const handlePageHide = () => undo.clear()
  target.addEventListener('pagehide', handlePageHide)
  return () => target.removeEventListener('pagehide', handlePageHide)
}

/** The tab's one history. */
export const sessionUndo: SessionUndo = createSessionUndo({
  undo: (step) => undoStep(createClient(), step),
  redo: (step) => redoStep(createClient(), step),
})

if (typeof window !== 'undefined') clearOnPageHide(window, sessionUndo)

const SERVER_SNAPSHOT: SessionUndoSnapshot = { canUndo: false, canRedo: false }

/** `canUndo` / `canRedo` for the tab's history, re-rendering when either changes. */
export const useSessionUndo = (): SessionUndoSnapshot =>
  useSyncExternalStore(sessionUndo.subscribe, sessionUndo.getSnapshot, () => SERVER_SNAPSHOT)
