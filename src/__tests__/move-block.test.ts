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

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { QueryClient } from '@tanstack/react-query'
import { appendOwnEdit } from '@/lib/change-log/store'
import { getPage, saveBlocks } from '@/lib/pages/client'
import type { PondPage } from '@/lib/pages/client'
import { moveBlockToPage, planBlockMove } from '@/lib/pages/move-block'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'
import type { BlockWidth } from '@/lib/modules/content'

const mockedGetPage = getPage as jest.MockedFunction<typeof getPage>
const mockedSaveBlocks = saveBlocks as jest.MockedFunction<typeof saveBlocks>
const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>

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

  expect(result).toEqual({ pondId: 'pond-1', recordIds: ['rec-verify', 'rec-house'] })
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
