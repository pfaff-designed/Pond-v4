/**
 * Unit tests for `firstPondId`'s live-pond filter (KAN-493).
 *
 * Before this fix, `firstPondId` had no `deleted_at` filter at all: delete your
 * only pond, and the next cold read of `?pond=`-less scope (`fetchPages`,
 * `createNode`, the change-log store, templates, `home.ts`, the chat route)
 * answered the DELETED pond's id, same as a surface that never existed.
 */

import { firstPondId } from './first'

function makeSupabase(rows: Array<{ id: string }>) {
  const isCalls: Array<[string, unknown]> = []
  const chain: Record<string, jest.Mock> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    is: jest.fn((col: string, val: unknown) => {
      isCalls.push([col, val])
      return chain
    }),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
  }
  return { from: jest.fn(() => chain), isCalls }
}

describe('firstPondId', () => {
  it('filters to live ponds — the same deleted_at check listPonds applies', async () => {
    const { from, isCalls } = makeSupabase([{ id: 'pond-live' }])

    const id = await firstPondId({ from } as never, 'user-1')

    expect(id).toBe('pond-live')
    expect(isCalls).toContainEqual(['deleted_at', null])
  })

  it('answers null, not the deleted pond, when the only pond is soft-deleted', async () => {
    // Stands in for the real filter actually excluding the row: no live rows left.
    const { from } = makeSupabase([])

    expect(await firstPondId({ from } as never, 'user-1')).toBeNull()
  })
})
