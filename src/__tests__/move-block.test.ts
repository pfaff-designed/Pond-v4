/**
 * @jest-environment node
 *
 * KAN-479: `moveBlockToPage`'s write — the target gets the block last with
 * its own id, the source loses it, and both land as ONE history step
 * (source's record id, then target's). Mocked at `commitBlocks`'s own
 * boundary (`@/lib/pages/client`, `@/lib/change-log/store`), same layer
 * `own-edit-outdated.test.ts` mocks at, so the real `commitBlocks` runs.
 */

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  markOutdated: jest.fn().mockResolvedValue([]),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn(),
  saveBlocks: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/page-flush', () => ({
  flushPendingPageSave: jest.fn().mockResolvedValue(undefined),
}))
// `sessionUndo.undo`'s real queueing (session-undo.ts) is what proves a ⌘Z
// mid-move takes THIS step, not whatever sits beneath it — only the RPC
// boundary it calls through `createClient()` is faked here.
jest.mock('@/lib/supabase/client', () => {
  const rpc = jest.fn(async (fn: string, params: { p_record_ids: string[] }) => {
    if (fn !== 'undo_change_log_record') {
      return { data: null, error: { message: 'unsupported', details: 'not-found', hint: '', code: '' } }
    }
    const now = new Date().toISOString()
    return {
      data: params.p_record_ids.map((id) => ({
        id: `undo-${id}`,
        user_id: 'user-1',
        pond_id: 'pond-1',
        status: 'accepted',
        action: 'undo',
        actor: 'you',
        target_page_id: null,
        target_block_id: null,
        before: null,
        after: null,
        source_thread_id: null,
        tool_call_id: null,
        read: null,
        links: {},
        transitions: [],
        created_at: now,
        status_at: now,
      })),
      error: null,
    }
  })
  return { createClient: () => ({ rpc }) }
})

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { QueryClient } from '@tanstack/react-query'
import { appendOwnEdit } from '@/lib/change-log/store'
import { getPage, saveBlocks } from '@/lib/pages/client'
import type { PondPage } from '@/lib/pages/client'
import { moveBlockAndStageUndo, moveBlockToPage, planBlockMove } from '@/lib/pages/move-block'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { createClient } from '@/lib/supabase/client'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'
import type { BlockWidth } from '@/lib/modules/content'

const mockedGetPage = getPage as jest.MockedFunction<typeof getPage>
const mockedSaveBlocks = saveBlocks as jest.MockedFunction<typeof saveBlocks>
const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>
const mockedRpc = (createClient() as unknown as { rpc: jest.Mock }).rpc

const page = (id: string, blocks: Block[]): PondPage => ({
  id,
  parentId: null,
  type: 'page',
  title: id,
  blocks,
  order: 0,
  props: {},
})

const BLOCK: Block = { id: 'block-1', type: 'text', content: 'checklist' } as unknown as Block
const KEPT: Block = { id: 'kept', type: 'text', content: 'stays' } as unknown as Block
const EXISTING: Block = { id: 'existing', type: 'text', content: 'house has one already' } as unknown as Block

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
} as unknown as SupabaseClient<Database>

const queryClient = { invalidateQueries: jest.fn().mockResolvedValue(undefined) } as unknown as QueryClient

beforeEach(() => {
  jest.clearAllMocks()
  sessionUndo.clear()
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  mockedGetPage.mockImplementation(async (_s, id) => {
    if (id === 'verify') return page('verify', [KEPT, BLOCK])
    if (id === 'house') return page('house', [EXISTING])
    return null
  })
  mockedAppend.mockImplementation(
    async (_s, input) => ({ id: `rec-${input.targetPageId}` }) as ChangeLogRecord
  )
})

it('moves the block to the end of the target with the same id, and off the source', async () => {
  const result = await moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })

  expect(result).not.toBeNull()
  const [, targetId, targetBlocks] = mockedSaveBlocks.mock.calls[0]
  expect(targetId).toBe('house')
  expect(targetBlocks.at(-1)).toEqual(BLOCK)
  expect(targetBlocks).toEqual([EXISTING, BLOCK])

  const [, sourceId, sourceBlocks] = mockedSaveBlocks.mock.calls[1]
  expect(sourceId).toBe('verify')
  expect(sourceBlocks).toEqual([KEPT])
})

it('reports one history step with both record ids, source first', async () => {
  const result = await moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })

  expect(result).toMatchObject({ pondId: 'pond-1', recordIds: ['rec-verify', 'rec-house'] })
  expect(result?.handle).not.toBeNull()
})

