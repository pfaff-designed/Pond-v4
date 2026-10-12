/**
 * Unit tests for `pushRecentGlyphToPond` (src/lib/pond/client.ts, KAN-248 7/8) —
 * the write over `pushRecentGlyph`'s pure merge. Mirrors the mocked-chain
 * approach in `pages-client.test.ts`: no live Supabase.
 */

import { pushRecentGlyphToPond } from '@/lib/pond/client'

function makeChain(overrides: Record<string, unknown> = {}) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

function makeSupabase(chain = makeChain()) {
  return { from: jest.fn().mockReturnValue(chain), _chain: chain }
}

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
import { createClient } from '@/lib/supabase/client'

describe('pushRecentGlyphToPond', () => {
  it('writes the pure merge — newest first, distinct, capped — to ponds.recent_glyphs', async () => {
    const chain = makeChain()
    ;(createClient as jest.Mock).mockReturnValue(makeSupabase(chain))

    const next = await pushRecentGlyphToPond('pond-1', ['leaf-01', 'heart'], 'heart')

    // `pushRecentGlyph`'s own rule: `heart` moves to the front, not duplicated.
    expect(next).toEqual(['heart', 'leaf-01'])
    expect(chain.update).toHaveBeenCalledWith({ recent_glyphs: ['heart', 'leaf-01'] })
    expect(chain.eq).toHaveBeenCalledWith('id', 'pond-1')
  })

  it('caps at RECENT_GLYPHS_LIMIT (8) the same way the pure merge does', async () => {
    const chain = makeChain()
    ;(createClient as jest.Mock).mockReturnValue(makeSupabase(chain))
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

    const next = await pushRecentGlyphToPond('pond-1', eight, 'z')

    expect(next).toEqual(['z', 'a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(next).toHaveLength(8)
  })

  it('throws when the write errors — the raw error, matching listPonds/createPond', async () => {
    const chain = makeChain({
      eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
    })
    ;(createClient as jest.Mock).mockReturnValue(makeSupabase(chain))

    await expect(pushRecentGlyphToPond('pond-1', [], 'heart')).rejects.toEqual({
      message: 'nope',
    })
  })
})
