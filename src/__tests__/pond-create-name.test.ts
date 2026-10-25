/**
 * Unit tests for `createPond`'s name contract (src/lib/pond/client.ts, KAN-487) —
 * a blank or whitespace-only name throws before any Supabase call, not just
 * before the insert. Mirrors the mocked-chain approach in `pond-recent-glyphs.test.ts`.
 */

import { createPond } from '@/lib/pond/client'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
import { createClient } from '@/lib/supabase/client'

describe('createPond — the name contract', () => {
  beforeEach(() => {
    ;(createClient as jest.Mock).mockReset()
  })

  it('throws on a blank name without touching Supabase', async () => {
    await expect(createPond('')).rejects.toThrow('a pond needs a name')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('throws on a whitespace-only name without touching Supabase', async () => {
    await expect(createPond('   ')).rejects.toThrow('a pond needs a name')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('inserts the trimmed name when it is non-blank', async () => {
    const insertedRow = {
      id: 'p-1',
      name: 'Studio',
      glyph: null,
      theme: 'paper',
      order: 0,
      recentGlyphs: null,
      lastPage: null,
    }
    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      // The max-order lookup (ALL the user's ponds, KAN-493) awaits `.limit(...)`
      // directly; the insert path awaits `.single()` instead — both share this chain.
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: insertedRow, error: null }),
    }
    const supabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    }
    ;(createClient as jest.Mock).mockReturnValue(supabase)

    const pond = await createPond('  Studio  ')

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Studio', user_id: 'u-1' })
    )
    expect(chain.insert.mock.calls[0][0]).not.toHaveProperty('glyph')
    expect(chain.insert.mock.calls[0][0]).not.toHaveProperty('theme')
    expect(pond.name).toBe('Studio')
  })

  it('inserts glyph and theme when given', async () => {
    const insertedRow = {
      id: 'p-2',
      name: 'Studio',
      glyph: 'lightning-03',
      theme: 'ink',
      order: 0,
      recentGlyphs: null,
      lastPage: null,
    }
    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: insertedRow, error: null }),
    }
    const supabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    }
    ;(createClient as jest.Mock).mockReturnValue(supabase)

    await createPond('Studio', { glyph: 'lightning-03', theme: 'ink' })

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Studio', glyph: 'lightning-03', theme: 'ink' })
    )
  })

  it('gets a fresh order after a delete, not the deleted pond’s own (KAN-493)', async () => {
    // The only OTHER pond on this account is the one just deleted — still
    // holding order 0 so a restore lands back there. `existing.length` over
    // live ponds only would see zero live ponds and hand the new one order 0
    // too, colliding the moment the deleted one is restored.
    const insertedRow = {
      id: 'p-3',
      name: 'Studio',
      glyph: null,
      theme: 'paper',
      order: 1,
      recentGlyphs: null,
      lastPage: null,
    }
    const chain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ order: 0 }], error: null }),
      single: jest.fn().mockResolvedValue({ data: insertedRow, error: null }),
    }
    const supabase = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
      from: jest.fn().mockReturnValue(chain),
    }
    ;(createClient as jest.Mock).mockReturnValue(supabase)

    await createPond('Studio')

    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ order: 1 }))
  })
})
