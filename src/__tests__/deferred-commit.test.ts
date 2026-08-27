// Deferred-commit grace window (ticket-27, undo mechanics). Timer-injected so
// the window is driven deterministically without real time.

import { scheduleDeferredCommit, GRACE_WINDOW_MS } from '@/lib/deletion/deferred-commit'

// A tiny controllable timer: schedule() records the callback; tick() runs it.
function fakeTimers() {
  let pending: { fn: () => void; ms: number } | null = null
  return {
    setTimer: (fn: () => void, ms: number) => {
      pending = { fn, ms }
      return 1 as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer: () => {
      pending = null
    },
    tick: () => {
      const p = pending
      pending = null
      p?.fn()
    },
    scheduledMs: () => pending?.ms ?? null,
  }
}

describe('scheduleDeferredCommit', () => {
  it('commits when the grace window elapses', () => {
    const commit = jest.fn()
    const t = fakeTimers()
    const d = scheduleDeferredCommit({ commit, setTimer: t.setTimer, clearTimer: t.clearTimer })

    expect(commit).not.toHaveBeenCalled()
    expect(d.isSettled).toBe(false)
    t.tick()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(d.isSettled).toBe(true)
    expect(d.isUndone).toBe(false)
  })

  it('defaults the window to GRACE_WINDOW_MS', () => {
    const t = fakeTimers()
    scheduleDeferredCommit({ commit: jest.fn(), setTimer: t.setTimer, clearTimer: t.clearTimer })
    expect(t.scheduledMs()).toBe(GRACE_WINDOW_MS)
  })

  it('undo cancels the write — nothing is committed', () => {
    const commit = jest.fn()
    const t = fakeTimers()
    const d = scheduleDeferredCommit({ commit, setTimer: t.setTimer, clearTimer: t.clearTimer })

    d.undo()
    expect(d.isUndone).toBe(true)
    t.tick() // window would have fired — but it was cancelled
    expect(commit).not.toHaveBeenCalled()
    expect(d.isSettled).toBe(false)
  })

  it('flush commits immediately (toast dismissed ahead of the window)', () => {
    const commit = jest.fn()
    const t = fakeTimers()
    const d = scheduleDeferredCommit({ commit, setTimer: t.setTimer, clearTimer: t.clearTimer })

    d.flush()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(d.isSettled).toBe(true)
    // the window firing afterward must not double-commit
    t.tick()
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('flush after undo does nothing (undo wins)', () => {
    const commit = jest.fn()
    const t = fakeTimers()
    const d = scheduleDeferredCommit({ commit, setTimer: t.setTimer, clearTimer: t.clearTimer })

    d.undo()
    d.flush()
    expect(commit).not.toHaveBeenCalled()
  })

  it('undo after commit is a no-op (cannot un-delete a settled write)', () => {
    const commit = jest.fn()
    const t = fakeTimers()
    const d = scheduleDeferredCommit({ commit, setTimer: t.setTimer, clearTimer: t.clearTimer })

    t.tick()
    d.undo()
    expect(d.isUndone).toBe(false)
    expect(d.isSettled).toBe(true)
  })
})
