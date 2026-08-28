/**
 * Tests for the propose_changes accept path (src/lib/pages/accept.ts).
 *
 * BUG 1/2 fix (build-brief propose-changes-target): an accepted batch commits to
 * the page stamped at proposal time — not to whatever node happens to be open —
 * and when that target is missing (no stamp + no open node) or deleted, every
 * change counts as skipped so the card and the model both learn nothing landed.
 * Mirrors the mocked-dep approach in create-page-from-proposal.test.ts.
 */

jest.mock('@/lib/pages/client', () => ({ getPage: jest.fn() }))
jest.mock('@/lib/pages/commit', () => ({ commitBlocks: jest.fn() }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import { getPage } from '@/lib/pages/client'
import { commitBlocks } from '@/lib/pages/commit'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { emptyResolutions, type ConversationResolutions } from '@/lib/conversation/resolutions'
import type { ModuleChange } from '@/lib/modules/ai-composition'

const mockedGetPage = getPage as jest.MockedFunction<typeof getPage>
const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>

const supabase = {} as SupabaseClient<Database>
const invalidateQueries = jest.fn()
const queryClient = { invalidateQueries } as unknown as QueryClient

const changes: ModuleChange[] = [
  { op: 'create', data: { type: 'text', content: 'hello' } } as ModuleChange,
]

function stamped(toolCallId: string, nodeId: string): ConversationResolutions {
  return {
    ...emptyResolutions(),
    targets: { [toolCallId]: { nodeId, nodeName: 'Garage' } },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedGetPage.mockResolvedValue({
    id: 'stamped-id',
    blocks: [],
  } as unknown as Awaited<ReturnType<typeof getPage>>)
})

describe('writeAcceptedChanges', () => {
  it('commits to the stamped target, not the open node', async () => {
    const skipped = await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: 'somewhere-else',
      changes,
    })
    expect(skipped).toBe(0)
    expect(mockedGetPage).toHaveBeenCalledWith(supabase, 'stamped-id')
    expect(mockedCommitBlocks).toHaveBeenCalledWith(
      supabase,
      queryClient,
      'stamped-id',
      expect.any(Array)
    )
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'stamped-id'] })
  })

  it('falls back to the open node for an unstamped (legacy) card', async () => {
    await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: emptyResolutions(),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes,
    })
    expect(mockedGetPage).toHaveBeenCalledWith(supabase, 'open-id')
    expect(mockedCommitBlocks).toHaveBeenCalledWith(supabase, queryClient, 'open-id', [
      expect.objectContaining({ type: 'text', content: 'hello' }),
    ])
  })

  it('no stamp and no open node → every change skipped, nothing written', async () => {
    const skipped = await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: emptyResolutions(),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })
    expect(skipped).toBe(changes.length)
    expect(mockedGetPage).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
  })

  it('deleted target page → every change skipped, nothing written', async () => {
    mockedGetPage.mockResolvedValue(null)
    const skipped = await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: stamped('pc1', 'gone-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes,
    })
    expect(skipped).toBe(changes.length)
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
  })

  it('cross-page edit resolves block ids against the TARGET page, not the open one (ticket-30)', async () => {
    // The open page and the target page have DIFFERENT blocks. An edit references a
    // block id that exists only on the TARGET page; it must resolve there (applied),
    // and commit to the target — proving the accept reads the stamped target's blocks.
    mockedGetPage.mockImplementation(async (_sb, id) => {
      if (id === 'ceramics-id') {
        return {
          id: 'ceramics-id',
          blocks: [{ id: 'blk-target', type: 'text', content: 'old plan' }],
        } as unknown as Awaited<ReturnType<typeof getPage>>
      }
      // The open page has an unrelated block — an edit to blk-target must NOT match here.
      return {
        id: 'open-id',
        blocks: [{ id: 'blk-open', type: 'text', content: 'something else' }],
      } as unknown as Awaited<ReturnType<typeof getPage>>
    })

    const editChanges: ModuleChange[] = [
      { op: 'edit', blockId: 'blk-target', data: { type: 'text', content: 'new plan' } },
    ] as ModuleChange[]

    const skipped = await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: stamped('pc1', 'ceramics-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id', // user is elsewhere
      changes: editChanges,
    })

    // The edit's block id exists on the target, so nothing is skipped, and the write
    // lands on the target page's block array (with the edit applied).
    expect(skipped).toBe(0)
    expect(mockedGetPage).toHaveBeenCalledWith(supabase, 'ceramics-id')
    expect(mockedCommitBlocks).toHaveBeenCalledWith(supabase, queryClient, 'ceramics-id', [
      expect.objectContaining({ id: 'blk-target', type: 'text', content: 'new plan' }),
    ])
    // The target page's cache is invalidated so it is fresh when the user visits.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'ceramics-id'] })
  })

  it('cross-page edit whose block id is absent on the target is skipped (never wrong-page write)', async () => {
    // Edit references a block that lives on the OPEN page but not the stamped TARGET —
    // it must be skipped, not silently applied to the wrong block.
    mockedGetPage.mockResolvedValue({
      id: 'ceramics-id',
      blocks: [{ id: 'blk-target', type: 'text', content: 'plan' }],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const skipped = await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: stamped('pc1', 'ceramics-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes: [
        { op: 'edit', blockId: 'blk-open', data: { type: 'text', content: 'x' } },
      ] as ModuleChange[],
    })
    expect(skipped).toBe(1)
  })

  it('an empty accepted batch is a no-op', async () => {
    const skipped = await writeAcceptedChanges({
      supabase,
      queryClient,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes: [],
    })
    expect(skipped).toBe(0)
    expect(mockedGetPage).not.toHaveBeenCalled()
  })
})
