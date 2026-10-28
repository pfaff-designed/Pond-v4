/**
 * Session undo — src/lib/change-log/undo.ts and session-undo.ts.
 *
 * The RPCs themselves (compare-and-swap, status transitions, multi-record steps,
 * the outdated sweep) are proved against real Postgres in
 * change-log-undo.pglite.test.ts. What is pinned here is the client side:
 *
 *   - a refusal comes back as a reason code from a closed list, never raw text;
 *   - the session history is per pond, one step per remembered change, redo
 *     cleared by a new one, a stale or refused step dropped, a blocked step and
 *     a failed call put back, and a result that arrives after the history moved
 *     on does not land on it;
 *   - undo/redo wait out any `remember` still in flight for the pond before
 *     reading the stack, so a step being logged is never raced;
 *   - it is emptied on pagehide.
 */

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

import { act, renderHook } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { redoStep, undoStep, type HistoryStep, type StepResult } from '@/lib/change-log/undo'
import {
  clearOnPageHide,
  createSessionUndo,
  sessionUndo,
  SessionUndoTimeoutError,
  useSessionUndo,
} from '@/lib/change-log/session-undo'
import type { ChangeLogRow } from '@/lib/change-log/types'
import { clearPendingReorder, rememberReorder, takePendingReorder } from '@/lib/pond/favourites-undo'

const POND = 'pond-1'
const OTHER_POND = 'pond-2'
const A = [{ id: 'a', type: 'text', content: 'one' }]
const B = [{ id: 'a', type: 'text', content: 'ONE' }]

const row = (over: Partial<ChangeLogRow> = {}): ChangeLogRow => ({
  id: 'undo-1',
  user_id: 'user-1',
  pond_id: POND,
  status: 'accepted',
  action: 'undo',
  actor: 'you',
  target_page_id: 'page-1',
  target_block_id: null,
  before: B,
  after: A,
  source_thread_id: null,
  tool_call_id: null,
  read: null,
  links: { undo_of: 'edit-1' },
  transitions: [{ status: 'accepted', at: '2026-10-09T10:00:00.000Z', actor: 'you' }],
  created_at: '2026-10-09T10:00:00.000Z',
  status_at: '2026-10-09T10:00:00.000Z',
  ...over,
})

