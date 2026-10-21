/**
 * @jest-environment node
 *
 * `createPageWriter` (KAN-495): the page-write-queue's writer. Matches the
 * queue's `(op) => Promise<void>` contract and folds `commitBlocks`'s
 * own-edit branch into the queue — one path for the change-log append, not
 * two — so this only needs to cover the adapter's own responsibilities:
 * the title update on a 'typed' op, and that a failed write never reaches
 * `sessionUndo.trackPending`. `commitBlocks`'s own append/remember behaviour
 * is covered by `own-edit-session-undo.test.ts`.
 */

jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn(),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/pages/client', () => ({
  saveBlocks: jest.fn(),
  updateTitle: jest.fn(),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { QueryClient } from '@tanstack/react-query'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { PageWriteOp } from '@/lib/pages/page-write-queue'
import { appendOwnEdit, markOutdated } from '@/lib/change-log/store'
import { saveBlocks, updateTitle } from '@/lib/pages/client'
import { createPageWriter, type PageWriteState } from '@/lib/pages/commit'
import { sessionUndo } from '@/lib/change-log/session-undo'

const mockedSaveBlocks = saveBlocks as jest.MockedFunction<typeof saveBlocks>
const mockedUpdateTitle = updateTitle as jest.MockedFunction<typeof updateTitle>
const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>
const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>

function supabaseWithUser(id: string | null) {
  return {
    auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) },
  } as unknown as SupabaseClient<Database>
}

const BEFORE_BLOCKS = [] as unknown as Block[]
const AFTER_BLOCKS = [{ id: 'b1', type: 'text', content: 'alpha' }] as unknown as Block[]

const typedOp: PageWriteOp<PageWriteState> = {
  kind: 'typed',
  before: { title: 'Old', blocks: BEFORE_BLOCKS },
  after: { title: 'New', blocks: AFTER_BLOCKS },
}

const structuralOp: PageWriteOp<PageWriteState> = {
  kind: 'structural',
  before: { title: 'Same', blocks: BEFORE_BLOCKS },
  after: { title: 'Same', blocks: AFTER_BLOCKS },
}

describe('createPageWriter', () => {
  let queryClient: QueryClient
  let calls: string[]

  beforeEach(() => {
    jest.clearAllMocks()
    sessionUndo.clear()
    calls = []
    mockedMarkOutdated.mockImplementation(async () => {
      calls.push('markOutdated')
      return []
    })
    mockedSaveBlocks.mockImplementation(async () => {
      calls.push('saveBlocks')
    })
    mockedUpdateTitle.mockImplementation(async () => {
      calls.push('updateTitle')
    })
    mockedAppend.mockImplementation(async () => {
      calls.push('appendOwnEdit')
      return { id: 'rec-1' } as ChangeLogRecord
    })
    queryClient = { invalidateQueries: jest.fn() } as unknown as QueryClient
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  })

  it('a typed op updates the title, then saves, then logs — trackPending fires at once, remember once the record lands', async () => {
    const trackPending = jest.spyOn(sessionUndo, 'trackPending')
    const remember = jest.spyOn(sessionUndo, 'remember')
    const writer = createPageWriter(supabaseWithUser('user-1'), queryClient, 'page-1', 'pond-1')

    await writer(typedOp)

    expect(calls).toEqual(['updateTitle', 'saveBlocks', 'markOutdated', 'appendOwnEdit'])
    expect(mockedUpdateTitle).toHaveBeenCalledWith(expect.anything(), 'page-1', 'New')
    expect(mockedSaveBlocks).toHaveBeenCalledWith(expect.anything(), 'page-1', AFTER_BLOCKS)
    expect(trackPending).toHaveBeenCalledTimes(1)
    expect(trackPending.mock.calls[0][0]).toBe('pond-1')

    // `remember` is hung off the record promise, settling after the writer's
    // own promise — flush microtasks before asserting it landed.
    await new Promise((r) => setTimeout(r, 0))
    expect(remember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['rec-1'] })
  })

  it('a structural op never touches the title', async () => {
    const writer = createPageWriter(supabaseWithUser('user-1'), queryClient, 'page-1', 'pond-1')

    await writer(structuralOp)

    expect(mockedUpdateTitle).not.toHaveBeenCalled()
    expect(calls).toEqual(['saveBlocks', 'markOutdated', 'appendOwnEdit'])
  })

  it('a rejected saveBlocks propagates and never reaches trackPending', async () => {
    mockedSaveBlocks.mockRejectedValueOnce(new Error('network down'))
    const trackPending = jest.spyOn(sessionUndo, 'trackPending')
    const writer = createPageWriter(supabaseWithUser('user-1'), queryClient, 'page-1', 'pond-1')

    await expect(writer(typedOp)).rejects.toThrow('network down')

    expect(mockedAppend).not.toHaveBeenCalled()
    expect(trackPending).not.toHaveBeenCalled()
  })

  it('a rejected title update never reaches saveBlocks or trackPending', async () => {
    mockedUpdateTitle.mockRejectedValueOnce(new Error('title clash'))
    const trackPending = jest.spyOn(sessionUndo, 'trackPending')
    const writer = createPageWriter(supabaseWithUser('user-1'), queryClient, 'page-1', 'pond-1')

    await expect(writer(typedOp)).rejects.toThrow('title clash')

    expect(mockedSaveBlocks).not.toHaveBeenCalled()
    expect(mockedAppend).not.toHaveBeenCalled()
    expect(trackPending).not.toHaveBeenCalled()
  })
})
