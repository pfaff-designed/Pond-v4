/**
 * Session undo — src/lib/change-log/undo.ts and session-undo.ts (KAN-93).
 *
 * The RPCs themselves (compare-and-swap, status transitions, multi-record steps)
 * are proved against real Postgres in change-log-undo.pglite.test.ts. What is
 * pinned here is the client side of the contract:
 *
 *   - a stale undo comes back as an ordinary outcome that says why, not a crash;
 *   - a step that landed sweeps the page's pending block diffs, because the page
 *     moved and `accept_change_log_record` does not compare before it writes;
 *   - the session stack: one step per remembered change, redo cleared by a new
 *     one, a refused step dropped, a failed call put back, cleared on pagehide.
 */

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  markOutdated: jest.fn(),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

import { act, renderHook } from '@testing-library/react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { markOutdated } from '@/lib/change-log/store'
import { redoStep, undoStep, type StepResult, type UndoStep } from '@/lib/change-log/undo'
import {
  clearOnPageHide,
  createSessionUndo,
  sessionUndo,
  useSessionUndo,
} from '@/lib/change-log/session-undo'
import type { ChangeLogRow } from '@/lib/change-log/types'

const mockedSweep = markOutdated as jest.MockedFunction<typeof markOutdated>

const POND = 'pond-1'
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

const STEP: UndoStep = { pondId: POND, recordIds: ['edit-1'] }

beforeEach(() => {
  mockedSweep.mockReset()
  mockedSweep.mockResolvedValue([])
})

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
    expect(result.kind).toBe('done')
    if (result.kind !== 'done') return
    expect(result.records.map((r) => [r.id, r.action, r.links.undoOf])).toEqual([
      ['undo-1', 'undo', 'edit-1'],
    ])
  })

  it('reports a page that changed since as stale, with the reason', async () => {
    const { client } = fakeSupabase({
      error: { code: '40001', message: 'page p changed since change_log record r' },
    })

    await expect(undoStep(client, STEP)).resolves.toEqual({
      kind: 'stale',
      message: 'page p changed since change_log record r',
    })
  })

  it.each([
    ['22023', 'is undone, only an accepted record can be undone'],
    ['P0002', 'change_log record r not found'],
    ['0A000', 'a create_page cannot be undone'],
    ['23505', 'duplicate key value'],
  ])('reports a %s refusal as refused, not as a crash', async (code, message) => {
    const { client } = fakeSupabase({ error: { code, message } })

    await expect(undoStep(client, STEP)).resolves.toEqual({ kind: 'refused', message })
  })

  it('throws what it cannot classify, so the step can be tried again', async () => {
    const { client } = fakeSupabase({ error: { message: 'Failed to fetch' } })

    await expect(undoStep(client, STEP)).rejects.toMatchObject({ message: 'Failed to fetch' })
  })

  it('sweeps each block page once, against the blocks it ended on', async () => {
    const { client } = fakeSupabase({
      data: [
        row({ id: 'u2', target_page_id: 'page-1', after: B }),
        row({ id: 'u1', target_page_id: 'page-1', after: A }),
        row({ id: 'u3', target_page_id: 'recipes', before: { id: 'r', title: 'x', values: {}, shown: {} }, after: null }), // prettier-ignore
      ],
    })

    await undoStep(client, STEP)

    expect(mockedSweep).toHaveBeenCalledTimes(1)
    expect(mockedSweep).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        userId: 'user-1',
        pondId: POND,
        targetPageId: 'page-1',
        pageBlocks: A,
        actions: ['edit', 'revert'],
      })
    )
  })

  it('still reports the undo when the sweep after it fails', async () => {
    const { client } = fakeSupabase({ data: [row()] })
    mockedSweep.mockRejectedValue(new Error('network'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(undoStep(client, STEP)).resolves.toMatchObject({ kind: 'done' })
    spy.mockRestore()
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
    expect(result.kind === 'done' && result.records[0].links.redoOf).toBe('edit-1')
  })
})

// ── The session stack ────────────────────────────────────────────────────────

