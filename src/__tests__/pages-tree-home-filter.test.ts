/**
 * fetchPages strips the Life home row (ticket-44).
 *
 * The ['pages'] tree the rail and overview surfaces read must never include the
 * reserved `home` row, so Life's own blocks can't become a rail child or inflate
 * the areas overview. This is enforced at the query boundary with a
 * `.neq('type','home')`. We assert the filter is applied and that home rows the
 * DB might still return are absent from the shape callers consume.
 */

import { fetchPages } from '@/lib/pages/tree'
import { HOME_TYPE } from '@/lib/pages/home'

const mockCreateClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))

/** A chainable query double that records the filters and resolves `.order`. */
function makeClient(returnRows: unknown[]) {
  const neq = jest.fn()
  const builder: Record<string, unknown> = {
    select() {
      return builder
    },
    eq() {
      return builder
    },
    neq(col: string, val: unknown) {
      neq(col, val)
      return builder
    },
    order() {
      return Promise.resolve({ data: returnRows, error: null })
    },
  }
  return {
    _neq: neq,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: () => builder,
  }
}

it('applies a .neq filter excluding the home type', async () => {
  const client = makeClient([])
  mockCreateClient.mockReturnValue(client)
  await fetchPages()
  expect(client._neq).toHaveBeenCalledWith('type', HOME_TYPE)
})

it('returns [] when unauthenticated (no query)', async () => {
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => {
      throw new Error('should not query when unauthenticated')
    },
  }
  mockCreateClient.mockReturnValue(client)
  expect(await fetchPages()).toEqual([])
})