it('leaves the source untouched when the target write fails', async () => {
  mockedSaveBlocks.mockRejectedValueOnce(new Error('network'))

  await expect(
    moveBlockToPage(supabase, queryClient, {
      blockId: 'block-1',
      sourcePageId: 'verify',
      targetPageId: 'house',
      pondId: 'pond-1',
    })
  ).rejects.toThrow('network')

  expect(mockedSaveBlocks).toHaveBeenCalledTimes(1)
  // The reserved slot resolved to nothing written — a ⌘Z finds it, and
  // drops it, rather than undoing some unrelated earlier step.
  await expect(sessionUndo.undo('pond-1')).resolves.toEqual({ outcome: 'empty' })
})

it('a failed source write leaves the target unchanged and nothing on the undo stack', async () => {
  mockedSaveBlocks.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'))

  await expect(
    moveBlockToPage(supabase, queryClient, {
      blockId: 'block-1',
      sourcePageId: 'verify',
      targetPageId: 'house',
      pondId: 'pond-1',
    })
  ).rejects.toThrow('network')

  // Target write, source write (fails), then the compensating write that
  // puts the target back to what it held before the move.
  expect(mockedSaveBlocks).toHaveBeenCalledTimes(3)
  const [, revertedId, revertedBlocks] = mockedSaveBlocks.mock.calls[2]
  expect(revertedId).toBe('house')
  expect(revertedBlocks).toEqual([EXISTING])
  await expect(sessionUndo.undo('pond-1')).resolves.toEqual({ outcome: 'empty' })
})

it('unwinds both pages when both writes land but the source record never does', async () => {
  // Both physical writes succeed (default `saveBlocks`); the change-log
  // append fails on its second call — the source's own-edit record.
  mockedAppend
    .mockImplementationOnce(async (_s, input) => ({ id: `rec-${input.targetPageId}` }) as ChangeLogRecord)
    .mockRejectedValueOnce(new Error('append failed'))

  const result = await moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })

  expect(result).toBeNull()
  // Calls 0/1 are the move's own target/source writes; 2/3 are the unwind
  // writing each page back to what it held before the move.
  expect(mockedSaveBlocks).toHaveBeenCalledTimes(4)
  const [, targetId, targetBlocks] = mockedSaveBlocks.mock.calls[2]
  expect(targetId).toBe('house')
  expect(targetBlocks).toEqual([EXISTING])
  const [, sourceId, sourceBlocks] = mockedSaveBlocks.mock.calls[3]
  expect(sourceId).toBe('verify')
  expect(sourceBlocks).toEqual([KEPT, BLOCK])
  await expect(sessionUndo.undo('pond-1')).resolves.toEqual({ outcome: 'empty' })
})

it('unwinds both pages when both writes land but the target record never does', async () => {
  // The append fails on its FIRST call — the target's own-edit record.
  mockedAppend
    .mockRejectedValueOnce(new Error('append failed'))
    .mockImplementationOnce(async (_s, input) => ({ id: `rec-${input.targetPageId}` }) as ChangeLogRecord)

  const result = await moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })

  expect(result).toBeNull()
  expect(mockedSaveBlocks).toHaveBeenCalledTimes(4)
  const [, targetId, targetBlocks] = mockedSaveBlocks.mock.calls[2]
  expect(targetId).toBe('house')
  expect(targetBlocks).toEqual([EXISTING])
  const [, sourceId, sourceBlocks] = mockedSaveBlocks.mock.calls[3]
  expect(sourceId).toBe('verify')
  expect(sourceBlocks).toEqual([KEPT, BLOCK])
  await expect(sessionUndo.undo('pond-1')).resolves.toEqual({ outcome: 'empty' })
})

it('tells the honest "may now be on both pages" story when the compensating write itself fails', async () => {
  mockedSaveBlocks
    .mockResolvedValueOnce(undefined) // the target write lands
    .mockRejectedValueOnce(new Error('network')) // the source write fails
    .mockRejectedValueOnce(new Error('network')) // the compensating restore fails too

  const notify = jest.fn()
  const stageUndo = jest.fn()
  const navigateTo = jest.fn()

  await moveBlockAndStageUndo(
    supabase,
    queryClient,
    {
      blockId: 'block-1',
      sourcePageId: 'verify',
      targetPageId: 'house',
      pondId: 'pond-1',
      label: 'checklist',
    },
    { id: 'house', type: 'page', title: 'House' },
    stageUndo,
    notify,
    navigateTo
  )

  expect(notify).toHaveBeenCalledWith("Couldn't move checklist — it may now be on both pages")
  expect(stageUndo).not.toHaveBeenCalled()
})

