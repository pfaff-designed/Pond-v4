/**
 * One queue per page (KAN-495), framework-free. Every write — a debounced
 * typed save, a structural block edit — is `enqueue`d here instead of
 * racing its own save against the others, so the queue alone decides what
 * the page holds and in what order.
 *
 * `before` is never the value `head()` held when a write was enqueued —
 * only the value it holds WHEN THE WRITER ACTUALLY RUNS. Two writes
 * enqueued back to back, neither awaited, still chain correctly this way:
 * the second's `before` is the first's `after`, not whatever `head()` read
 * before either had applied.
 */

export type PageWriteKind = 'typed' | 'structural'

export type PageWriteOp<T> = {
  kind: PageWriteKind
  before: T
  after: T
  /**
   * KAN-368: the draft reserved this op's undo slot when it was enqueued.
   * The writer hands the change-log ids here once they're known (null if the
   * write stored nothing) instead of pushing a second step later.
   */
  onPending?: (recordIds: readonly string[] | null) => void
}

export type PageWrite<T> = {
  kind: PageWriteKind
  after: T
  /** See `PageWriteOp.onPending`. Carried onto the op the writer actually runs. */
  onPending?: (recordIds: readonly string[] | null) => void
}

/**
 * `settle` is a side channel, separate from the returned `Promise<void>`
 * (which means "applied" — `head()`/`idle()`/`notify()` advance the instant
 * it resolves, so `saved` flips the moment the write itself lands, not when
 * everything downstream of it finishes). A writer that has more work
 * outstanding after the write lands (KAN-355's change-log record, not yet
 * remembered by `sessionUndo`) calls `settle(thatPromise)` before returning;
 * `drained()` then waits for it too, on top of the queue going idle, without
 * delaying `idle()`/`saved` themselves. A writer with nothing further to wait
 * on need never call it — `drained()` degrades to "the write applied", same
 * as before this existed. Optional (not just unused) so a writer called
 * directly with one argument, outside the queue, still type-checks.
 */
export type PageWriter<T> = (
  op: PageWriteOp<T>,
  settle?: (promise: Promise<void>) => void
) => Promise<void>

export type PageWriteQueueState<T> = {
  head: T
  halted: boolean
}

export type PageWriteQueueListener<T> = (state: PageWriteQueueState<T>) => void

export type PageWriteQueue<T> = {
  enqueue(write: PageWrite<T>): Promise<void>
  head(): T
  /** Whether a write rejected and is waiting to be retried. */
  halted(): boolean
  /** True when nothing is queued, mid-apply, or halted. */
  idle(): boolean
  /** Re-applies the halted op. A no-op (resolved) when not halted. */
  retry(): Promise<void>
  /**
   * Drops the halted op instead of retrying it: `head()` stays at whatever
   * it held before that op was attempted (the failed write never applied,
   * so there's nothing to roll forward to). By default the queue resumes
   * pumping anything already queued behind it (unchanged). `andQueued: true`
   * discards that queued tail too, rejecting each one instead of applying
   * it — for a caller (a template apply) whose `after` every later op was
   * built on top of, so a queued op built on the discarded `after` must
   * never land on the pre-discard `head()` it was never actually derived
   * from. A no-op when not halted.
   */
  discardHalted(opts?: { andQueued?: boolean }): void
  /**
   * Sets `head()` directly for an external write (an accepted diff, an
   * undo/redo landing) that never goes through `writer`. Only legal while
   * idle — nothing queued, nothing halted — since rebasing mid-flight would
   * make an in-flight op's `before` a value the store never actually held.
   */
  rebase(after: T): void
  /** KAN-407 seam: fires on every `head()`/`halted()` change. Returns an unsubscribe. */
  subscribe(listener: PageWriteQueueListener<T>): () => void
  /** Resolves once the queue returns to idle; `undefined` if already idle. */
  drained(): Promise<void> | undefined
}

type QueuedEntry<T> = {
  kind: PageWriteKind
  after: T
  onPending?: (recordIds: readonly string[] | null) => void
  resolve: () => void
  reject: (reason: unknown) => void
}

