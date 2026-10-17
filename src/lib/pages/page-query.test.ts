const mockGetPage = jest.fn()
jest.mock('./client', () => ({ getPage: (...args: unknown[]) => mockGetPage(...args) }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { pageQueryOptions } from './page-query'

type FakeClient = SupabaseClient<Database>

describe('pageQueryOptions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('keys on the page id', () => {
    expect(pageQueryOptions(jest.fn(), 'page-1').queryKey).toEqual(['page', 'page-1'])
  })

  it('fetches through getPage, calling the lazy getter only when the query runs', () => {
    const client = { tag: 'supabase' } as unknown as FakeClient
    const getSupabase = jest.fn(() => client)
    const options = pageQueryOptions(getSupabase, 'page-1')
    expect(getSupabase).not.toHaveBeenCalled()

    options.queryFn()

    expect(getSupabase).toHaveBeenCalledTimes(1)
    expect(mockGetPage).toHaveBeenCalledWith(client, 'page-1')
  })

  it('resolves null without calling getPage when there is no id', async () => {
    const getSupabase = jest.fn<FakeClient, []>()
    const options = pageQueryOptions(getSupabase, null)

    await expect(options.queryFn()).resolves.toBeNull()
    expect(getSupabase).not.toHaveBeenCalled()
    expect(mockGetPage).not.toHaveBeenCalled()
  })
})