const done = (ids: string[]): StepResult => ({
  kind: 'done',
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

const makeStore = () => {
  const run = {
    undo: jest.fn<Promise<StepResult>, [UndoStep]>().mockResolvedValue(done(['u'])),
    redo: jest.fn<Promise<StepResult>, [UndoStep]>().mockResolvedValue(done(['r'])),
  }
  return { store: createSessionUndo(run), run }
}

describe('createSessionUndo', () => {
  it('starts with nothing to undo or redo', async () => {
    const { store, run } = makeStore()

    expect(store.getSnapshot()).toEqual({ canUndo: false, canRedo: false })
    await expect(store.undo()).resolves.toEqual({ kind: 'empty' })
    await expect(store.redo()).resolves.toEqual({ kind: 'empty' })
    expect(run.undo).not.toHaveBeenCalled()
  })

  it('makes a remembered change undoable and tells subscribers', () => {
    const { store } = makeStore()
    const listener = jest.fn()
    store.subscribe(listener)

    store.remember(STEP)

    expect(store.getSnapshot().canUndo).toBe(true)
    expect(listener).toHaveBeenCalled()
  })

  it('hands useSyncExternalStore the same snapshot until something changes', () => {
    const { store } = makeStore()
    const first = store.getSnapshot()

    expect(store.getSnapshot()).toBe(first)
    store.remember(STEP)
    expect(store.getSnapshot()).not.toBe(first)
  })

  it('ignores a step with no records', () => {
    const { store } = makeStore()

    store.remember({ pondId: POND, recordIds: [] })

    expect(store.getSnapshot().canUndo).toBe(false)
  })

  it('stops notifying once unsubscribed', () => {
    const { store } = makeStore()
    const listener = jest.fn()
    const unsubscribe = store.subscribe(listener)

    unsubscribe()
    store.remember(STEP)

    expect(listener).not.toHaveBeenCalled()
  })

  it('undoes the newest step first, then offers it for redo', async () => {
    const { store, run } = makeStore()
    const older: UndoStep = { pondId: POND, recordIds: ['older'] }
    store.remember(older)
    store.remember(STEP)

    const outcome = await store.undo()

    expect(run.undo).toHaveBeenCalledWith(STEP)
    expect(outcome).toMatchObject({ kind: 'done', step: STEP })
    expect(store.getSnapshot()).toEqual({ canUndo: true, canRedo: true })
  })

  it('redoes the step it undid, and the redo records become the next undo', async () => {
    const { store, run } = makeStore()
    store.remember(STEP)
    await store.undo()

    await store.redo()

    expect(run.redo).toHaveBeenCalledWith(STEP)
    expect(store.getSnapshot()).toEqual({ canUndo: true, canRedo: false })
    await store.undo()
    expect(run.undo).toHaveBeenLastCalledWith({ pondId: POND, recordIds: ['r'] })
  })

  it('drops the redo history when a new change is remembered', async () => {
    const { store } = makeStore()
    store.remember(STEP)
    await store.undo()

    store.remember({ pondId: POND, recordIds: ['new'] })

    expect(store.getSnapshot().canRedo).toBe(false)
  })

  it('drops a stale step and reports why — it cannot succeed later', async () => {
    const { store, run } = makeStore()
    run.undo.mockResolvedValue({ kind: 'stale', message: 'page p changed since' })
    store.remember(STEP)

    const outcome = await store.undo()

    expect(outcome).toEqual({ kind: 'stale', message: 'page p changed since', step: STEP })
    expect(store.getSnapshot()).toEqual({ canUndo: false, canRedo: false })
  })

  it('puts a step back when the call itself failed, and rethrows', async () => {
    const { store, run } = makeStore()
    run.undo.mockRejectedValue(new Error('Failed to fetch'))
    store.remember(STEP)

    await expect(store.undo()).rejects.toThrow('Failed to fetch')

    expect(store.getSnapshot().canUndo).toBe(true)
    run.undo.mockResolvedValue(done(['u']))
    await store.undo()
    expect(run.undo).toHaveBeenLastCalledWith(STEP)
  })

  it('runs quick successive undos one after another, newest first', async () => {
    const { store, run } = makeStore()
    const older: UndoStep = { pondId: POND, recordIds: ['older'] }
    store.remember(older)
    store.remember(STEP)
    const order: string[] = []
    run.undo.mockImplementation(async (step) => {
      order.push(`start ${step.recordIds[0]}`)
      await Promise.resolve()
      order.push(`end ${step.recordIds[0]}`)
      return done(['u'])
    })

    await Promise.all([store.undo(), store.undo()])

    expect(order).toEqual(['start edit-1', 'end edit-1', 'start older', 'end older'])
  })

  it('clears both stacks', () => {
    const { store } = makeStore()
    store.remember(STEP)

    store.clear()

    expect(store.getSnapshot()).toEqual({ canUndo: false, canRedo: false })
  })
})

describe('useSessionUndo', () => {
  it('re-renders when the tab’s history gains or loses a step', () => {
    const { result } = renderHook(() => useSessionUndo())
    expect(result.current.canUndo).toBe(false)

    act(() => sessionUndo.remember(STEP))
    expect(result.current).toEqual({ canUndo: true, canRedo: false })

    act(() => sessionUndo.clear())
    expect(result.current.canUndo).toBe(false)
  })

  it('empties the tab’s history on pagehide', () => {
    sessionUndo.remember(STEP)

    window.dispatchEvent(new Event('pagehide'))

    expect(sessionUndo.getSnapshot().canUndo).toBe(false)
  })
})

describe('clearOnPageHide', () => {
  it('empties the session when the tab or app goes away', () => {
    const { store } = makeStore()
    store.remember(STEP)
    const stop = clearOnPageHide(window, store)

    window.dispatchEvent(new Event('pagehide'))

    expect(store.getSnapshot().canUndo).toBe(false)
    stop()
  })

  it('stops listening once released', () => {
    const { store } = makeStore()
    const stop = clearOnPageHide(window, store)
    stop()
    store.remember(STEP)

    window.dispatchEvent(new Event('pagehide'))

    expect(store.getSnapshot().canUndo).toBe(true)
  })
})
