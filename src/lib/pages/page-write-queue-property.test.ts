/**
 * Property-style test for `page-write-queue.ts` (KAN-495). No React, no
 * fast-check (not a dependency): a small seeded PRNG drives random
 * sequences of typed/structural enqueues, a late-resolving writer and a
 * failing writer, cross-checked against a model kept independently of the
 * queue's own internals.
 *
 * Invariants checked every run:
 * 1. Every op the writer is called with has `before` equal to the model's
 *    own view of "what's stored", updated only when a write actually
 *    succeeds — never what `head()` happened to read when the op was
 *    enqueued.
 * 2. `head()` at the end of a run equals the store's final state.
 * 3. Every op that was ever enqueued ends up represented exactly once in
 *    the model's "remembered" ledger — never twice, never not at all.
 */

import { createPageWriteQueue, type PageWriter, type PageWriteKind } from './page-write-queue'
import { createSessionUndo } from '@/lib/change-log/session-undo'
import { ACTOR_YOU, type ChangeLogRecord } from '@/lib/change-log/types'

function makeRng(seed: number): () => number {
  let state = seed % 2_147_483_647
  if (state <= 0) state += 2_147_483_646
  return () => {
    state = (state * 16_807) % 2_147_483_647
    return (state - 1) / 2_147_483_646
  }
}

type Store = number

type LateEntry = {
  outcome: 'success' | 'failure'
  settle: () => void
}

type RunResult = {
  violations: string[]
}

async function runSequence(seed: number): Promise<RunResult> {
  const rng = makeRng(seed)
  const randomInt = (maxExclusive: number) => Math.floor(rng() * maxExclusive)

  const violations: string[] = []
  const check = (condition: boolean, message: string) => {
    if (!condition) violations.push(`seed ${seed}: ${message}`)
  }

  let nextValue = 0
  const initial: Store = nextValue
  let expectedHead: Store = initial
  const remembered = new Set<Store>()
  const enqueuedValues = new Set<Store>()
  const pendingLate: LateEntry[] = []
  let forceSuccess = false

  const decide = (): 'success' | 'failure' | 'late-success' | 'late-failure' => {
    if (forceSuccess) return 'success'
    const roll = rng()
    if (roll < 0.15) return 'failure'
    if (roll < 0.35) return rng() < 0.5 ? 'late-success' : 'late-failure'
    return 'success'
  }

  const applySuccess = (op: { before: Store; after: Store }) => {
    check(op.before === expectedHead, `before mismatch — op.before=${op.before}, model head=${expectedHead}`)
    check(!remembered.has(op.after), `op ${op.after} applied/remembered more than once`)
    expectedHead = op.after
    remembered.add(op.after)
  }

  const writer: PageWriter<Store> = (op) => {
    check(op.before === expectedHead, `before mismatch at call time — op.before=${op.before}, model head=${expectedHead}`)
    const outcome = decide()

    if (outcome === 'failure') {
      return Promise.reject(new Error(`seed ${seed}: scripted immediate failure`))
    }
    if (outcome === 'success') {
      applySuccess(op)
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      pendingLate.push({
        outcome: outcome === 'late-success' ? 'success' : 'failure',
        settle: () => {
          if (outcome === 'late-success') {
            applySuccess(op)
            resolve()
          } else {
            reject(new Error(`seed ${seed}: scripted late failure`))
          }
        },
      })
    })
  }

  const queue = createPageWriteQueue<Store>(writer, initial)
  const settled: Array<Promise<void>> = []

  const steps = 12 + randomInt(20)
  for (let step = 0; step < steps; step += 1) {
    const action = randomInt(4)
    if (action === 0 || action === 1) {
      nextValue += 1
      const value = nextValue
      enqueuedValues.add(value)
      const kind: PageWriteKind = action === 0 ? 'typed' : 'structural'
      settled.push(queue.enqueue({ kind, after: value }).catch(() => undefined))
    } else if (action === 2) {
      const entry = pendingLate.shift()
      entry?.settle()
    } else if (queue.halted()) {
      settled.push(queue.retry().catch(() => undefined))
    }
    await Promise.resolve()
  }

  // Drain: every fresh writer invocation from here on succeeds, so the run
  // always terminates regardless of how many scripted failures preceded it.
  // Keyed off the model's own ledger (not `halted()`/pendingLate alone) —
  // a backlog of still-pumping immediate-success entries shows as neither
  // halted nor late, just not yet caught up with the ticks awaited so far.
  forceSuccess = true
  let drainIterations = 0
  while (remembered.size < enqueuedValues.size) {
    drainIterations += 1
    check(drainIterations < 2_000, 'drain never settled — queue stuck halted/pending')
    if (drainIterations >= 2_000) break

    if (pendingLate.length > 0) {
      pendingLate.shift()?.settle()
    } else if (queue.halted()) {
      settled.push(queue.retry().catch(() => undefined))
    }
    await Promise.resolve()
    await Promise.resolve()
  }

  await Promise.all(settled)

  check(queue.head() === expectedHead, `final head() (${queue.head()}) !== model's final state (${expectedHead})`)
  check(
    remembered.size === enqueuedValues.size,
    `remembered ledger has ${remembered.size} entries, expected ${enqueuedValues.size} (one per enqueued op)`
  )
  for (const value of enqueuedValues) {
    check(remembered.has(value), `op ${value} was enqueued but never ended up remembered`)
  }

  return { violations }
}

