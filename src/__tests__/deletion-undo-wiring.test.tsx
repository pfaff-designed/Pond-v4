/**
 * Wiring-level tests for the deletion-undo seams (ticket-27 review fixes).
 * The pure-helper tests didn't catch two races; these exercise the exact seams
 * that had the bugs:
 *
 * 1. SECOND-DELETE CLOBBER — undoing deletion A must re-insert ONLY row A
 *    (surgical restore via row-cache), never a whole pre-delete snapshot that
 *    still contains concurrently-deleted row B.
 * 2. UNDO vs COMMIT-TIMER RACE — performUndo must NOT run the restore when the
 *    grace window already committed; restoring then would race the in-flight
 *    destructive write.
 * 3. Provider behavior end-to-end (RTL + fake timers): toast lifecycle, undo
 *    cancelling the deferred write, window-elapse committing it, and
 *    flushScope committing/clearing scoped toasts (the cross-page block leak).
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { removeRow, restoreRow } from '@/lib/deletion/row-cache'
import {
  scheduleDeferredCommit,
  performUndo,
  GRACE_WINDOW_MS,
} from '@/lib/deletion/deferred-commit'
import { DeletionUndoProvider, useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { isStaged, stagedIds, unstageId } from '@/lib/deletion/staged-ids'
import { NotifyBridge, requestNotify } from '@/lib/deletion/notify-bridge'

// ── 1. Surgical restore: two overlapping deletes ────────────────────────────

describe('surgical row restore (second-delete clobber)', () => {
  const A = { id: 'a', title: 'Page A' }
  const B = { id: 'b', title: 'Page B' }

  it('undoing A does not resurrect concurrently-deleted B', () => {
    // Simulate the Rail sequence: cache starts [A, B]; user deletes A then B.
    let cache = [A, B]
    const removedA = cache.find((r) => r.id === 'a')! // captured at stage time
    cache = removeRow(cache, 'a') // → [B]
    cache = removeRow(cache, 'b') // → []   (B's own delete pends)

    // Undo A: surgical re-insert of ONLY row A.
    cache = restoreRow(cache, removedA)
    expect(cache).toEqual([A]) // B stays deleted — the old snapshot restore would have brought it back
  })

  it('restoreRow is duplicate-safe when a refetch already brought the row back', () => {
    const rows = [A, B]
    expect(restoreRow(rows, A)).toBe(rows)
  })

  it('removeRow is a no-op for an absent id', () => {
    expect(removeRow([A], 'zzz')).toEqual([A])
  })
})

// ── 2. Undo racing the commit timer ─────────────────────────────────────────

describe('performUndo guard (undo racing the commit timer)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('restores when undo beats the window', () => {
    const commit = jest.fn()
    const restore = jest.fn()
    const controller = scheduleDeferredCommit({ commit })

    expect(performUndo(controller, restore)).toBe(true)
    expect(restore).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(GRACE_WINDOW_MS + 1000)
    expect(commit).not.toHaveBeenCalled()
  })

  it('does NOT restore when the window already committed', () => {
    const commit = jest.fn()
    const restore = jest.fn()
    const controller = scheduleDeferredCommit({ commit })

    jest.advanceTimersByTime(GRACE_WINDOW_MS) // commit fires
    expect(commit).toHaveBeenCalledTimes(1)

    // The user's click lands just after — restore must not run.
    expect(performUndo(controller, restore)).toBe(false)
    expect(restore).not.toHaveBeenCalled()
  })

  it('does NOT restore after an explicit flush (dismiss)', () => {
    const commit = jest.fn()
    const restore = jest.fn()
    const controller = scheduleDeferredCommit({ commit })

    void controller.flush()
    expect(performUndo(controller, restore)).toBe(false)
    expect(restore).not.toHaveBeenCalled()
  })
})

// ── 3. Provider end-to-end (RTL) ────────────────────────────────────────────

function Harness({
  commit,
  undo,
  scope,
}: {
  commit: () => void
  undo?: () => void
  scope?: string
}) {
  const { stageDeletion, flushScope } = useDeletionUndo()
  return (
    <>
      <button onClick={() => stageDeletion({ message: 'Deleted "X"', commit, undo, scope })}>
        stage
      </button>
      <button onClick={() => flushScope('block')}>flush-block</button>
    </>
  )
}

function renderHarness(props: React.ComponentProps<typeof Harness>) {
  return render(
    <DeletionUndoProvider>
      <Harness {...props} />
    </DeletionUndoProvider>
  )
}

describe('DeletionUndoProvider wiring', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('stages a toast; Undo cancels the deferred write and restores', () => {
    const commit = jest.fn()
    const undo = jest.fn()
    renderHarness({ commit, undo })

    fireEvent.click(screen.getByText('stage'))
    expect(screen.getByText('Deleted "X"')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Deleted "X"')).not.toBeInTheDocument()

    act(() => jest.advanceTimersByTime(GRACE_WINDOW_MS + 1000))
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits when the grace window elapses and removes the toast', () => {
    const commit = jest.fn()
    renderHarness({ commit, undo: jest.fn() })

    fireEvent.click(screen.getByText('stage'))
    act(() => jest.advanceTimersByTime(GRACE_WINDOW_MS))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Deleted "X"')).not.toBeInTheDocument()
  })

  it('Dismiss commits ahead of the window', () => {
    const commit = jest.fn()
    renderHarness({ commit, undo: jest.fn() })

    fireEvent.click(screen.getByText('stage'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Deleted "X"')).not.toBeInTheDocument()
  })

  it('flushScope commits and clears scoped toasts (cross-page block leak)', () => {
    const commit = jest.fn()
    const undo = jest.fn()
    renderHarness({ commit, undo, scope: 'block' })

    fireEvent.click(screen.getByText('stage'))
    expect(screen.getByText('Deleted "X"')).toBeInTheDocument()

    // Simulates DocumentPanel leaving the page: pending block toasts flush —
    // the write commits, the toast dies, undo can never fire against a new page.
    fireEvent.click(screen.getByText('flush-block'))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(undo).not.toHaveBeenCalled()
    expect(screen.queryByText('Deleted "X"')).not.toBeInTheDocument()
  })

  it('a toast staged without undo renders as a notice (no Undo button)', () => {
    renderHarness({ commit: jest.fn() })
    fireEvent.click(screen.getByText('stage'))
    expect(screen.getByText('Deleted "X"')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})

// ── 3b. stageUndo — a change already applied, with nothing deferred ──────────

function UndoHarness({ undo, scope }: { undo: () => void; scope?: string }) {
  const { stageUndo, flushScope } = useDeletionUndo()
  return (
    <>
      <button onClick={() => stageUndo({ message: 'Turned into a list', undo, scope })}>
        stage
      </button>
      <button onClick={() => flushScope('block')}>flush-block</button>
    </>
  )
}

describe('stageUndo', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const renderUndo = (props: React.ComponentProps<typeof UndoHarness>) =>
    render(
      <DeletionUndoProvider>
        <UndoHarness {...props} />
      </DeletionUndoProvider>
    )

  it('offers Undo for the window, and Undo runs it', () => {
    const undo = jest.fn()
    renderUndo({ undo })
    fireEvent.click(screen.getByText('stage'))
    expect(screen.getByText('Turned into a list')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Turned into a list')).not.toBeInTheDocument()
  })

  it('closes when the window elapses, leaving the change as it is', () => {
    const undo = jest.fn()
    renderUndo({ undo })
    fireEvent.click(screen.getByText('stage'))
    act(() => jest.advanceTimersByTime(GRACE_WINDOW_MS))
    expect(screen.queryByText('Turned into a list')).not.toBeInTheDocument()
    expect(undo).not.toHaveBeenCalled()
  })

  it('is cleared with its scope, without undoing', () => {
    const undo = jest.fn()
    renderUndo({ undo, scope: 'block' })
    fireEvent.click(screen.getByText('stage'))
    fireEvent.click(screen.getByText('flush-block'))
    expect(screen.queryByText('Turned into a list')).not.toBeInTheDocument()
    expect(undo).not.toHaveBeenCalled()
  })
})

// ── 3c. Backstop id threading + pagehide flush (KAN-300) ────────────────────

function BackstopHarness({
  id,
  commit,
  undo,
}: {
  id: string
  commit: () => void | Promise<void>
  undo?: () => void
}) {
  const { stageDeletion } = useDeletionUndo()
  return (
    <button onClick={() => stageDeletion({ message: 'Deleted "X"', commit, undo, id })}>stage</button>
  )
}

describe('backstop id threading (KAN-300)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // staged-ids is a module-level singleton; clear leftovers from any prior test.
    for (const id of stagedIds()) unstageId(id)
    sessionStorage.clear()
  })
  afterEach(() => jest.useRealTimers())

  it('staging with an id marks it staged', () => {
    render(
      <DeletionUndoProvider>
        <BackstopHarness id="page-1" commit={jest.fn()} />
      </DeletionUndoProvider>
    )
    expect(isStaged('page-1')).toBe(false)
    fireEvent.click(screen.getByText('stage'))
    expect(isStaged('page-1')).toBe(true)
  })

  it('commit clears the backstop id', async () => {
    const commit = jest.fn()
    render(
      <DeletionUndoProvider>
        <BackstopHarness id="page-1" commit={commit} />
      </DeletionUndoProvider>
    )
    fireEvent.click(screen.getByText('stage'))
    // unstageId now waits on the commit's own promise settling (KAN-300) —
    // let that microtask flush before asserting.
    await act(async () => {
      jest.advanceTimersByTime(GRACE_WINDOW_MS)
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(isStaged('page-1')).toBe(false)
  })

  it('undo clears the backstop id', () => {
    const undo = jest.fn()
    render(
      <DeletionUndoProvider>
        <BackstopHarness id="page-1" commit={jest.fn()} undo={undo} />
      </DeletionUndoProvider>
    )
    fireEvent.click(screen.getByText('stage'))
    expect(isStaged('page-1')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(isStaged('page-1')).toBe(false)
  })

  it('dispatching pagehide flushes a pending toast without waiting for the grace window', () => {
    // The commit's request never settles here (mirrors a reload cancelling
    // it mid-flight) — the backstop id must stay staged until it does, so
    // the reload sweep can still finish the delete.
    const commit = jest.fn(() => new Promise<void>(() => {}))
    render(
      <DeletionUndoProvider>
        <BackstopHarness id="page-1" commit={commit} />
      </DeletionUndoProvider>
    )
    fireEvent.click(screen.getByText('stage'))
    expect(commit).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(commit).toHaveBeenCalledTimes(1)
    expect(isStaged('page-1')).toBe(true)
  })
})

// ── 3d. flushStagedDeletes — commit every staged deletion, any scope (KAN-273) ─

function FlushStagedHarness({
  deleteCommit,
  otherUndo,
}: {
  deleteCommit: () => void
  otherUndo: () => void
}) {
  const { stageDeletion, stageUndo, flushStagedDeletes } = useDeletionUndo()
  return (
    <>
      <button
        onClick={() =>
          stageDeletion({ message: 'Deleted "X"', commit: deleteCommit, id: 'page-x' })
        }
      >
        stage-delete
      </button>
      <button onClick={() => stageUndo({ message: 'Turned into a list', undo: otherUndo, scope: 'block' })}>
        stage-other
      </button>
      <button onClick={() => void flushStagedDeletes()}>flush-staged</button>
    </>
  )
}

describe('flushStagedDeletes (KAN-273)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    for (const id of stagedIds()) unstageId(id)
  })
  afterEach(() => jest.useRealTimers())

  it('commits and closes a staged deletion, leaving an unrelated stageUndo toast alone', async () => {
    const deleteCommit = jest.fn()
    const otherUndo = jest.fn()
    render(
      <DeletionUndoProvider>
        <FlushStagedHarness deleteCommit={deleteCommit} otherUndo={otherUndo} />
      </DeletionUndoProvider>
    )

    fireEvent.click(screen.getByText('stage-delete'))
    fireEvent.click(screen.getByText('stage-other'))
    expect(screen.getByText('Deleted "X"')).toBeInTheDocument()
    expect(screen.getByText('Turned into a list')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByText('flush-staged'))
    })

    // The commit ran from the flush, not from the window elapsing.
    expect(deleteCommit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Deleted "X"')).not.toBeInTheDocument()
    expect(screen.getByText('Turned into a list')).toBeInTheDocument()
    expect(otherUndo).not.toHaveBeenCalled()
  })
})

// ── 4. Notify bridge — accept receipts from outside the provider (Fix-1) ────

describe('NotifyBridge (accept receipts, Fix-1/F12)', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  function renderBridge() {
    return render(
      <DeletionUndoProvider>
        <NotifyBridge />
      </DeletionUndoProvider>
    )
  }

  it('requestNotify from outside the provider surfaces a toast in the viewport', () => {
    renderBridge()
    act(() => requestNotify({ message: 'Added 2 blocks to Garage ✓' }))
    expect(screen.getByText('Added 2 blocks to Garage ✓')).toBeInTheDocument()
    // Plain receipt — no Undo, no action button beyond dismiss.
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('a receipt with an action renders the labeled button and fires it', () => {
    renderBridge()
    const open = jest.fn()
    act(() =>
      requestNotify({ message: 'Added 1 block to Garage ✓', action: open, actionLabel: 'Open' })
    )
    const button = screen.getByRole('button', { name: 'Open' })
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('receipt toasts auto-expire with the grace window', () => {
    renderBridge()
    act(() => requestNotify({ message: 'Added 1 block to Garage ✓' }))
    expect(screen.getByText('Added 1 block to Garage ✓')).toBeInTheDocument()
    act(() => jest.advanceTimersByTime(GRACE_WINDOW_MS))
    expect(screen.queryByText('Added 1 block to Garage ✓')).not.toBeInTheDocument()
  })
})
