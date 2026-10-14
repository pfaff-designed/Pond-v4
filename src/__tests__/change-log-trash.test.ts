/**
 * Trash and restore — src/lib/change-log/trash.ts.
 *
 * The RPCs themselves (the subtree stamp, the restore placement, the
 * suffix/fallback rules) are proved against real Postgres in
 * page-trash.pglite.test.ts. What is pinned here is the client side:
 * trashPage/restorePage call the right RPC with the right argument, a known
 * DETAIL becomes a TrashRefusedError a caller can read through
 * personFacingMessage, and anything else is thrown as-is.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { existingPageIds, restorePage, trashPage } from '@/lib/change-log/trash'
import { personFacingMessage, TrashRefusedError } from '@/lib/change-log/errors'

const fakeSupabase = (error: unknown = null, data: unknown = null) => {
  const rpc = jest.fn().mockResolvedValue({ data, error })
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc }
}

describe('trashPage', () => {
  it('calls trash_page with the page id', async () => {
    const { client, rpc } = fakeSupabase()

    await trashPage(client, 'page-1')

    expect(rpc).toHaveBeenCalledWith('trash_page', { p_page_id: 'page-1' })
  })

  it('maps a not-found DETAIL to a TrashRefusedError a person can read', async () => {
    const { client } = fakeSupabase({
      code: 'P0002',
      details: 'not-found',
      message: 'page 9f… not found',
    })

    await expect(trashPage(client, 'page-1')).rejects.toThrow(TrashRefusedError)
    try {
      await trashPage(client, 'page-1')
    } catch (err) {
      expect(err).toBeInstanceOf(TrashRefusedError)
      expect((err as TrashRefusedError).reason).toBe('not-found')
      expect(personFacingMessage(err)).toBe('that page could not be found')
    }
  })

  it('throws a reason it does not know, rather than guess', async () => {
    const { client } = fakeSupabase({ code: '40001', details: 'something-new' })

    await expect(trashPage(client, 'page-1')).rejects.toMatchObject({ details: 'something-new' })
  })

  it('throws what has no code, so the call can be tried again', async () => {
    const { client } = fakeSupabase({ message: 'Failed to fetch' })

    await expect(trashPage(client, 'page-1')).rejects.toMatchObject({ message: 'Failed to fetch' })
  })
})

describe('restorePage', () => {
  it('calls restore_page with the record id', async () => {
    const { client, rpc } = fakeSupabase()

    await restorePage(client, 'record-1')

    expect(rpc).toHaveBeenCalledWith('restore_page', { p_record_id: 'record-1' })
  })

  it.each([
    ['page-gone', 'that page no longer exists'],
    ['already-restored', 'that page has already been restored'],
  ])('maps a %s DETAIL to a line a person can read', async (reason, message) => {
    const { client } = fakeSupabase({ code: 'P0002', details: reason, message: 'record 3a…' })

    try {
      await restorePage(client, 'record-1')
      throw new Error('expected restorePage to reject')
    } catch (err) {
      expect(err).toBeInstanceOf(TrashRefusedError)
      expect((err as TrashRefusedError).reason).toBe(reason)
      expect(personFacingMessage(err)).toBe(message)
    }
  })
})

describe('existingPageIds', () => {
  it('calls pages_existing with the ids and returns them as a Set', async () => {
    const { client, rpc } = fakeSupabase(null, ['page-1', 'page-2'])

    const ids = await existingPageIds(client, ['page-1', 'page-2'])

    expect(rpc).toHaveBeenCalledWith('pages_existing', { p_page_ids: ['page-1', 'page-2'] })
    expect(ids).toEqual(new Set(['page-1', 'page-2']))
  })

  it('skips the call for an empty list', async () => {
    const { client, rpc } = fakeSupabase()

    const ids = await existingPageIds(client, [])

    expect(rpc).not.toHaveBeenCalled()
    expect(ids).toEqual(new Set())
  })

  it('reads a null result as nothing still existing', async () => {
    const { client } = fakeSupabase(null, null)

    const ids = await existingPageIds(client, ['page-1'])

    expect(ids).toEqual(new Set())
  })
})