describe('createPageWriteQueue — property', () => {
  it('holds before/head/ledger invariants over 200 random sequences', async () => {
    const baseSeed = 2
    const runs = 200

    for (let i = 0; i < runs; i += 1) {
      const seed = baseSeed + i
      let result: RunResult
      try {
        result = await runSequence(seed)
      } catch (err) {
        console.error(`createPageWriteQueue property test: run ${i} failed with seed ${seed}`)
        throw err
      }

      if (result.violations.length > 0) {
        console.error(`createPageWriteQueue property test: run ${i}, seed ${seed}`, result.violations)
      }
      expect(result.violations).toEqual([])
    }
  }, 60_000)
})

/**
 * Same queue, now paired with a real `createSessionUndo` (not a mock of it) —
 * a fake `SessionUndoRunner` reads and writes the SAME model store the queue's
 * writer does, so an undo/redo "landing" is a second, independent way the
 * store changes besides a queue-applied op.
 *
 * ⌘Z/⇧⌘Z always wait on `queue.drained()` first, unconditionally — matching
 * `ShellCommands.tsx`'s `runUndoStep`, which calls `flushPendingPageSave`
 * (== `drained()`) and only then runs the step, with no `idle()`/`halted()`
 * check of its own before that call. That is what makes `drained()` waiting
 * out a retry still in flight (this ticket's own fix) something this random
 * walk actually exercises, not just the direct unit tests. That wait runs in
 * the background (pushed onto `settled`, not `await`ed before the walk's own
 * for-loop moves on): the drain it waits on can depend on a LATE write this
 * same run only settles via a LATER step, so blocking the loop on it here
 * would deadlock the walk against itself — production has no such loop to
 * deadlock. The undo/redo call itself IS still skipped if the drain settles
 * into a halt AT REST (no retry pending): a ⌘Z landing there can undo the
 * step UNDERNEATH the halted op — a real, separately-tracked bug (the next
 * item in this ticket's plan fixes it), not this test's regression to carry.
 * Within the "not halted" gate, `queue.rebase(store)` keeps `head()` and the
 * undo/redo model's store in lockstep, exactly as `use-page-draft.ts`'s
 * same-page adopt branch does for a real accepted diff/undo landing.
 *
 * The walk itself skips new typed/structural enqueues for the span of an
 * ⌘Z/⇧⌘Z's own background wait (`undoInFlight`, below): a write that lands
 * in that window applies with `before = head()`, which the queue keeps
 * correct on its own, but this MODEL's `store` only moves once the undo/redo
 * callback actually runs — a real race (an undo/redo landing underneath a
 * write that doesn't yet know about it is KAN-407's seam, same as the
 * original gate above), not this ticket's drained()-during-retry fix.
 * Excluding it from the walk keeps the model's own bookkeeping sound without
 * masking the retry-in-flight scenario this item does cover, which lives
 * entirely inside the queue's own halt/retry bookkeeping and is untouched by
 * this flag. A second ⌘Z/⇧⌘Z landing while the first is still in its own
 * background wait is excluded the same way (`!undoInFlight` on this branch
 * too) — overlapping calls into the real `sessionUndo` would race each
 * other's mutation of this model's `store`/`undoneIds`, which is this test
 * harness's limitation, not something `createPageWriteQueue` governs.
 *
 * `sessionUndo.trackPending` is called from inside the writer, right after a
 * write lands and before its record is remembered — same as `commit.ts`'s
 * `commitBlocks` (a rejected write never reaches it) — not at enqueue time.
 */
