/**
 * @jest-environment node
 *
 * G2 (#98): "if a diff's target is edited after the diff is made, the diff goes
 * outdated." The accept path already swept the page on an ACCEPTED diff; this
 * is the other half — the person's own typed edit landing on a page with a
 * pending block diff. The editor's debounced save calls this after the blocks
 * commit; it is a side-record of the save and must never fail it. (The record
 * the same save leaves in the log is pinned in own-edit-log.test.ts.)
 */

jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn(),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/pages/client', () => ({ saveBlocks: jest.fn().mockResolvedValue(undefined) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { appendOwnEdit, markOutdated } from '@/lib/change-log/store'
import { recordOwnEdit } from '@/lib/change-log/own-edit'
import { commitBlocks } from '@/lib/pages/commit'
import type { QueryClient } from '@tanstack/react-query'
import { ACTOR_YOU, BLOCK_ACTIONS, type ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'

const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>
const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>

function supabaseWithUser(id: string | null) {
  return {
    auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) },
  } as unknown as SupabaseClient<Database>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedMarkOutdated.mockResolvedValue([])
  mockedAppend.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
})

const BLOCKS = [{ id: 'b1', type: 'text', content: 'typed' }] as unknown as Block[]

describe('recordOwnEdit — the sweep', () => {
  it('sweeps the block diffs aimed at the edited page, by you', async () => {
    await recordOwnEdit(supabaseWithUser('user-1'), {
      pondId: 'pond-2',
      pageId: 'page-1',
      before: [],
      blocks: BLOCKS,
    })
    expect(mockedMarkOutdated).toHaveBeenCalledTimes(1)
    const [, opts] = mockedMarkOutdated.mock.calls[0]
    expect(opts).toMatchObject({
      userId: 'user-1',
      pondId: 'pond-2',
      targetPageId: 'page-1',
      actor: ACTOR_YOU,
    })
    // Scoped to the block actions: a pending add_row on the same page is untouched
    // by a block write and stays applicable.
    expect(opts.actions).toEqual([...BLOCK_ACTIONS])
    // Whole page — the editor saves the whole block array, so every block diff on
    // the page was written against a state that is gone.
    expect(opts.blockIds).toBeUndefined()
    // …but scoped to the blocks that actually landed. The save
    // commits the title too, so without this a rename would sweep the page.
    expect(opts.pageBlocks).toBe(BLOCKS)
  })

  it('does nothing without a session — there is no pond to sweep', async () => {
    await recordOwnEdit(supabaseWithUser(null), {
      pondId: 'pond-1',
      pageId: 'p',
      before: [],
      blocks: [],
    })
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })

  it('never throws — the save already landed — and still logs the edit', async () => {
    mockedMarkOutdated.mockRejectedValueOnce(new Error('rls'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { logged } = await recordOwnEdit(supabaseWithUser('user-1'), {
      pondId: 'pond-1',
      pageId: 'p',
      before: [],
      blocks: BLOCKS,
    })
    await logged
    expect(spy).toHaveBeenCalled()
    expect(mockedAppend).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('commitBlocks — the editor’s save sweeps, the accept path does not', () => {
  let order: string[]
  let queryClient: QueryClient
  beforeEach(() => {
    order = []
    mockedMarkOutdated.mockImplementation(async () => {
      order.push('sweep')
      return []
    })
    queryClient = {
      invalidateQueries: jest.fn(async () => {
        order.push('invalidate')
      }),
    } as unknown as QueryClient
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  })

  it('an own edit lands, then the page’s pending block diffs go outdated', async () => {
    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', [], {
      ownEdit: true,
      before: [],
    })
    expect(mockedMarkOutdated).toHaveBeenCalledTimes(1)
    expect(mockedMarkOutdated.mock.calls[0][1]).toMatchObject({
      targetPageId: 'page-1',
      actor: ACTOR_YOU,
    })
  })

  // #98 review, BLOCKING 1. The sweep used to be `void sweep(...)` fired AFTER
  // propagateBlockWrite. Both halves of that are a race the card normally loses:
  // the diff card re-reads the log the moment the page's blocks change, finds the
  // record still `proposed`, and keeps its accept button — so `outdated`, the
  // whole point of this path, did not show up in practice. These two assertions
  // both FAIL against that ordering, and neither can pass by accident.
  it('has SWEPT by the time it resolves, so the card’s re-read cannot beat it', async () => {
    // `getUser` is a real round-trip, modelled as one. A fire-and-forget sweep is
    // still inside it when commitBlocks resolves — and the caller reconciles its
    // page cache the instant that happens, which is what makes the card re-read
    // the log. So the card reads `proposed`, keeps accept, and never greys out.
    const slowSupabase = {
      auth: {
        getUser: async () => {
          await new Promise((r) => setTimeout(r, 5))
          return { data: { user: { id: 'user-1' } } }
        },
      },
    } as unknown as SupabaseClient<Database>

    await commitBlocks(slowSupabase, queryClient, 'page-1', [], { ownEdit: true, before: [] })
    // No flush: this is the moment the caller's reconcile fires.
    expect(mockedMarkOutdated).toHaveBeenCalledTimes(1)
  })

  it('sweeps BEFORE anything downstream is told the page moved', async () => {
    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', [], {
      ownEdit: true,
      before: [],
    })
    expect(order[0]).toBe('sweep')
    expect(order.slice(1).every((step) => step === 'invalidate')).toBe(true)
  })

  it('passes the blocks it just wrote, so a title-only save sweeps nothing', async () => {
    const blocks = [{ id: 'b1', type: 'text', content: 'unchanged' }] as unknown as Block[]
    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', blocks, {
      ownEdit: true,
      before: blocks,
    })
    // markOutdated compares each record's `before` against these and spares the
    // ones that still match — see change-log-store.test.ts.
    expect(mockedMarkOutdated.mock.calls[0][1].pageBlocks).toBe(blocks)
  })

  it('a plain commit (the accept path) sweeps nothing here — it runs its own', async () => {
    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', [])
    await new Promise((r) => setTimeout(r, 0))
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })
})
