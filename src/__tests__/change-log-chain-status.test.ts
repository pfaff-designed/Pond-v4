/**
 * `resolveChainStatus` — src/lib/change-log/store.ts (KAN-302).
 *
 * `change_log_step` (migration 0021) never flips a record's own `status` back
 * from `undone` on a redo: it inserts a NEW `redo` row linked via
 * `links.redoOf` to whichever id was just redone, and leaves the original row
 * `undone`. A card (or anything else) reading the original row's `status`
 * alone would see `undone` forever, even once a redo has landed. This proves
 * the chain walk that finds the tip instead.
 */

type Row = { id: string }

/** Each `.from()` call gets its OWN filter state, so the two parallel
 *  redo_of/undo_of queries one hop makes don't clobber each other. */
function makeSupabase(responses: (filters: Record<string, string>) => Row[]) {
  const from = jest.fn(() => {
    const state: Record<string, string> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn((col: string, val: string) => {
        state[col] = val
        return chain
      }),
      is: jest.fn((col: string) => {
        state[col] = 'null'
        return chain
      }),
      order: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: (resolve_: (v: { data: Row[]; error: null }) => void) =>
        resolve_({ data: responses(state), error: null }),
    }
    return chain
  })
  return { from }
}

import { resolveChainStatus } from '@/lib/change-log/store'

describe('resolveChainStatus', () => {
  it('a record never undone keeps its own status', async () => {
    const supabase = makeSupabase(() => [])
    const status = await resolveChainStatus(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      recordId: 'edit-1',
      status: 'accepted',
    })
    expect(status).toBe('accepted')
  })

  it('an undone record with no redo stays undone', async () => {
    const supabase = makeSupabase((filters) => {
      if (filters['links->>undo_of'] === 'edit-1') return [{ id: 'undo-1' }]
      return []
    })
    const status = await resolveChainStatus(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      recordId: 'edit-1',
      status: 'undone',
    })
    expect(status).toBe('undone')
  })

  it('accept -> undo -> redo resolves to accepted, not the row-frozen undone', async () => {
    const supabase = makeSupabase((filters) => {
      if (filters['links->>redo_of'] === 'edit-1') return [{ id: 'redo-1' }]
      if (filters['links->>undo_of'] === 'edit-1') return [{ id: 'undo-1' }]
      return []
    })
    const status = await resolveChainStatus(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      recordId: 'edit-1',
      // The record's own row is still `undone` — 0021 never rewrites it.
      status: 'undone',
    })
    expect(status).toBe('accepted')
  })

  it('a second undo after the redo resolves back to undone', async () => {
    const supabase = makeSupabase((filters) => {
      if (filters['links->>redo_of'] === 'edit-1') return [{ id: 'redo-1' }]
      if (filters['links->>undo_of'] === 'redo-1') return [{ id: 'undo-2' }]
      return []
    })
    const status = await resolveChainStatus(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      recordId: 'edit-1',
      status: 'undone',
    })
    expect(status).toBe('undone')
  })
})
