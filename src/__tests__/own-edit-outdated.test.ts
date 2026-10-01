/**
 * @jest-environment node
 *
 * G2 (#98): "if a diff's target is edited after the diff is made, the diff goes
 * outdated." The accept path already swept the page on an ACCEPTED diff; this
 * is the other half — the person's own typed edit landing on a page with a
 * pending block diff. The editor's debounced save calls this after the blocks
 * commit; it is a side-record of the save and must never fail it.
 */

jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn(),
}))
jest.mock('@/lib/pages/client', () => ({ saveBlocks: jest.fn().mockResolvedValue(undefined) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { markOutdated } from '@/lib/change-log/store'
import { sweepOutdatedAfterOwnEdit } from '@/lib/change-log/own-edit'
import { commitBlocks } from '@/lib/pages/commit'
import type { QueryClient } from '@tanstack/react-query'
import { ACTOR_YOU, BLOCK_ACTIONS } from '@/lib/change-log/types'

const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>

function supabaseWithUser(id: string | null) {
  return {
    auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) },
  } as unknown as SupabaseClient<Database>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedMarkOutdated.mockResolvedValue([])
})

describe('sweepOutdatedAfterOwnEdit', () => {
  it('sweeps the block diffs aimed at the edited page, by you', async () => {
    await sweepOutdatedAfterOwnEdit(supabaseWithUser('user-1'), {
      workspace: 'sandbox',
      pageId: 'page-1',
    })
    expect(mockedMarkOutdated).toHaveBeenCalledTimes(1)
    const [, opts] = mockedMarkOutdated.mock.calls[0]
    expect(opts).toMatchObject({
      userId: 'user-1',
      workspace: 'sandbox',
      targetPageId: 'page-1',
      actor: ACTOR_YOU,
    })
    // Scoped to the block actions: a pending add_row on the same page is untouched
    // by a block write and stays applicable.
    expect(opts.actions).toEqual([...BLOCK_ACTIONS])
    // Whole page — the editor saves the whole block array, so every block diff on
    // the page was written against a state that is gone.
    expect(opts.blockIds).toBeUndefined()
  })

  it('does nothing without a session — there is no pond to sweep', async () => {
    await sweepOutdatedAfterOwnEdit(supabaseWithUser(null), { workspace: 'main', pageId: 'p' })
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })

  it('never throws — the save already landed', async () => {
    mockedMarkOutdated.mockRejectedValueOnce(new Error('rls'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      sweepOutdatedAfterOwnEdit(supabaseWithUser('user-1'), { workspace: 'main', pageId: 'p' })
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('commitBlocks — the editor’s save sweeps, the accept path does not', () => {
  const queryClient = { invalidateQueries: jest.fn() } as unknown as QueryClient
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  })

  it('an own edit lands, then the page’s pending block diffs go outdated', async () => {
    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', [], 'main', {
      ownEdit: true,
    })
    // The sweep is fire-and-forget; let it settle.
    await new Promise((r) => setTimeout(r, 0))
    expect(mockedMarkOutdated).toHaveBeenCalledTimes(1)
    expect(mockedMarkOutdated.mock.calls[0][1]).toMatchObject({
      targetPageId: 'page-1',
      actor: ACTOR_YOU,
    })
  })

  it('a plain commit (the accept path) sweeps nothing here — it runs its own', async () => {
    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', [], 'main')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })
})