describe('createPageWriteQueue — property, with session undo', () => {
  const POND_ID = 'pond-1'

  const fakeRecord = (id: string): ChangeLogRecord => ({
    id,
    userId: 'user-1',
    pondId: POND_ID,
    status: 'accepted',
    action: 'edit',
    actor: ACTOR_YOU,
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    statusAt: '2026-01-01T00:00:00.000Z',
  })

  async function runUndoSequence(seed: number): Promise<RunResult> {
    const rng = makeRng(seed)
    const randomInt = (maxExclusive: number) => Math.floor(rng() * maxExclusive)

    const violations: string[] = []
    const check = (condition: boolean, message: string) => {
      if (!condition) violations.push(`seed ${seed}: ${message}`)
    }

    let store: Store = 0
    const visitedStates = new Set<Store>([store])
    const recordsById = new Map<string, { before: Store; after: Store }>()
    const undoneIds = new Set<string>()
    const appliedAfterValues = new Set<Store>()
    const enqueuedValues = new Set<Store>()
    let nextRecordId = 0
    let nextValue = 0

    const pendingLate: LateEntry[] = []
    let forceSuccess = false

    const decide = (): 'success' | 'failure' | 'late-success' | 'late-failure' => {
      if (forceSuccess) return 'success'
      const roll = rng()
      if (roll < 0.15) return 'failure'
      if (roll < 0.35) return rng() < 0.5 ? 'late-success' : 'late-failure'
      return 'success'
    }

    const sessionUndo = createSessionUndo(
      {
        undo: async (step) => {
          const id = step.recordIds[0]
          const record = recordsById.get(id)
          if (!record) return { outcome: 'refused', reason: 'not-found' }
          if (store !== record.after) return { outcome: 'stale', reason: 'page-changed' }
          check(!undoneIds.has(id), `record ${id} undone twice`)
          undoneIds.add(id)
          store = record.before
          visitedStates.add(store)
          return { outcome: 'done', records: [fakeRecord(id)] }
        },
        redo: async (step) => {
          const id = step.recordIds[0]
          const record = recordsById.get(id)
          if (!record) return { outcome: 'refused', reason: 'not-found' }
          if (store !== record.before) return { outcome: 'stale', reason: 'page-changed' }
          check(undoneIds.has(id), `record ${id} redone without having been undone`)
          undoneIds.delete(id)
          store = record.after
          visitedStates.add(store)
          return { outcome: 'done', records: [fakeRecord(id)] }
        },
      },
      { timeoutMs: 25 }
    )

    const applySuccess = (op: { before: Store; after: Store }) => {
      check(op.before === store, `writer applied before=${op.before}, store held ${store}`)
      check(!appliedAfterValues.has(op.after), `op ${op.after} applied more than once`)
      appliedAfterValues.add(op.after)
      store = op.after
      visitedStates.add(store)
      const id = `r${seed}-${nextRecordId++}`
      recordsById.set(id, { before: op.before, after: op.after })
      // `commit.ts`'s own order: `trackPending` gets the record-append
      // promise BEFORE it resolves, right after the write lands — not at
      // enqueue time, so a rejected write never reaches this at all.
      let resolveLogged: () => void = () => {}
      const logged = new Promise<void>((resolve) => {
        resolveLogged = resolve
      })
      sessionUndo.trackPending(POND_ID, logged)
      sessionUndo.remember({ pondId: POND_ID, recordIds: [id] })
      resolveLogged()
    }

    const writer: PageWriter<Store> = (op) => {
      check(
        op.before === store,
        `writer before mismatch at call time — op.before=${op.before}, store=${store}`
      )
      const outcome = decide()

      if (outcome === 'failure') {
        return Promise.reject(new Error(`seed ${seed}: scripted immediate failure`))
      }
      if (outcome === 'success') {
        applySuccess(op)
        return Promise.resolve()
      }

      return new Promise<void>((resolve, reject) => {
        pendingLate.push({
          outcome: outcome === 'late-success' ? 'success' : 'failure',
          settle: () => {
            if (outcome === 'late-success') {
              applySuccess(op)
              resolve()
            } else {
              reject(new Error(`seed ${seed}: scripted late failure`))
            }
          },
        })
      })
    }

    const queue = createPageWriteQueue<Store>(writer, store)
    const settled: Array<Promise<unknown>> = []

    // Set for the span of an ⌘Z/⇧⌘Z's own background wait (below): a NEW
    // enqueue landing in that window applies with `before = head()`, which
    // the queue itself keeps correct, but the MODEL's `store` only moves once
    // the undo/redo callback actually runs — KAN-407's seam (see the
    // describe-block comment), not this item's drained()-during-retry fix.
    // Skipping new enqueues for that one span keeps the walk's own model (not
    // the queue) internally consistent without masking the retry-in-flight
    // scenario this item does cover — that one lives entirely inside the
    // queue's own halt/retry bookkeeping, untouched by this flag. Also gates
    // a second ⌘Z/⇧⌘Z firing while the first is still waiting, for the same
    // reason (see the describe-block comment's last paragraph).
    let undoInFlight = false

    const steps = 16 + randomInt(24)
    for (let step = 0; step < steps; step += 1) {
      const action = randomInt(7)
      if ((action === 0 || action === 1) && !undoInFlight) {
        nextValue += 1
        const value = nextValue
        enqueuedValues.add(value)
        const kind: PageWriteKind = action === 0 ? 'typed' : 'structural'
        settled.push(queue.enqueue({ kind, after: value }).catch(() => undefined))
      } else if (action === 2) {
        pendingLate.shift()?.settle()
      } else if (action === 3) {
        if (queue.halted()) settled.push(queue.retry().catch(() => undefined))
      } else if ((action === 4 || action === 5) && !undoInFlight) {
        // ⌘Z / ⇧⌘Z — always wait on the drain first, unconditionally (see the
        // describe-block comment above): this is what lets the random walk
        // land one while a retry of a halted op is still in flight. Run in the
        // background, not awaited inline here: a drain the step waits on can
        // depend on a LATE write this same run only settles via a LATER
        // step's `action === 2`, so blocking the walk's own for-loop on it
        // here would deadlock the walk against itself — production never has
        // this problem, since a real write's promise settles off its own
        // network call, not off the next keystroke.
        const direction = action === 4 ? 'undo' : 'redo'
        undoInFlight = true
        settled.push(
          (async () => {
            try {
              const drain = queue.drained()
              if (drain) await drain
              if (queue.halted()) return
              const outcome = await sessionUndo[direction](POND_ID)
              check(
                visitedStates.has(store),
                `after ${direction}, store ${store} was never a state the store actually held`
              )
              if (outcome.outcome === 'done' && queue.idle()) {
                queue.rebase(store)
              }
            } finally {
              undoInFlight = false
            }
          })()
        )
      } else {
        const drain = queue.drained()
        if (drain) settled.push(drain)
      }
      await Promise.resolve()
    }

    // Same forced drain as the base property test: from here every fresh
    // writer call succeeds, so the run always terminates.
    forceSuccess = true
    let drainIterations = 0
    while (appliedAfterValues.size < enqueuedValues.size) {
      drainIterations += 1
      check(drainIterations < 2_000, 'drain never settled — queue stuck halted/pending')
      if (drainIterations >= 2_000) break

      if (pendingLate.length > 0) {
        pendingLate.shift()?.settle()
      } else if (queue.halted()) {
        settled.push(queue.retry().catch(() => undefined))
      }
      await Promise.resolve()
      await Promise.resolve()
    }

    await Promise.all(settled)

    // Unwind whatever ⌘Z can still take back, re-checking the same invariants
    // on the way down, then confirm the model never diverged from `queue`'s
    // own bookkeeping.
    while (queue.idle() && sessionUndo.getSnapshot(POND_ID).canUndo) {
      const outcome = await sessionUndo.undo(POND_ID)
      check(visitedStates.has(store), `unwind: store ${store} was never a state the store actually held`)
      if (outcome.outcome === 'done' && queue.idle()) queue.rebase(store)
      if (outcome.outcome !== 'done') break
    }

    check(queue.head() === store, `final head() (${queue.head()}) !== undo model's store (${store})`)
    check(
      recordsById.size === appliedAfterValues.size,
      `recordsById has ${recordsById.size} entries, expected one per applied op (${appliedAfterValues.size})`
    )

    return { violations }
  }

  it('holds store/undo invariants over 200 random sequences including ⌘Z/⇧⌘Z', async () => {
    const baseSeed = 9_000
    const runs = 200

    for (let i = 0; i < runs; i += 1) {
      const seed = baseSeed + i
      let result: RunResult
      try {
        result = await runUndoSequence(seed)
      } catch (err) {
        console.error(`createPageWriteQueue+sessionUndo property test: run ${i} failed with seed ${seed}`)
        throw err
      }

      if (result.violations.length > 0) {
        console.error(`createPageWriteQueue+sessionUndo property test: run ${i}, seed ${seed}`, result.violations)
      }
      expect(result.violations).toEqual([])
    }
  }, 60_000)
})