it('⌘Z pressed while the move is in flight undoes the move, not the step before it', async () => {
  sessionUndo.remember({ pondId: 'pond-1', recordIds: ['older-record'] })

  let releaseTarget: () => void = () => {}
  mockedSaveBlocks.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseTarget = () => resolve(undefined)
      })
  )

  const movePromise = moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })
  // Lets the slot get reserved and `saveBlocks` get called before ⌘Z presses —
  // the reservation happens before this call, so the step is already on top.
  for (let i = 0; i < 10 && mockedSaveBlocks.mock.calls.length === 0; i++) await Promise.resolve()
  expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(true)

  const undoPromise = sessionUndo.undo('pond-1')
  releaseTarget()
  const result = await movePromise
  const outcome = await undoPromise

  expect(result).not.toBeNull()
  expect(outcome.outcome).toBe('done')
  expect(mockedRpc).toHaveBeenCalledWith(
    'undo_change_log_record',
    expect.objectContaining({ p_record_ids: ['rec-verify', 'rec-house'] })
  )
  // The older step is still underneath, untouched — the press took the
  // move's own step, not whatever was there before it started.
  const snapshot = sessionUndo.getSnapshot('pond-1')
  expect(snapshot.canUndo).toBe(true)
  expect(snapshot.topUndoRecordIds).toEqual(['older-record'])
})

it('is a no-op when the block is no longer on the source page', async () => {
  const result = await moveBlockToPage(supabase, queryClient, {
    blockId: 'missing',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })

  expect(result).toBeNull()
  expect(mockedSaveBlocks).not.toHaveBeenCalled()
})

it('refuses a second move of the same block while the first is still writing', async () => {
  let releaseTarget: () => void = () => {}
  mockedSaveBlocks.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        releaseTarget = () => resolve(undefined)
      })
  )

  const first = moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })
  // Lets the first call's own microtask chain (flush, both getPages) reach
  // its `saveBlocks` call — no real I/O sits on that path, so draining a
  // handful of microtask turns is enough, with no fixed delay to tune.
  for (let i = 0; i < 10 && mockedSaveBlocks.mock.calls.length === 0; i++) await Promise.resolve()

  const second = await moveBlockToPage(supabase, queryClient, {
    blockId: 'block-1',
    sourcePageId: 'verify',
    targetPageId: 'house',
    pondId: 'pond-1',
  })

  expect(second).toBeNull()
  releaseTarget()
  await first
})

/**
 * `planBlockMove`'s pure half, over its boundaries: a leader handing
 * `rowStart` to its mate, the mate itself (no handoff), a lone ½ with no
 * mate to hand off to, a plain full block, and the two `null` cases.
 */
describe('planBlockMove', () => {
  interface Row {
    id: string
    width?: BlockWidth
    rowStart?: boolean
  }

  const blk = (id: string, width?: BlockWidth, rowStart?: boolean): Row =>
    rowStart ? { id, width, rowStart: true } : { id, width }

  const target = [blk('existing')]

  it.each([
    {
      name: 'a ½ leader with a mate, after an X ½ line: the mate inherits rowStart',
      blocks: [blk('x', '1/2', true), blk('leader', '1/2', true), blk('mate', '1/2')],
      blockId: 'leader',
      expectedSource: [blk('x', '1/2', true), { id: 'mate', width: '1/2', rowStart: true }],
    },
    {
      name: 'the mate itself: no handoff, the leader is untouched',
      blocks: [blk('x', '1/2', true), blk('leader', '1/2', true), blk('mate', '1/2')],
      blockId: 'mate',
      expectedSource: [blk('x', '1/2', true), blk('leader', '1/2', true)],
    },
    {
      name: 'a lone ½ with no row-mate: a plain removal, no handoff',
      blocks: [blk('lone', '1/2', true), blk('full')],
      blockId: 'lone',
      expectedSource: [blk('full')],
    },
    {
      name: 'a full block: a plain removal',
      blocks: [blk('leader', '1/2', true), blk('mate', '1/2'), blk('full')],
      blockId: 'full',
      expectedSource: [blk('leader', '1/2', true), blk('mate', '1/2')],
    },
  ])('$name', ({ blocks, blockId, expectedSource }) => {
    const result = planBlockMove(blocks, target, blockId)

    expect(result).not.toBeNull()
    expect(result!.source).toEqual(expectedSource)
    expect(result!.target).toEqual([...target, { id: blockId }])
  })

  it('returns null when the block is no longer on the source', () => {
    expect(planBlockMove([blk('kept')], target, 'missing')).toBeNull()
  })

  it('returns null when the target already holds the block (duplicate id)', () => {
    const blocks = [blk('leader', '1/2', true), blk('mate', '1/2')]
    expect(planBlockMove(blocks, [blk('leader')], 'leader')).toBeNull()
  })
})
