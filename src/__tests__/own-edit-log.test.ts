/**
 * @jest-environment node
 *
 * "Your edits are accepted as you make them" (`Pond 06.15` 6o frame 1) and
 * "your own edits apply as you type, grouped by pause in the change log"
 * (`Pond 06.17` 6q frame 11). The editor's debounced save is the pause: each
 * save that changed the blocks leaves exactly one `accepted` record by you,
 * carrying the blocks before and after. The log is a side-record of the save
 * and never fails it.
 */

jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn(),
  appendOwnEdit: jest.fn(),
}))
jest.mock('@/lib/pages/client', () => ({ saveBlocks: jest.fn().mockResolvedValue(undefined) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { appendOwnEdit, markOutdated } from '@/lib/change-log/store'
import { saveBlocks } from '@/lib/pages/client'
import { commitBlocks } from '@/lib/pages/commit'
import { changeLogKey } from '@/lib/change-log/keys'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>
const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>
const mockedSaveBlocks = saveBlocks as jest.MockedFunction<typeof saveBlocks>

const getUser = jest.fn()
const supabase = { auth: { getUser } } as unknown as SupabaseClient<Database>
let queryClient: QueryClient

const BEFORE = [{ id: 'b1', type: 'text', content: 'Slept badly.' }] as unknown as Block[]
const AFTER = [
  { id: 'b1', type: 'text', content: 'Slept badly.\n\nKept thinking about the kitchen.' },
] as unknown as Block[]
const LATER = [
  {
    id: 'b1',
    type: 'text',
    content: 'Slept badly.\n\nKept thinking about the kitchen.\n\nMornings, mostly.',
  },
] as unknown as Block[]

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockedMarkOutdated.mockResolvedValue([])
  mockedAppend.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
  queryClient = { invalidateQueries: jest.fn(async () => {}) } as unknown as QueryClient
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
})

const ownSave = (before: Block[], blocks: Block[]) =>
  commitBlocks(supabase, queryClient, 'page-1', blocks, { ownEdit: true, before, pondId: 'pond-1' })

describe('commitBlocks — a person’s own save is logged', () => {
  it('one pause, one record: before and after as blocks, on the page, in the pond', async () => {
    await ownSave(BEFORE, AFTER)

    expect(mockedAppend).toHaveBeenCalledTimes(1)
    expect(mockedAppend.mock.calls[0][1]).toEqual({
      userId: 'user-1',
      pondId: 'pond-1',
      action: 'edit',
      targetPageId: 'page-1',
      before: BEFORE,
      after: AFTER,
    })
  })

  it('each save is its own record, and each starts where the last one ended', async () => {
    await ownSave(BEFORE, AFTER)
    await ownSave(AFTER, LATER)

    expect(mockedAppend).toHaveBeenCalledTimes(2)
    expect(mockedAppend.mock.calls[1][1]).toMatchObject({ before: AFTER, after: LATER })
  })

  it('an unchanged re-save writes no record — a rename is not an edit to the blocks', async () => {
    // JSONB hands keys back in its own order; the same blocks must still read as equal.
    const reordered = [{ content: 'Slept badly.', type: 'text', id: 'b1' }] as unknown as Block[]
    await ownSave(BEFORE, reordered)

    expect(mockedSaveBlocks).toHaveBeenCalledTimes(1)
    expect(mockedAppend).not.toHaveBeenCalled()
  })

  it('the accept path writes no own-edit record — accept_change_log_record writes its own', async () => {
    await commitBlocks(supabase, queryClient, 'page-1', AFTER)

    expect(mockedAppend).not.toHaveBeenCalled()
  })

  it('a failed append does not fail the save', async () => {
    mockedAppend.mockRejectedValueOnce(new Error('rls'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(ownSave(BEFORE, AFTER)).resolves.toBeUndefined()

    expect(mockedSaveBlocks).toHaveBeenCalledWith(supabase, 'page-1', AFTER)
    // Everything downstream of the save still runs.
    expect(queryClient.invalidateQueries).toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a failed session lookup does not fail the save either', async () => {
    getUser.mockRejectedValueOnce(new Error('offline'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(ownSave(BEFORE, AFTER)).resolves.toBeUndefined()

    expect(mockedAppend).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('writes nothing without a session — there is no pond to log into', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await ownSave(BEFORE, AFTER)

    expect(mockedAppend).not.toHaveBeenCalled()
  })

  it('looks the session up once for both the sweep and the record', async () => {
    await ownSave(BEFORE, AFTER)

    expect(getUser).toHaveBeenCalledTimes(1)
    expect(mockedMarkOutdated).toHaveBeenCalledTimes(1)
    expect(mockedAppend).toHaveBeenCalledTimes(1)
  })

  it('refreshes every change-log view once the record is in', async () => {
    await ownSave(BEFORE, AFTER)

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: changeLogKey() })
  })
})