const fakeSupabase = (result: { data?: unknown; error?: unknown }) => {
  const rpc = jest
    .fn()
    .mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

const STEP: HistoryStep = { pondId: POND, recordIds: ['edit-1'] }

// ── undoStep / redoStep ──────────────────────────────────────────────────────

describe('undoStep', () => {
  it('calls the undo RPC with the step and returns the records it wrote', async () => {
    const { client, rpc } = fakeSupabase({ data: [row()] })

    const result = await undoStep(client, STEP)

    expect(rpc).toHaveBeenCalledWith('undo_change_log_record', {
      p_record_ids: ['edit-1'],
      p_pond_id: POND,
      p_actor: 'you',
    })
    expect(result.outcome).toBe('done')
    if (result.outcome !== 'done') return
    expect(result.records.map((r) => [r.id, r.action, r.links.undoOf])).toEqual([
      ['undo-1', 'undo', 'edit-1'],
    ])
  })

  it.each([['page-changed'], ['record-changed']])(
    'reports a P0001 %s as stale, with no text from the database',
    async (reason) => {
      const { client } = fakeSupabase({
        error: { code: 'P0001', details: reason, message: 'page 9f… changed since record 3a…' },
      })

      await expect(undoStep(client, STEP)).resolves.toEqual({ outcome: 'stale', reason })
    }
  )

  it('reports a 40001 stale reason as stale too, for a database before migration 0024', async () => {
    const { client } = fakeSupabase({
      error: {
        code: '40001',
        details: 'page-changed',
        message: 'page 9f… changed since record 3a…',
      },
    })

    await expect(undoStep(client, STEP)).resolves.toEqual({
      outcome: 'stale',
      reason: 'page-changed',
    })
  })

  it.each([
    ['22023', 'already-undone'],
    ['22023', 'not-undone'],
    ['22023', 'other-pond'],
    ['P0002', 'not-found'],
    ['P0002', 'page-gone'],
    ['0A000', 'not-undoable'],
    ['P0002', 'already-restored'],
  ])('reports a %s %s as refused', async (code, reason) => {
    const { client } = fakeSupabase({ error: { code, details: reason, message: 'record 3a…' } })

    await expect(undoStep(client, STEP)).resolves.toEqual({ outcome: 'refused', reason })
  })

  it.each([
    ['40001', 'linked-elsewhere'],
    ['23505', 'name-taken'],
  ])('reports a %s %s as blocked', async (code, reason) => {
    const { client } = fakeSupabase({ error: { code, details: reason, message: 'record 3a…' } })

    await expect(undoStep(client, STEP)).resolves.toEqual({ outcome: 'blocked', reason })
  })

  it('throws a stale code with a reason it does not know, rather than guess', async () => {
    const { client } = fakeSupabase({ error: { code: '40001', details: 'something-new' } })

    await expect(undoStep(client, STEP)).rejects.toMatchObject({ details: 'something-new' })
  })

  it('throws what has no code, so the step can be tried again', async () => {
    const { client } = fakeSupabase({ error: { message: 'Failed to fetch' } })

    await expect(undoStep(client, STEP)).rejects.toMatchObject({ message: 'Failed to fetch' })
  })
})

describe('redoStep', () => {
  it('calls the redo RPC with the step', async () => {
    const { client, rpc } = fakeSupabase({
      data: [row({ id: 'redo-1', action: 'redo', links: { redo_of: 'edit-1' } })],
    })

    const result = await redoStep(client, STEP)

    expect(rpc).toHaveBeenCalledWith('redo_change_log_record', {
      p_record_ids: ['edit-1'],
      p_pond_id: POND,
      p_actor: 'you',
    })
    expect(result.outcome === 'done' && result.records[0].links.redoOf).toBe('edit-1')
  })
})

// ── The session history ──────────────────────────────────────────────────────

const done = (ids: string[]): StepResult => ({
  outcome: 'done',
  records: ids.map((id) => ({
    id,
    userId: 'user-1',
    pondId: POND,
    status: 'accepted',
    action: 'redo',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: A,
    after: B,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '',
    statusAt: '',
  })),
})

const makeStore = (options?: { timeoutMs?: number }) => {
  const run = {
    undo: jest.fn<Promise<StepResult>, [HistoryStep]>().mockResolvedValue(done(['u'])),
    redo: jest.fn<Promise<StepResult>, [HistoryStep]>().mockResolvedValue(done(['r'])),
  }
  return { store: createSessionUndo(run, options), run }
}

/** A run call that stays in flight until `release` is called. */
const held = (result: StepResult) => {
  let release: () => void = () => {}
  const promise = new Promise<StepResult>((resolve) => {
    release = () => resolve(result)
  })
  return { promise, release: () => release() }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createSessionUndo', () => {
  it('starts with nothing to undo or redo', async () => {
    const { store, run } = makeStore()

    expect(store.getSnapshot(POND)).toEqual({
      canUndo: false,
      canRedo: false,
      topUndoRecordIds: [],
      redoRecordIds: [],
    })
    await expect(store.undo(POND)).resolves.toEqual({ outcome: 'empty' })
    await expect(store.redo(POND)).resolves.toEqual({ outcome: 'empty' })
    expect(run.undo).not.toHaveBeenCalled()
  })

  it('makes a remembered change undoable and tells subscribers', () => {
    const { store } = makeStore()
    const listener = jest.fn()
    store.subscribe(listener)

    store.remember(STEP)

    expect(store.getSnapshot(POND).canUndo).toBe(true)
    expect(listener).toHaveBeenCalled()
  })

  it('hands useSyncExternalStore the same snapshot until that pond changes', () => {
    const { store } = makeStore()
    store.remember(STEP)
    const first = store.getSnapshot(POND)

    expect(store.getSnapshot(POND)).toBe(first)
    store.remember({ pondId: OTHER_POND, recordIds: ['x'] })
    expect(store.getSnapshot(POND)).toBe(first)
    store.remember(STEP)
    expect(store.getSnapshot(POND)).not.toBe(first)
  })

  it('ignores a step with no records', () => {
    const { store } = makeStore()

    store.remember({ pondId: POND, recordIds: [] })

    expect(store.getSnapshot(POND).canUndo).toBe(false)
  })

  // KAN-569: a favourites reorder never rides this stack (no `target_page_id`
  // to key against) — it keeps its own pending-undo slot in `favourites-undo.ts`.
  // A later REAL step for the same pond must still clear that slot, so an
  // intervening page edit doesn't leave a stale reorder for the next ⌘Z.
  describe('clears a pond’s pending favourites reorder', () => {
    afterEach(() => {
      clearPendingReorder(POND)
      clearPendingReorder(OTHER_POND)
    })

    it('on remember', () => {
      const { store } = makeStore()
      rememberReorder(POND, ['a', 'b'])

      store.remember(STEP)

      expect(takePendingReorder(POND)).toBeNull()
    })

    it('on rememberPending', () => {
      const { store } = makeStore()
      rememberReorder(POND, ['a', 'b'])

      store.rememberPending({ pondId: POND, recordIds: new Promise(() => {}) })

      expect(takePendingReorder(POND)).toBeNull()
    })

    it('leaves another pond’s slot alone', () => {
      const { store } = makeStore()
      rememberReorder(OTHER_POND, ['a', 'b'])

      store.remember(STEP)

      expect(takePendingReorder(OTHER_POND)).toEqual(['a', 'b'])
    })

    it('leaves the slot when the step is ignored (no records)', () => {
      const { store } = makeStore()
      rememberReorder(POND, ['a', 'b'])

      store.remember({ pondId: POND, recordIds: [] })

      expect(takePendingReorder(POND)).toEqual(['a', 'b'])
    })
  })

  it('stops notifying once unsubscribed', () => {
    const { store } = makeStore()
    const listener = jest.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.remember(STEP)

    expect(listener).not.toHaveBeenCalled()
  })

  it('never undoes another pond’s step', async () => {
    const { store, run } = makeStore()
    store.remember(STEP)

    await expect(store.undo(OTHER_POND)).resolves.toEqual({ outcome: 'empty' })

    expect(run.undo).not.toHaveBeenCalled()
    expect(store.getSnapshot(OTHER_POND).canUndo).toBe(false)
    expect(store.getSnapshot(POND).canUndo).toBe(true)
  })

  it('keeps each pond’s history when the other is used', async () => {
    const { store, run } = makeStore()
    const elsewhere: HistoryStep = { pondId: OTHER_POND, recordIds: ['b-1'] }
    store.remember(STEP)
    store.remember(elsewhere)

    await store.undo(POND)

    expect(run.undo).toHaveBeenCalledWith(STEP)
    expect(store.getSnapshot(OTHER_POND)).toEqual({
      canUndo: true,
      canRedo: false,
      topUndoRecordIds: ['b-1'],
      redoRecordIds: [],
    })
  })

  it('undoes the newest step first, then offers it for redo', async () => {
    const { store, run } = makeStore()
    store.remember({ pondId: POND, recordIds: ['older'] })
    store.remember(STEP)

    const outcome = await store.undo(POND)

    expect(run.undo).toHaveBeenCalledWith(STEP)
    expect(outcome).toMatchObject({ outcome: 'done', step: STEP })
    expect(store.getSnapshot(POND)).toEqual({
      canUndo: true,
      canRedo: true,
      topUndoRecordIds: ['older'],
      redoRecordIds: STEP.recordIds,
    })
  })

  it('redoes the step it undid, and the redo records become the next undo', async () => {
    const { store, run } = makeStore()
    store.remember(STEP)
    await store.undo(POND)

    await store.redo(POND)

    expect(run.redo).toHaveBeenCalledWith(STEP)
    expect(store.getSnapshot(POND)).toEqual({
      canUndo: true,
      canRedo: false,
      topUndoRecordIds: ['r'],
      redoRecordIds: [],
    })
    await store.undo(POND)
    expect(run.undo).toHaveBeenLastCalledWith({ pondId: POND, recordIds: ['r'] })
  })

  it('drops the redo history when a new change is remembered', async () => {
    const { store } = makeStore()
    store.remember(STEP)
    await store.undo(POND)

    store.remember({ pondId: POND, recordIds: ['new'] })

    expect(store.getSnapshot(POND).canRedo).toBe(false)
  })

  it('does not offer redo for an undo that finished after a new change', async () => {
    const { store, run } = makeStore()
    const call = held(done(['u']))
    run.undo.mockReturnValue(call.promise)
    store.remember(STEP)

    const pending = store.undo(POND)
    await flush()
    store.remember({ pondId: POND, recordIds: ['new'] })
    call.release()
    await pending

    expect(store.getSnapshot(POND)).toEqual({
      canUndo: true,
      canRedo: false,
      topUndoRecordIds: ['new'],
      redoRecordIds: [],
    })
    await store.undo(POND)
    expect(run.undo).toHaveBeenLastCalledWith({ pondId: POND, recordIds: ['new'] })
  })

  it('files a redo that finished after a new change beneath it', async () => {
    const { store, run } = makeStore()
    store.remember(STEP)
    await store.undo(POND)
    const call = held(done(['r']))
    run.redo.mockReturnValue(call.promise)

    const pending = store.redo(POND)
    await flush()
    store.remember({ pondId: POND, recordIds: ['new'] })
    call.release()
    await pending

    await store.undo(POND)
    expect(run.undo).toHaveBeenLastCalledWith({ pondId: POND, recordIds: ['new'] })
    await store.undo(POND)
    expect(run.undo).toHaveBeenLastCalledWith({ pondId: POND, recordIds: ['r'] })
  })

  it('a remember that resolves after undo() is called is still the step undo takes', async () => {
    const { store, run } = makeStore()
    store.remember({ pondId: POND, recordIds: ['older'] })
    let resolvePending: () => void = () => {}
    const pendingRemember = new Promise<void>((resolve) => {
      resolvePending = resolve
    })
    store.trackPending(POND, pendingRemember)

    const outcome = store.undo(POND)
    await flush()
    store.remember(STEP)
    resolvePending()
    await outcome

    expect(run.undo).toHaveBeenCalledWith(STEP)
  })

  it('lands nothing on a history cleared while a call was in flight', async () => {
    const { store, run } = makeStore()
    const call = held(done(['u']))
    run.undo.mockReturnValue(call.promise)
    store.remember(STEP)

    const pending = store.undo(POND)
    await flush()
    store.clear()
    call.release()
    await pending

    expect(store.getSnapshot(POND)).toEqual({
      canUndo: false,
      canRedo: false,
      topUndoRecordIds: [],
      redoRecordIds: [],
    })
  })

  it('drops a stale step and reports why — it cannot succeed later', async () => {
    const { store, run } = makeStore()
    run.undo.mockResolvedValue({ outcome: 'stale', reason: 'page-changed' })
    store.remember(STEP)

    const outcome = await store.undo(POND)

    expect(outcome).toEqual({ outcome: 'stale', reason: 'page-changed', step: STEP })
    expect(store.getSnapshot(POND)).toEqual({
      canUndo: false,
      canRedo: false,
      topUndoRecordIds: [],
      redoRecordIds: [],
    })
  })

  it('drops a refused step and reports why', async () => {
    const { store, run } = makeStore()
    run.undo.mockResolvedValue({ outcome: 'refused', reason: 'already-undone' })
    store.remember(STEP)

    const outcome = await store.undo(POND)

    expect(outcome).toEqual({ outcome: 'refused', reason: 'already-undone', step: STEP })
    expect(store.getSnapshot(POND).canUndo).toBe(false)
  })

  it('keeps a blocked undo on top and reports why, so it runs again once cleared', async () => {
    const { store, run } = makeStore()
    store.remember({ pondId: POND, recordIds: ['older'] })
    store.remember(STEP)
    run.undo.mockResolvedValueOnce({ outcome: 'blocked', reason: 'linked-elsewhere' })

    const outcome = await store.undo(POND)

    expect(outcome).toEqual({ outcome: 'blocked', reason: 'linked-elsewhere', step: STEP })
    expect(store.getSnapshot(POND)).toEqual({
      canUndo: true,
      canRedo: false,
      topUndoRecordIds: STEP.recordIds,
      redoRecordIds: [],
    })
    await store.undo(POND)
    expect(run.undo).toHaveBeenLastCalledWith(STEP)
  })

  it('keeps a blocked redo on top of redo', async () => {
    const { store, run } = makeStore()
    store.remember({ pondId: POND, recordIds: ['older'] })
    store.remember(STEP)
    await store.undo(POND)
    await store.undo(POND)
    run.redo.mockResolvedValueOnce({ outcome: 'blocked', reason: 'name-taken' })

    const outcome = await store.redo(POND)

    expect(outcome).toEqual({
      outcome: 'blocked',
      reason: 'name-taken',
      step: { pondId: POND, recordIds: ['older'] },
    })
    expect(store.getSnapshot(POND)).toEqual({
      canUndo: false,
      canRedo: true,
      topUndoRecordIds: [],
      redoRecordIds: ['edit-1', 'older'],
    })
    await store.redo(POND)
    expect(run.redo).toHaveBeenLastCalledWith({ pondId: POND, recordIds: ['older'] })
  })

  it('puts a step back when the call itself failed, and rethrows', async () => {
    const { store, run } = makeStore()
    run.undo.mockRejectedValue(new Error('Failed to fetch'))
    store.remember(STEP)

    await expect(store.undo(POND)).rejects.toThrow('Failed to fetch')

    expect(store.getSnapshot(POND).canUndo).toBe(true)
    run.undo.mockResolvedValue(done(['u']))
    await store.undo(POND)
    expect(run.undo).toHaveBeenLastCalledWith(STEP)
  })

  it('does not put back a failed redo once a new change has emptied redo', async () => {
    const { store, run } = makeStore()
    store.remember(STEP)
    await store.undo(POND)
    let fail: (err: Error) => void = () => {}
    run.redo.mockReturnValue(
      new Promise<StepResult>((_, reject) => {
        fail = reject
      })
    )

    const pending = store.redo(POND)
    await flush()
    store.remember({ pondId: POND, recordIds: ['new'] })
    fail(new Error('Failed to fetch'))
    await expect(pending).rejects.toThrow('Failed to fetch')

    expect(store.getSnapshot(POND).canRedo).toBe(false)
  })

  it('runs quick successive undos one after another, newest first', async () => {
    const { store, run } = makeStore()
    store.remember({ pondId: POND, recordIds: ['older'] })
    store.remember(STEP)
    const order: string[] = []
    run.undo.mockImplementation(async (step) => {
      order.push(`start ${step.recordIds[0]}`)
      await Promise.resolve()
      order.push(`end ${step.recordIds[0]}`)
      return done(['u'])
    })

    await Promise.all([store.undo(POND), store.undo(POND)])

    expect(order).toEqual(['start edit-1', 'end edit-1', 'start older', 'end older'])
  })

  describe('a hung call', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('rejects with SessionUndoTimeoutError after the timeout, and puts the step back on top', async () => {
      const { store, run } = makeStore({ timeoutMs: 1000 })
      run.undo.mockReturnValue(new Promise<StepResult>(() => {}))
      store.remember(STEP)

      const pending = store.undo(POND)
      await jest.advanceTimersByTimeAsync(1000)

      await expect(pending).rejects.toThrow(SessionUndoTimeoutError)
      expect(store.getSnapshot(POND).canUndo).toBe(true)
    })

    it('does not freeze the queue — a second call behind it still runs and resolves', async () => {
      const { store, run } = makeStore({ timeoutMs: 1000 })
      run.undo.mockReturnValueOnce(new Promise<StepResult>(() => {}))
      store.remember(STEP)

      const first = store.undo(POND)
      const second = store.undo(POND)
      await jest.advanceTimersByTimeAsync(1000)

      await expect(first).rejects.toThrow(SessionUndoTimeoutError)
      await expect(second).resolves.toMatchObject({ outcome: 'done', step: STEP })
    })

    it('does not let a trackPending promise that never settles block undo past the timeout', async () => {
      const { store, run } = makeStore({ timeoutMs: 1000 })
      store.remember(STEP)
      store.trackPending(POND, new Promise<void>(() => {}))

      const pending = store.undo(POND)
      await jest.advanceTimersByTimeAsync(1000)

      await expect(pending).resolves.toMatchObject({ outcome: 'done', step: STEP })
      expect(run.undo).toHaveBeenCalledWith(STEP)
    })
  })

  describe('rememberPending', () => {
    it('awaits a still-pending step before calling the RPC, then undoes it once it resolves', async () => {
      const { store, run } = makeStore()
      let resolvePending: (ids: readonly string[] | null) => void = () => {}
      const pending = new Promise<readonly string[] | null>((resolve) => {
        resolvePending = resolve
      })
      store.rememberPending({ pondId: POND, recordIds: pending })
      expect(store.getSnapshot(POND).canUndo).toBe(true)

      const outcome = store.undo(POND)
      await flush()
      expect(run.undo).not.toHaveBeenCalled()

      resolvePending(['edit-1'])
      await expect(outcome).resolves.toMatchObject({
        outcome: 'done',
        step: { pondId: POND, recordIds: ['edit-1'] },
      })
      expect(run.undo).toHaveBeenCalledWith({ pondId: POND, recordIds: ['edit-1'] })
    })

    it('drops a pending step that resolves to nothing written, remembering nothing', async () => {
      const { store, run } = makeStore()
      store.rememberPending({ pondId: POND, recordIds: Promise.resolve(null) })

      const outcome = await store.undo(POND)

      expect(outcome).toEqual({ outcome: 'empty' })
      expect(run.undo).not.toHaveBeenCalled()
      expect(store.getSnapshot(POND).canUndo).toBe(false)
    })

    it('falls through to the real step beneath a pending one that resolves to nothing written, if it had already settled before the press', async () => {
      const { store, run } = makeStore()
      store.remember({ pondId: POND, recordIds: ['older'] })
      const resolved = Promise.resolve(null)
      store.rememberPending({ pondId: POND, recordIds: resolved })
      // Let the pending step's own `.then` land before pressing undo, so this
      // press finds it already settled — the scenario the fall-through covers.
      await resolved

      const outcome = await store.undo(POND)

      expect(outcome).toMatchObject({ outcome: 'done', step: { pondId: POND, recordIds: ['older'] } })
      expect(run.undo).toHaveBeenCalledTimes(1)
      expect(run.undo).toHaveBeenCalledWith({ pondId: POND, recordIds: ['older'] })
      expect(store.getSnapshot(POND).canUndo).toBe(false)
    })

    it('does not fall through to an older step when the press itself finds the step still pending and it resolves to nothing written', async () => {
      const { store, run } = makeStore()
      store.remember({ pondId: POND, recordIds: ['typing-a'] })
      let resolveMove: (ids: readonly string[] | null) => void = () => {}
      const movePending = new Promise<readonly string[] | null>((resolve) => {
        resolveMove = resolve
      })
      store.rememberPending({ pondId: POND, recordIds: movePending })

      // ⌘Z at once: this press reaches the move's step while it is still in
      // flight — its save is then refused, resolving to nothing written.
      const outcome = store.undo(POND)
      await flush()
      expect(run.undo).not.toHaveBeenCalled()
      resolveMove(null)

      await expect(outcome).resolves.toEqual({ outcome: 'empty' })
      expect(run.undo).not.toHaveBeenCalled()
      // The typing step beneath it is untouched by this press.
      expect(store.getSnapshot(POND).canUndo).toBe(true)
      expect(store.getSnapshot(POND).topUndoRecordIds).toEqual(['typing-a'])

      const second = await store.undo(POND)
      expect(second).toMatchObject({ outcome: 'done', step: { pondId: POND, recordIds: ['typing-a'] } })
      expect(run.undo).toHaveBeenCalledWith({ pondId: POND, recordIds: ['typing-a'] })
    })

    describe('a hung pending step', () => {
      beforeEach(() => jest.useFakeTimers())
      afterEach(() => jest.useRealTimers())

      it('times out waiting on recordIds rather than stalling the queue, and puts it back', async () => {
        const { store, run } = makeStore({ timeoutMs: 1000 })
        store.rememberPending({ pondId: POND, recordIds: new Promise<readonly string[] | null>(() => {}) })

        const first = store.undo(POND)
        await Promise.resolve()
        store.remember({ pondId: POND, recordIds: ['edit-1'] })
        const second = store.undo(POND)
        await jest.advanceTimersByTimeAsync(1000)

        await expect(first).rejects.toThrow(SessionUndoTimeoutError)
        await expect(second).resolves.toMatchObject({ outcome: 'done' })
        expect(run.undo).toHaveBeenCalledTimes(1)
        expect(run.undo).toHaveBeenCalledWith({ pondId: POND, recordIds: ['edit-1'] })
      })
    })

    describe('isTopUndo', () => {
      it('is true for the handle a pending step was just remembered with, false once another step lands on top', () => {
        const { store } = makeStore()
        const handle = store.rememberPending({ pondId: POND, recordIds: Promise.resolve(['edit-1']) })

        expect(store.isTopUndo(POND, handle)).toBe(true)

        store.remember({ pondId: POND, recordIds: ['edit-2'] })

        expect(store.isTopUndo(POND, handle)).toBe(false)
      })

      it('is false once the handle’s own step has been undone', async () => {
        const { store } = makeStore()
        const handle = store.rememberPending({ pondId: POND, recordIds: Promise.resolve(['edit-1']) })

        await store.undo(POND)

        expect(store.isTopUndo(POND, handle)).toBe(false)
      })

      it('is false for an unrelated object, and false in a pond with no history', () => {
        const { store } = makeStore()
        store.rememberPending({ pondId: POND, recordIds: Promise.resolve(['edit-1']) })

        expect(store.isTopUndo(POND, {})).toBe(false)
        expect(store.isTopUndo(OTHER_POND, {})).toBe(false)
      })
    })

    describe('undoHandle', () => {
      it('undoes the handle’s own step when it is on top, same as undo', async () => {
        const { store, run } = makeStore()
        const handle = store.rememberPending({ pondId: POND, recordIds: Promise.resolve(['delete-1']) })

        const outcome = await store.undoHandle(POND, handle)

        expect(outcome).toMatchObject({ outcome: 'done', step: { pondId: POND, recordIds: ['delete-1'] } })
        expect(run.undo).toHaveBeenCalledWith({ pondId: POND, recordIds: ['delete-1'] })
        expect(store.getSnapshot(POND).canUndo).toBe(false)
        expect(store.getSnapshot(POND).redoRecordIds).toEqual(['delete-1'])
      })

      it('returns empty without touching the stack when a FAILED or cancelled write leaves its step resolving to nothing, even while that step still sits on top', async () => {
        const { store, run } = makeStore()
        store.remember({ pondId: POND, recordIds: ['older'] })
        const handle = store.rememberPending({ pondId: POND, recordIds: Promise.resolve(null) })

        const outcome = await store.undoHandle(POND, handle)

        expect(outcome).toEqual({ outcome: 'empty' })
        expect(run.undo).not.toHaveBeenCalled()
        // The real step beneath the dead one is untouched — a handle-targeted
        // call never falls through, unlike a plain ⌘Z would.
        expect(store.getSnapshot(POND).canUndo).toBe(true)
        expect(store.getSnapshot(POND).topUndoRecordIds).toEqual(['older'])
      })

      it('returns empty without acting when the handle has sunk beneath later ⌘Z presses already queued ahead of it', async () => {
        const { store, run } = makeStore()
        store.remember({ pondId: POND, recordIds: ['x'] })
        const handle = store.rememberPending({ pondId: POND, recordIds: Promise.resolve(['delete-1']) })
        store.remember({ pondId: POND, recordIds: ['y'] })

        // ⌘Z, ⌘Z, click — all three queued back to back, before any of them
        // has actually run: the click's own `isTopUndo` read (at click time,
        // before this call) saw the handle still on top, but by the time ITS
        // turn in the queue comes up, the two ⌘Zs ahead of it have already
        // taken 'y' then the handle's own step.
        const first = store.undo(POND)
        const second = store.undo(POND)
        const third = store.undoHandle(POND, handle)

        await expect(third).resolves.toEqual({ outcome: 'empty' })
        await Promise.all([first, second])
        expect(run.undo).toHaveBeenCalledTimes(2)
        expect(run.undo).not.toHaveBeenCalledWith({ pondId: POND, recordIds: ['x'] })
        // 'x' is still there for a real ⌘Z to take — the click never reached it.
        expect(store.getSnapshot(POND).canUndo).toBe(true)
        expect(store.getSnapshot(POND).topUndoRecordIds).toEqual(['x'])
      })
    })
  })

  describe('onUndone / onRedone', () => {
    it('runs onUndone exactly once after undo lands done, and not at all on blocked/refused/stale', async () => {
      const outcomes: StepResult[] = [
        { outcome: 'blocked', reason: 'linked-elsewhere' },
        { outcome: 'refused', reason: 'already-undone' },
        { outcome: 'stale', reason: 'page-changed' },
      ]
      for (const outcome of outcomes) {
        const { store, run } = makeStore()
        run.undo.mockResolvedValue(outcome)
        const onUndone = jest.fn()
        store.remember({ pondId: POND, recordIds: ['edit-1'], onUndone })

        await store.undo(POND)

        expect(onUndone).not.toHaveBeenCalled()
      }

      const { store, run: doneRun } = makeStore()
      doneRun.undo.mockResolvedValue(done(['u']))
      const onUndone = jest.fn()
      store.remember({ pondId: POND, recordIds: ['edit-1'], onUndone })

      await store.undo(POND)

      expect(onUndone).toHaveBeenCalledTimes(1)
    })

    it('runs onRedone exactly once after redo lands done', async () => {
      const { store } = makeStore()
      const onUndone = jest.fn()
      const onRedone = jest.fn()
      store.remember({ pondId: POND, recordIds: ['edit-1'], onUndone, onRedone })
      await store.undo(POND)
      expect(onUndone).toHaveBeenCalledTimes(1)

      await store.redo(POND)

      expect(onRedone).toHaveBeenCalledTimes(1)
      expect(onUndone).toHaveBeenCalledTimes(1)
    })

    it('awaits an async onUndone before the undo call resolves', async () => {
      const { store, run } = makeStore()
      run.undo.mockResolvedValue(done(['u']))
      let resolveEffect: () => void = () => {}
      const onUndone = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveEffect = resolve
          })
      )
      store.remember({ pondId: POND, recordIds: ['edit-1'], onUndone })

      const pending = store.undo(POND)
      await flush()
      expect(onUndone).toHaveBeenCalledTimes(1)
      resolveEffect()

      await expect(pending).resolves.toMatchObject({ outcome: 'done' })
    })

    it('moves the step to redo and logs the error when onUndone throws, rather than losing it', async () => {
      const { store, run } = makeStore()
      run.undo.mockResolvedValue(done(['u']))
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      const onUndone = jest.fn().mockRejectedValue(new Error('side effect failed'))
      store.remember({ pondId: POND, recordIds: ['edit-1'], onUndone })

      const outcome = await store.undo(POND)

      expect(outcome).toMatchObject({ outcome: 'done' })
      expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'side effect failed' }))
      expect(store.getSnapshot(POND)).toEqual({
        canUndo: false,
        canRedo: true,
        topUndoRecordIds: [],
        redoRecordIds: ['edit-1'],
      })
      consoleError.mockRestore()
    })

    it('moves the step back to undo and logs the error when onRedone throws, rather than losing it', async () => {
      const { store } = makeStore()
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
      const onRedone = jest.fn().mockRejectedValue(new Error('side effect failed'))
      store.remember({ pondId: POND, recordIds: ['edit-1'], onRedone })
      await store.undo(POND)

      const outcome = await store.redo(POND)

      expect(outcome).toMatchObject({ outcome: 'done' })
      expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'side effect failed' }))
      // The redo RPC's own result records become the next undo step — same as
      // any other redo (see "redoes the step it undid…" above).
      expect(store.getSnapshot(POND)).toEqual({
        canUndo: true,
        canRedo: false,
        topUndoRecordIds: ['r'],
        redoRecordIds: [],
      })
      consoleError.mockRestore()
    })

    it('keeps onUndone/onRedone across repeated cycles — a redo re-remembered on undo must still carry them', async () => {
      const { store } = makeStore()
      const onUndone = jest.fn()
      const onRedone = jest.fn()
      store.remember({ pondId: POND, recordIds: ['edit-1'], onUndone, onRedone })

      await store.undo(POND)
      await store.redo(POND)
      await store.undo(POND)
      await store.redo(POND)

      expect(onUndone).toHaveBeenCalledTimes(2)
      expect(onRedone).toHaveBeenCalledTimes(2)
    })
  })

  it('clears every pond', () => {
    const { store } = makeStore()
    store.remember(STEP)
    store.remember({ pondId: OTHER_POND, recordIds: ['b-1'] })

    store.clear()

    expect(store.getSnapshot(POND)).toEqual({
      canUndo: false,
      canRedo: false,
      topUndoRecordIds: [],
      redoRecordIds: [],
    })
    expect(store.getSnapshot(OTHER_POND)).toEqual({
      canUndo: false,
      canRedo: false,
      topUndoRecordIds: [],
      redoRecordIds: [],
    })
  })
})

