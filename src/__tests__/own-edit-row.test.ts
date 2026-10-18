/**
 * @jest-environment node
 *
 * `recordOwnRowEdit` hands back the record it appended, so a caller that
 * needs the id — a drag-drop's session-undo step, for one — doesn't have to
 * re-derive it.
 */

jest.mock('@/lib/change-log/store', () => ({
  markOutdated: jest.fn(),
  appendOwnEdit: jest.fn(),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { appendOwnEdit } from '@/lib/change-log/store'
import { recordOwnRowEdit } from '@/lib/change-log/own-edit'
import type { ChangeLogRecord, RowSnapshot } from '@/lib/change-log/types'

const mockedAppend = appendOwnEdit as jest.MockedFunction<typeof appendOwnEdit>

const getUser = jest.fn()
const supabase = { auth: { getUser } } as unknown as SupabaseClient<Database>

const BEFORE: RowSnapshot = { id: 'row-1', title: 'Chickpeas', values: { done: false }, shown: {} }
const AFTER: RowSnapshot = { id: 'row-1', title: 'Chickpeas', values: { done: true }, shown: {} }

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockedAppend.mockResolvedValue({ id: 'rec-1' } as ChangeLogRecord)
})

describe('recordOwnRowEdit — resolves the record it appended', () => {
  it('resolves the appended record on a changed edit', async () => {
    const record = await recordOwnRowEdit(supabase, {
      pondId: 'pond-1',
      collectionId: 'collection-1',
      before: BEFORE,
      after: AFTER,
    })

    expect(record).toEqual({ id: 'rec-1' })
  })

  it('resolves null on an unchanged edit — nothing was appended', async () => {
    const record = await recordOwnRowEdit(supabase, {
      pondId: 'pond-1',
      collectionId: 'collection-1',
      before: BEFORE,
      after: BEFORE,
    })

    expect(record).toBeNull()
    expect(mockedAppend).not.toHaveBeenCalled()
  })

  it('resolves null with no session — there is no pond to log into', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })

    const record = await recordOwnRowEdit(supabase, {
      pondId: 'pond-1',
      collectionId: 'collection-1',
      before: BEFORE,
      after: AFTER,
    })

    expect(record).toBeNull()
    expect(mockedAppend).not.toHaveBeenCalled()
  })
})
