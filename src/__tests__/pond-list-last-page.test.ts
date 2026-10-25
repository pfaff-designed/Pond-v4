/**
 * Unit tests for `listPonds`'s row mapping (src/lib/pond/client.ts, KAN-16).
 *
 * Trash is a soft delete (`pages.deleted_at`, migration 0027): the
 * `last_page_id` FK's `on delete set null` only fires on a hard delete, so a
 * remembered page sitting in trash still satisfies the FK and would otherwise
 * reach `pondHref`. `listPonds` embeds the page through the FK instead of
 * reading the column flat, and reads a trashed or missing page back as a null
 * `lastPageId` itself — RLS also hides a trashed row from this embed in
 * production, but the mapping does not rely on that alone (pglite, which this
 * mirrors, connects as owner and bypasses RLS).
 */

import { listPonds } from '@/lib/pond/client'

function makeChain(data: unknown[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data, error: null }),
  }
}

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
import { createClient } from '@/lib/supabase/client'

function mockRows(data: unknown[]) {
  const chain = makeChain(data)
  ;(createClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn().mockReturnValue(chain),
  })
  return chain
}

const BASE = { id: 'pond-1', name: 'life', glyph: null, theme: 'paper', order: 0 }

describe('listPonds — lastPageId from the embedded page', () => {
  it('keeps a live remembered page', async () => {
    mockRows([{ ...BASE, lastPage: { id: 'page-x', deleted_at: null } }])

    const [pond] = await listPonds()

    expect(pond.lastPageId).toBe('page-x')
  })

  it('reads a trashed remembered page back as null, not the FK (deleted_at set, row still exists)', async () => {
    mockRows([
      { ...BASE, lastPage: { id: 'page-x', deleted_at: '2026-01-01T00:00:00.000Z' } },
    ])

    const [pond] = await listPonds()

    expect(pond.lastPageId).toBeNull()
  })

  it('reads a gone remembered page (hard-deleted, no embedded row) back as null', async () => {
    mockRows([{ ...BASE, lastPage: null }])

    const [pond] = await listPonds()

    expect(pond.lastPageId).toBeNull()
  })

  it('reads a pond never visited (no remembered page) as null', async () => {
    mockRows([{ ...BASE, lastPage: null }])

    const [pond] = await listPonds()

    expect(pond.lastPageId).toBeNull()
  })
})

describe('listPonds — favouritePageIds (KAN-475, migration 0035)', () => {
  it('maps a null favourite_page_ids column to undefined', async () => {
    mockRows([{ ...BASE, lastPage: null, favouritePageIds: null }])

    const [pond] = await listPonds()

    expect(pond.favouritePageIds).toBeUndefined()
  })

  it('round-trips a populated favourite_page_ids column in order', async () => {
    mockRows([{ ...BASE, lastPage: null, favouritePageIds: ['page-b', 'page-a'] }])

    const [pond] = await listPonds()

    expect(pond.favouritePageIds).toEqual(['page-b', 'page-a'])
  })
})
