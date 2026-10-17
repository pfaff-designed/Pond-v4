/**
 * @jest-environment node
 *
 * KAN-139: the debounced own-edit save must hand its record to `sessionUndo`,
 * same as template-apply/Rail/AITerminal/ChangeLogAnswerActions already do —
 * otherwise PATH_STEPS "type, let it commit, ⌘Z" has nothing to undo.
 */

jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn(),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/pages/client', () => ({ saveBlocks: jest.fn().mockResolvedValue(undefined) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { appendOwnEdit, markOutdated } from '@/lib/change-log/store'
import { commitBlocks } from '@/lib/pages/commit'
import { sessionUndo } from '@/lib/change-log/session-undo'
import type { QueryClient } from '@tanstack/react-query'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'

const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>
const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>

function supabaseWithUser(id: string | null) {
  return {
    auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) },
  } as unknown as SupabaseClient<Database>
}

const BLOCKS = [{ id: 'b1', type: 'text', content: 'typed' }] as unknown as Block[]

describe('commitBlocks — own edits reach sessionUndo', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    jest.clearAllMocks()
    sessionUndo.clear()
    mockedMarkOutdated.mockResolvedValue([])
    queryClient = { invalidateQueries: jest.fn() } as unknown as QueryClient
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  })

  it('a committed own edit becomes the top of the undo stack for its pond', async () => {
    mockedAppend.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
    const remember = jest.spyOn(sessionUndo, 'remember')

    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', BLOCKS, {
      pondId: 'pond-1',
      ownEdit: true,
      before: [],
    })
    // `logged` resolves after `commitBlocks` — wait for its continuation.
    await new Promise((r) => setTimeout(r, 0))

    expect(remember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['rec-1'] })
    expect(sessionUndo.getSnapshot('pond-1').topUndoRecordIds).toEqual(['rec-1'])
  })

  it('an unchanged save remembers nothing', async () => {
    const remember = jest.spyOn(sessionUndo, 'remember')

    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', BLOCKS, {
      pondId: 'pond-1',
      ownEdit: true,
      before: BLOCKS,
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(mockedAppend).not.toHaveBeenCalled()
    expect(remember).not.toHaveBeenCalled()
    expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(false)
  })

  it('without a pond, nothing is remembered even when the record lands', async () => {
    mockedAppend.mockResolvedValue({ id: 'rec-2' } as ChangeLogRecord)
    const remember = jest.spyOn(sessionUndo, 'remember')

    await commitBlocks(supabaseWithUser('user-1'), queryClient, 'page-1', BLOCKS, {
      pondId: null,
      ownEdit: true,
      before: [],
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(remember).not.toHaveBeenCalled()
  })
})