describe('useSessionUndo', () => {
  it('re-renders when the pond’s history gains or loses a step', () => {
    const { result } = renderHook(() => useSessionUndo(POND))
    expect(result.current.canUndo).toBe(false)

    act(() => sessionUndo.remember(STEP))
    expect(result.current).toEqual({
      canUndo: true,
      canRedo: false,
      topUndoRecordIds: STEP.recordIds,
      redoRecordIds: [],
    })

    act(() => sessionUndo.clear())
    expect(result.current.canUndo).toBe(false)
  })

  it('reads nothing without a pond', () => {
    sessionUndo.remember(STEP)
    const { result } = renderHook(() => useSessionUndo(null))

    expect(result.current).toEqual({
      canUndo: false,
      canRedo: false,
      topUndoRecordIds: [],
      redoRecordIds: [],
    })
    sessionUndo.clear()
  })

  it('empties the tab’s history on pagehide', () => {
    sessionUndo.remember(STEP)

    window.dispatchEvent(new Event('pagehide'))

    expect(sessionUndo.getSnapshot(POND).canUndo).toBe(false)
  })
})

describe('clearOnPageHide', () => {
  it('empties the session when the tab or app goes away', () => {
    const { store } = makeStore()
    store.remember(STEP)
    const stop = clearOnPageHide(window, store)

    window.dispatchEvent(new Event('pagehide'))

    expect(store.getSnapshot(POND).canUndo).toBe(false)
    stop()
  })

  it('stops listening once released', () => {
    const { store } = makeStore()
    const stop = clearOnPageHide(window, store)
    stop()
    store.remember(STEP)

    window.dispatchEvent(new Event('pagehide'))

    expect(store.getSnapshot(POND).canUndo).toBe(true)
  })
})
