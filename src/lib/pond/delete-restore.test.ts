/**
 * `softDeletePond`/`restorePond` (src/lib/pond/client.ts, KAN-493): an
 * RLS-filtered update touches zero rows and PostgREST can answer with no
 * `error` — `updatePond`'s own `.select('id').single()` read-back is the
 * existing contract for catching that; these two writes now follow it.
 * Mocked-chain style from `pond-create-name.test.ts`.
 */

import { softDeletePond, restorePond } from '@/lib/pond/client'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
import { createClient } from '@/lib/supabase/client'

function mockChain(result: { data: unknown; error: unknown }) {
  const chain = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  }
  const supabase = { from: jest.fn().mockReturnValue(chain) }
  ;(createClient as jest.Mock).mockReturnValue(supabase)
  return chain
}

beforeEach(() => {
  ;(createClient as jest.Mock).mockReset()
})

describe('softDeletePond', () => {
  it('throws when the update touches no row (RLS-filtered, not this account\'s pond)', async () => {
    mockChain({ data: null, error: null })
    await expect(softDeletePond('p-1')).rejects.toThrow('no row changed')
  })

  it('resolves when the row comes back', async () => {
    const chain = mockChain({ data: { id: 'p-1' }, error: null })
    await expect(softDeletePond('p-1')).resolves.toBeUndefined()
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })

  it('throws the Supabase error when there is one', async () => {
    mockChain({ data: null, error: new Error('boom') })
    await expect(softDeletePond('p-1')).rejects.toThrow('boom')
  })
})

describe('restorePond', () => {
  it('throws when the update touches no row (RLS-filtered, not this account\'s pond)', async () => {
    mockChain({ data: null, error: null })
    await expect(restorePond('p-1')).rejects.toThrow('no row changed')
  })

  it('resolves when the row comes back', async () => {
    const chain = mockChain({ data: { id: 'p-1' }, error: null })
    await expect(restorePond('p-1')).resolves.toBeUndefined()
    expect(chain.update).toHaveBeenCalledWith({ deleted_at: null })
  })
})
