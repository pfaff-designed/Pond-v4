/**
 * Unit tests for the queue's sequencing (KAN-495). Failure handling and
 * `rebase` are later items — these cover only applied-at-apply-time `before`.
 */

import { createPageWriteQueue, type PageWriteOp } from './page-write-queue'

describe('createPageWriteQueue', () => {
  it("reads before from head() at apply time, not at enqueue time", async () => {
    const applied: Array<PageWriteOp<string>> = []
    const pending: Array<() => void> = []

    const writer = jest.fn((op: PageWriteOp<string>) => {
      applied.push(op)
      return new Promise<void>((resolve) => pending.push(resolve))
    })

    const queue = createPageWriteQueue<string>(writer, 'initial')

    // Both enqueued while head() still reads 'initial' and neither writer
    // has resolved yet.
    const first = queue.enqueue({ kind: 'typed', after: 'one' })
    const second = queue.enqueue({ kind: 'typed', after: 'two' })

    await Promise.resolve()
    expect(writer).toHaveBeenCalledTimes(1)
    expect(applied[0].before).toBe('initial')

    pending[0]()
    await first

    // The second op's `before` is the first op's `after` — not 'initial',
    // which is what head() held at the moment both were enqueued.
    expect(writer).toHaveBeenCalledTimes(2)
    expect(applied[1].before).toBe('one')

    pending[1]()
    await second

    expect(queue.head()).toBe('two')
  })

  it('halts on a rejected write: op not applied, head unchanged, later enqueues stay pending', async () => {
    const writer = jest.fn((_op: PageWriteOp<string>) => Promise.reject(new Error('nope')))
    const queue = createPageWriteQueue<string>(writer, 'initial')

    await expect(queue.enqueue({ kind: 'structural', after: 'bad' })).rejects.toThrow('nope')

    expect(queue.head()).toBe('initial')
    expect(queue.halted()).toBe(true)
    expect(writer).toHaveBeenCalledTimes(1)

    let settled = false
    const later = queue.enqueue({ kind: 'structural', after: 'later' })
    later.then(
      () => (settled = true),
      () => (settled = true)
    )

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // the halted op gets auto-retried (and fails again); `later` is never attempted
    expect(settled).toBe(false)
    expect(queue.head()).toBe('initial')
    expect(queue.halted()).toBe(true)
    expect(writer).toHaveBeenCalledTimes(2)
    expect(writer.mock.calls[1][0]).toMatchObject({ after: 'bad' })
  })

  it("retry() re-applies the halted op and resumes the queue", async () => {
    let shouldFail = true
    const writer = jest.fn((_op: PageWriteOp<string>) =>
      shouldFail ? Promise.reject(new Error('transient')) : Promise.resolve()
    )
    const queue = createPageWriteQueue<string>(writer, 'initial')

    await expect(queue.enqueue({ kind: 'structural', after: 'a' })).rejects.toThrow('transient')
    expect(queue.halted()).toBe(true)
    expect(queue.head()).toBe('initial')

    shouldFail = false
    await queue.retry()

    expect(queue.halted()).toBe(false)
    expect(queue.head()).toBe('a')
    expect(writer).toHaveBeenCalledTimes(2)
    expect(writer.mock.calls[1][0]).toEqual({ kind: 'structural', before: 'initial', after: 'a' })
  })

  it('enqueue after a halt retries the halted op first, then applies the new op — separate writer calls, in order', async () => {
    let failFirst = true
    const writer = jest.fn((op: PageWriteOp<string>) => {
      if (op.after === 'a' && failFirst) {
        failFirst = false
        return Promise.reject(new Error('transient'))
      }
      return Promise.resolve()
    })
    const queue = createPageWriteQueue<string>(writer, 'initial')

    await expect(queue.enqueue({ kind: 'typed', after: 'a' })).rejects.toThrow('transient')
    expect(queue.halted()).toBe(true)

    await queue.enqueue({ kind: 'typed', after: 'b' })

    expect(writer).toHaveBeenCalledTimes(3)
    expect(writer.mock.calls[0][0]).toEqual({ kind: 'typed', before: 'initial', after: 'a' })
    expect(writer.mock.calls[1][0]).toEqual({ kind: 'typed', before: 'initial', after: 'a' })
    expect(writer.mock.calls[2][0]).toEqual({ kind: 'typed', before: 'a', after: 'b' })
    expect(queue.halted()).toBe(false)
    expect(queue.head()).toBe('b')
  })

  describe('discardHalted()', () => {
    it('drops the halted op without retrying it: head unchanged, no longer halted', async () => {
      const writer = jest.fn((_op: PageWriteOp<string>) => Promise.reject(new Error('nope')))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'structural', after: 'bad' })).rejects.toThrow('nope')
      expect(queue.halted()).toBe(true)

      queue.discardHalted()

      expect(queue.halted()).toBe(false)
      expect(queue.head()).toBe('initial')
      expect(writer).toHaveBeenCalledTimes(1)
    })

    it('resumes anything already queued behind the halted op', async () => {
      let failA = true
      const writer = jest.fn((op: PageWriteOp<string>) => {
        if (op.after === 'a' && failA) {
          failA = false
          return Promise.reject(new Error('nope'))
        }
        return Promise.resolve()
      })
      const queue = createPageWriteQueue<string>(writer, 'initial')

      const first = queue.enqueue({ kind: 'structural', after: 'a' })
      const second = queue.enqueue({ kind: 'structural', after: 'b' })
      await expect(first).rejects.toThrow('nope')

      queue.discardHalted()
      await second

      // 'b's own `before` is 'initial' — the discarded 'a' never applied, so
      // it's never what a later op's `before` reads as.
      expect(writer.mock.calls[1][0]).toEqual({ kind: 'structural', before: 'initial', after: 'b' })
      expect(queue.head()).toBe('b')
      expect(queue.halted()).toBe(false)
    })

    it('rejects a pending retry() when the op it was waiting on gets discarded instead', async () => {
      const writer = jest.fn((_op: PageWriteOp<string>) => Promise.reject(new Error('nope')))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'structural', after: 'bad' })).rejects.toThrow('nope')
      const pendingRetry = queue.retry()
      queue.discardHalted()

      await expect(pendingRetry).rejects.toThrow()
    })

    it('is a no-op when not halted', () => {
      const writer = jest.fn(() => Promise.resolve())
      const queue = createPageWriteQueue<string>(writer, 'initial')
      expect(() => queue.discardHalted()).not.toThrow()
      expect(queue.halted()).toBe(false)
    })

    it('{ andQueued: true } also discards anything queued behind the halted op, instead of resuming it', async () => {
      const writer = jest.fn((_op: PageWriteOp<string>) => Promise.reject(new Error('nope')))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      const first = queue.enqueue({ kind: 'structural', after: 'template' })
      // Queued behind `first` before its rejection resolves — built on top of
      // `template`, the very `after` the failure is about to discard.
      const second = queue.enqueue({ kind: 'typed', after: 'template+typed' })
      await expect(first).rejects.toThrow('nope')

      queue.discardHalted({ andQueued: true })

      await expect(second).rejects.toThrow()
      // Neither the discarded op nor the queued one it was behind ever
      // reached the writer a second time — `second` was never applied.
      expect(writer).toHaveBeenCalledTimes(1)
      expect(queue.head()).toBe('initial')
      expect(queue.halted()).toBe(false)
      expect(queue.idle()).toBe(true)
    })
  })

  describe('rebase()', () => {
    const originalEnv = process.env.NODE_ENV
    const setNodeEnv = (value: string | undefined) => {
      Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true })
    }

    afterEach(() => {
      setNodeEnv(originalEnv)
    })

    it('sets head() directly, without calling the writer, while idle', () => {
      const writer = jest.fn(() => Promise.resolve())
      const queue = createPageWriteQueue<string>(writer, 'initial')

      queue.rebase('external')

      expect(queue.head()).toBe('external')
      expect(writer).not.toHaveBeenCalled()
    })

    it('throws in development when called while a write is pending', async () => {
      setNodeEnv('development')
      const pending: Array<() => void> = []
      const writer = jest.fn(() => new Promise<void>((resolve) => pending.push(resolve)))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      const inflight = queue.enqueue({ kind: 'typed', after: 'one' })
      await Promise.resolve()

      expect(() => queue.rebase('external')).toThrow(/not idle/)
      expect(queue.head()).toBe('initial')

      pending[0]()
      await inflight
    })

    it('throws in development when called while halted', async () => {
      setNodeEnv('development')
      const writer = jest.fn(() => Promise.reject(new Error('nope')))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'structural', after: 'bad' })).rejects.toThrow('nope')
      expect(queue.halted()).toBe(true)

      expect(() => queue.rebase('external')).toThrow(/not idle/)
      expect(queue.head()).toBe('initial')
    })

    it('is refused and logged (not thrown) in production when not idle', async () => {
      setNodeEnv('production')
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      const writer = jest.fn(() => Promise.reject(new Error('nope')))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'structural', after: 'bad' })).rejects.toThrow('nope')
      expect(queue.halted()).toBe(true)

      expect(() => queue.rebase('external')).not.toThrow()
      expect(queue.head()).toBe('initial')
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
    })
  })

  describe('drained()', () => {
    it('returns undefined while idle', () => {
      const writer = jest.fn(() => Promise.resolve())
      const queue = createPageWriteQueue<string>(writer, 'initial')

      expect(queue.drained()).toBeUndefined()
    })

    it('returns a promise that resolves once the outstanding write applies', async () => {
      const pending: Array<() => void> = []
      const writer = jest.fn(() => new Promise<void>((resolve) => pending.push(resolve)))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      void queue.enqueue({ kind: 'typed', after: 'one' })
      const drained = queue.drained()
      expect(drained).not.toBeUndefined()

      let settled = false
      drained?.then(() => (settled = true))

      await Promise.resolve()
      expect(settled).toBe(false)

      pending[0]()
      await drained

      expect(settled).toBe(true)
      expect(queue.head()).toBe('one')
    })

    it('returns undefined once halted, with nothing else queued — callers proceed against head()', async () => {
      const writer = jest.fn(() => Promise.reject(new Error('transient')))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'structural', after: 'a' })).rejects.toThrow('transient')
      expect(queue.halted()).toBe(true)

      // A halt stops the queue from making further progress on its own — a
      // retry() or the next enqueue() is needed to resume. `drained()` must
      // not leave a caller (⌘Z's flush, composer send, child-links) parked
      // waiting on a notify() that isn't coming until that happens.
      expect(queue.drained()).toBeUndefined()
      expect(queue.head()).toBe('initial')
    })

    it('resolves at once when halted, even with a later write still queued behind it', async () => {
      let failFirst = true
      const pending: Array<() => void> = []
      const writer = jest.fn((op: PageWriteOp<string>) => {
        if (op.after === 'a' && failFirst) {
          failFirst = false
          return Promise.reject(new Error('transient'))
        }
        return new Promise<void>((resolve) => pending.push(resolve))
      })
      const queue = createPageWriteQueue<string>(writer, 'initial')

      const first = queue.enqueue({ kind: 'typed', after: 'a' })
      // Enqueued while `first` is still in flight: sits in `queued`, behind
      // the halt `first`'s rejection is about to cause.
      void queue.enqueue({ kind: 'typed', after: 'b' })
      await expect(first).rejects.toThrow('transient')
      expect(queue.halted()).toBe(true)

      // `b` won't apply until an explicit retry()/enqueue() resumes the
      // queue, so from this caller's point of view the queue has already
      // stopped — `drained()` resolves now rather than hanging on it.
      const drained = queue.drained()
      expect(drained).not.toBeUndefined()
      await drained
    })

    it('stays pending while a retry of the halted op is in flight, resolving once it and the op behind it both apply', async () => {
      let attempt = 0
      const pending: Array<() => void> = []
      const writer = jest.fn((_op: PageWriteOp<string>) => {
        attempt += 1
        if (attempt === 1) return Promise.reject(new Error('transient'))
        if (attempt === 2) return new Promise<void>((resolve) => pending.push(resolve))
        return Promise.resolve()
      })
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'typed', after: 'a' })).rejects.toThrow('transient')
      expect(queue.halted()).toBe(true)

      // Enqueuing while halted retries 'a' first (attempt 2, held above)
      // before even looking at 'b' — the retry is what's "in flight" below.
      const second = queue.enqueue({ kind: 'typed', after: 'b' })

      const drained = queue.drained()
      expect(drained).not.toBeUndefined()

      let settled = false
      drained?.then(() => (settled = true))
      await Promise.resolve()
      await Promise.resolve()
      expect(settled).toBe(false)

      pending[0]()
      await second
      await drained

      expect(settled).toBe(true)
      expect(queue.halted()).toBe(false)
      expect(queue.head()).toBe('b')
    })

    it('resolves (does not hang) when a retry still in flight rejects again', async () => {
      let attempt = 0
      const rejecters: Array<(err: unknown) => void> = []
      const writer = jest.fn((_op: PageWriteOp<string>) => {
        attempt += 1
        if (attempt === 1) return Promise.reject(new Error('transient'))
        return new Promise<void>((_resolve, reject) => rejecters.push(reject))
      })
      const queue = createPageWriteQueue<string>(writer, 'initial')

      await expect(queue.enqueue({ kind: 'typed', after: 'a' })).rejects.toThrow('transient')
      expect(queue.halted()).toBe(true)

      // 'b' sits queued behind the retry; it never applies in this test.
      void queue.enqueue({ kind: 'typed', after: 'b' })

      const drained = queue.drained()
      expect(drained).not.toBeUndefined()

      let settled = false
      drained?.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)

      rejecters[0](new Error('transient again'))
      await drained

      expect(settled).toBe(true)
      expect(queue.halted()).toBe(true)
      expect(queue.head()).toBe('initial')
    })
  })

  describe('subscribe()', () => {
    it('fires on every head()/halted() change, and the returned unsubscribe stops it', async () => {
      const pending: Array<() => void> = []
      const writer = jest.fn(() => new Promise<void>((resolve) => pending.push(resolve)))
      const queue = createPageWriteQueue<string>(writer, 'initial')

      const states: Array<{ head: string; halted: boolean }> = []
      const unsubscribe = queue.subscribe((state) => states.push(state))

      const applied = queue.enqueue({ kind: 'typed', after: 'one' })
      await Promise.resolve()
      pending[0]()
      await applied

      expect(states).toEqual([{ head: 'one', halted: false }])

      unsubscribe()
      queue.rebase('two')

      expect(states).toEqual([{ head: 'one', halted: false }])
    })

    it('fires when a write halts and again when retry() clears it', async () => {
      let shouldFail = true
      const writer = jest.fn(() =>
        shouldFail ? Promise.reject(new Error('transient')) : Promise.resolve()
      )
      const queue = createPageWriteQueue<string>(writer, 'initial')

      const states: Array<{ head: string; halted: boolean }> = []
      queue.subscribe((state) => states.push(state))

      await expect(queue.enqueue({ kind: 'structural', after: 'a' })).rejects.toThrow('transient')
      expect(states).toEqual([{ head: 'initial', halted: true }])

      shouldFail = false
      await queue.retry()

      expect(states).toEqual([
        { head: 'initial', halted: true },
        { head: 'a', halted: false },
      ])
    })
  })
})