type Waiter = {
  resolve: () => void
  reject: (reason: unknown) => void
}

export function createPageWriteQueue<T>(writer: PageWriter<T>, initial: T): PageWriteQueue<T> {
  let head = initial
  let haltedOp: PageWriteOp<T> | null = null
  const haltedWaiters: Waiter[] = []
  const queued: QueuedEntry<T>[] = []
  let pumping = false
  const listeners = new Set<PageWriteQueueListener<T>>()

  // `drained()`'s stricter bookkeeping (KAN-302/KAN-355 regression): a count
  // of settle promises handed to `registerSettle` that haven't resolved yet,
  // and the one outstanding `drained()` promise/its waiters, resolved only
  // once BOTH the queue is idle and this count is back to zero.
  let outstandingSettles = 0
  let drainPromise: Promise<void> | null = null
  const drainWaiters: Array<() => void> = []

  function notify(): void {
    const state: PageWriteQueueState<T> = { head, halted: haltedOp !== null }
    listeners.forEach((listener) => listener(state))
    maybeResolveDrain()
  }

  function registerSettle(promise: Promise<void>): void {
    outstandingSettles++
    void promise.finally(() => {
      outstandingSettles--
      maybeResolveDrain()
    })
  }

  // "Halted at rest" (`haltedOp !== null && !pumping`) is what's terminal for
  // drain purposes, NOT bare `haltedOp !== null` — `haltedOp` stays set for
  // the whole span of a retry attempt too (cleared only on that attempt's
  // success), so checking it alone would resolve a waiting `drained()` while
  // a retry of that very op is still in flight. `pumping` is checked directly
  // rather than `isIdle()`: this runs from inside `pump()`'s own loop, before
  // its `finally` has unwound `pumping` back to false, and from that
  // `finally` itself once it has — never from an arbitrary outside call, so
  // there's no mid-await window to account for here the way `drained()`'s own
  // outer check needs to.
  function maybeResolveDrain(): void {
    if (!drainPromise) return
    if (outstandingSettles !== 0) return
    if (pumping) return
    if (haltedOp === null && queued.length !== 0) return
    const waiters = drainWaiters.splice(0, drainWaiters.length)
    drainPromise = null
    waiters.forEach((resolve) => resolve())
  }

  // The one place that calls `writer`. Runs the halted op (if any) before
  // ever looking at `queued`, so a rejected write always holds up every op
  // enqueued after it — "the next enqueue() auto-retries the halted op
  // first, then the new op" falls out of this loop, not special-cased.
  async function pump(): Promise<void> {
    if (pumping) return
    pumping = true
    try {
      for (;;) {
        if (haltedOp) {
          const op = haltedOp
          // Collect waiters AFTER the await, not before: a `retry()` called
          // while this attempt is still in flight pushes onto `haltedWaiters`
          // synchronously, and the only yield point here is the `await`
          // itself, so splicing on the far side of it (still synchronously,
          // before any other code runs) never drops a waiter that arrived
          // mid-flight.
          try {
            await writer(op, registerSettle)
          } catch (err) {
            const waiters = haltedWaiters.splice(0, haltedWaiters.length)
            waiters.forEach((w) => w.reject(err))
            return
          }
          const waiters = haltedWaiters.splice(0, haltedWaiters.length)
          head = op.after
          haltedOp = null
          notify()
          waiters.forEach((w) => w.resolve())
          continue
        }

        const entry = queued.shift()
        if (!entry) return

        const op: PageWriteOp<T> = { kind: entry.kind, before: head, after: entry.after }
        if (entry.onPending) op.onPending = entry.onPending
        try {
          await writer(op, registerSettle)
        } catch (err) {
          haltedOp = op
          notify()
          entry.reject(err)
          return
        }
        head = op.after
        notify()
        entry.resolve()
      }
    } finally {
      pumping = false
      // A retry that rejects again (the halted-op branch's own `catch`)
      // returns without calling `notify()` — nothing else would otherwise
      // resolve a `drained()` promise created while that retry was in
      // flight. Safe to call unconditionally: every other exit path already
      // called `notify()` (hence `maybeResolveDrain()`) itself, while
      // `pumping` was still `true`, so this is the only resolution it gets.
      maybeResolveDrain()
    }
  }

  function enqueue(write: PageWrite<T>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      queued.push({
        kind: write.kind,
        after: write.after,
        onPending: write.onPending,
        resolve,
        reject,
      })
      void pump()
    })
  }

  function retry(): Promise<void> {
    if (!haltedOp) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      haltedWaiters.push({ resolve, reject })
      void pump()
    })
  }

  // Drops the halted op without retrying it: any `retry()` callers already
  // waiting on it get rejected (it is never going to apply now). Without
  // `andQueued`, anything already queued behind it resumes — same re-entry
  // into `pump()` as `retry()` uses, just skipping straight past the halted
  // op instead of re-attempting it. With `andQueued`, that queued tail is
  // spliced out and rejected too, BEFORE `pump()` runs again, so none of it
  // is ever applied against the pre-discard `head()` — it was built on top
  // of the discarded op's `after`, not that.
  function discardHalted(opts?: { andQueued?: boolean }): void {
    if (!haltedOp) return
    haltedOp = null
    const waiters = haltedWaiters.splice(0, haltedWaiters.length)
    const discardedQueue = opts?.andQueued ? queued.splice(0, queued.length) : []
    notify()
    waiters.forEach((w) => w.reject(new Error('PageWriteQueue: halted op discarded')))
    discardedQueue.forEach((entry) =>
      entry.reject(new Error('PageWriteQueue: queued op discarded with its halted predecessor'))
    )
    void pump()
  }

  function isIdle(): boolean {
    return !pumping && queued.length === 0 && haltedOp === null
  }

  function rebase(after: T): void {
    if (!isIdle()) {
      const message = 'PageWriteQueue.rebase() called while not idle (a write is pending or halted)'
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(message)
      }
      console.error(message)
      return
    }
    head = after
    notify()
  }

  function subscribe(listener: PageWriteQueueListener<T>): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  // Resolves once nothing is queued or halted AND every settle a writer
  // registered for an op along the way has itself resolved — not just the
  // writes applying (KAN-302/KAN-355: a caller awaiting a flush must not see
  // it resolve before the record it wrote is actually remembered). Identity-
  // stable while outstanding: two calls made while the same write is still
  // pending return the SAME promise object, via `drainPromise`, rather than
  // each subscribing their own — a caller that calls `drained()` twice
  // (flushing twice before either lands) must get back one thing to await,
  // not two separate ones racing the same underlying work.
  function drained(): Promise<void> | undefined {
    if (drainPromise) return drainPromise
    // `isIdle()` (not the bare queued/haltedOp check `maybeResolveDrain` uses)
    // because this runs at an arbitrary call time, including mid-await —
    // unlike `maybeResolveDrain`, which only ever runs from inside `notify()`
    // or a settle's own resolution, both of which fire after the state they
    // check has already finished changing for that op.
    if (isIdle() && outstandingSettles === 0) return undefined
    // Halted AT REST (`!pumping` — a retry of `haltedOp` is NOT in flight),
    // with no settle still outstanding: a halt never resumes on its own, so
    // there's nothing left for THIS call to wait on. Nothing else queued
    // behind it — truly nothing outstanding — returns `undefined`, same as
    // the idle case above. Something still queued behind the halt stays
    // pending (it won't apply until a retry), but a caller already can't
    // wait on that via `drained()` — resolve now rather than create a
    // promise `maybeResolveDrain` has no future trigger to settle.
    //
    // While `pumping` IS true (a retry of `haltedOp` already under way), this
    // is NOT at rest — fall through and create a real promise, so a caller
    // doesn't proceed against a store that retry might still change.
    if (haltedOp !== null && !pumping && outstandingSettles === 0) {
      return queued.length === 0 ? undefined : Promise.resolve()
    }
    drainPromise = new Promise<void>((resolve) => {
      drainWaiters.push(resolve)
    })
    return drainPromise
  }

  return {
    enqueue,
    head: () => head,
    halted: () => haltedOp !== null,
    idle: isIdle,
    retry,
    discardHalted,
    rebase,
    subscribe,
    drained,
  }
}
