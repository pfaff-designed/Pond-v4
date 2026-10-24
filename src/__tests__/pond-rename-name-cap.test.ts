/**
 * Unit test for `updatePond`'s name cap (src/lib/pond/client.ts, KAN-492) —
 * `clampPondName`/`POND_NAME_MAX` (src/lib/pond/name-cap.ts) is the cap's one
 * home; `updatePond` applies it to the trimmed name before the write, same
 * mocked-chain approach as `pond-create-name.test.ts`.
 */

import { updatePond } from '@/lib/pond/client'
import { POND_NAME_MAX } from '@/lib/pond/name-cap'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
import { createClient } from '@/lib/supabase/client'

describe('updatePond — the name cap', () => {
  beforeEach(() => {
    ;(createClient as jest.Mock).mockReset()
  })

  it('writes the clamped name, not the full pasted one', async () => {
    const clamped = 'a'.repeat(POND_NAME_MAX)
    const updatedRow = {
      id: 'p-1',
      name: clamped,
      glyph: null,
      theme: 'paper',
      order: 0,
      recentGlyphs: null,
      lastPage: null,
    }
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updatedRow, error: null }),
    }
    const supabase = { from: jest.fn().mockReturnValue(chain) }
    ;(createClient as jest.Mock).mockReturnValue(supabase)

    const pond = await updatePond('p-1', { name: 'a'.repeat(10000) })

    expect(chain.update).toHaveBeenCalledWith({ name: clamped })
    expect(pond.name).toBe(clamped)
    expect(pond.name.length).toBe(POND_NAME_MAX)
  })
})
