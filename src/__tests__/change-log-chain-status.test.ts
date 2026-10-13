/**
 * `resolveChainStatuses` — src/lib/change-log/store.ts (KAN-302).
 *
 * `change_log_step` (migration 0021) never flips a record's own `status` back
 * from `undone` on a redo: it inserts a NEW `redo` row linked via
 * `links.redoOf` to whichever id was just redone, and leaves the original row
 * `undone`. A card (or anything else) reading the original row's `status`
 * alone would see `undone` forever, even once a redo has landed. This proves
 * the chain walk that finds the tip instead — batched over every record a
 * reconcile run is watching, one `in(...)` query per hop, not one walk (and
 * two queries per hop) per record.
 */

type Row = { id: string; status: string; links: Record<string, string> }

/** One shared fake table: every `.from()` call reads the SAME row set, so a
 *  batched `in(...)` query sees every row a reconcile run's chains could hit —
 *  unlike the single-chain predecessor's per-call fake, this one also counts
 *  how many `.from()` calls (queries) it served. */
function makeSupabase(rows: Row[]) {
  let queries = 0
  const from = jest.fn(() => {
    queries += 1
    const state: { col?: string; values?: string[] } = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      in: jest.fn((col: string, values: string[]) => {
        state.col = col
        state.values = values
        return chain
      }),
      is: jest.fn(() => chain),
      order: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: (resolve_: (v: { data: Row[]; error: null }) => void) => {
        const col = state.col
        const values = new Set(state.values ?? [])
        const data = col
          ? rows.filter((r) => values.has(r.links[col.replace('links->>', '')] ?? ''))
          : []
        resolve_({ data, error: null })
      },
    }
    return chain
  })
  return { from, queryCount: () => queries }
}

import { resolveChainStatuses } from '@/lib/change-log/store'

describe('resolveChainStatuses', () => {
  it('a record never undone keeps its own status', async () => {
    const supabase = makeSupabase([])
    const tips = await resolveChainStatuses(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      records: [{ id: 'edit-1', status: 'accepted' }],
    })
    expect(tips.get('edit-1')).toBe('accepted')
  })

  it('an undone record with no redo stays undone', async () => {
    const supabase = makeSupabase([{ id: 'undo-1', status: 'accepted', links: { undo_of: 'edit-1' } }])
    const tips = await resolveChainStatuses(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      records: [{ id: 'edit-1', status: 'undone' }],
    })
    expect(tips.get('edit-1')).toBe('undone')
  })

  it('accept -> undo -> redo resolves to accepted, not the row-frozen undone', async () => {
    const supabase = makeSupabase([
      { id: 'undo-1', status: 'accepted', links: { undo_of: 'edit-1' } },
      { id: 'redo-1', status: 'accepted', links: { redo_of: 'edit-1' } },
    ])
    const tips = await resolveChainStatuses(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      // The record's own row is still `undone` — 0021 never rewrites it.
      records: [{ id: 'edit-1', status: 'undone' }],
    })
    expect(tips.get('edit-1')).toBe('accepted')
  })

  it('a second undo after the redo resolves back to undone', async () => {
    const supabase = makeSupabase([
      { id: 'redo-1', status: 'accepted', links: { redo_of: 'edit-1' } },
      { id: 'undo-2', status: 'accepted', links: { undo_of: 'redo-1' } },
    ])
    const tips = await resolveChainStatuses(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      records: [{ id: 'edit-1', status: 'undone' }],
    })
    expect(tips.get('edit-1')).toBe('undone')
  })

  it('a redo row that has since been reverted reports reverted, not accepted', async () => {
    // edit-1 -> undo-1 -> redo-1 (stands) -> a revert of redo-1 flips redo-1's
    // OWN row to `reverted` (accept_revert_record, 0021) without any further
    // undo_of/redo_of hop — the walk must read the tip's row status, not infer
    // `accepted` just because the hop that found it was a redo.
    const supabase = makeSupabase([
      { id: 'undo-1', status: 'accepted', links: { undo_of: 'edit-1' } },
      { id: 'redo-1', status: 'reverted', links: { redo_of: 'edit-1' } },
    ])
    const tips = await resolveChainStatuses(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      records: [{ id: 'edit-1', status: 'undone' }],
    })
    expect(tips.get('edit-1')).toBe('reverted')
  })

  it('a 3-card thread makes at most (hops + 1) queries, walked together', async () => {
    // Three independent chains, each one hop deep (edit-N -> redo-N). A
    // per-record walk would cost 3 records x 2 queries/hop x 2 rounds (one
    // round finds the redo, the next comes up empty and stops the walk) = 12
    // queries; walked together, one round is one `in(...)` query per link
    // kind over every chain still active, so 1 real hop + 1 confirming empty
    // round = (hops + 1) = 2 rounds, 2 queries (redo_of, undo_of) each = 4
    // total, independent of how many of the 3 chains are walking.
    const hops = 1
    const supabase = makeSupabase([
      { id: 'redo-a', status: 'accepted', links: { redo_of: 'edit-a' } },
      { id: 'redo-b', status: 'accepted', links: { redo_of: 'edit-b' } },
      { id: 'redo-c', status: 'accepted', links: { redo_of: 'edit-c' } },
    ])
    const tips = await resolveChainStatuses(supabase as never, {
      userId: 'user-1',
      pondId: 'pond-1',
      records: [
        { id: 'edit-a', status: 'undone' },
        { id: 'edit-b', status: 'undone' },
        { id: 'edit-c', status: 'undone' },
      ],
    })
    expect(tips.get('edit-a')).toBe('accepted')
    expect(tips.get('edit-b')).toBe('accepted')
    expect(tips.get('edit-c')).toBe('accepted')
    expect(supabase.queryCount()).toBeLessThanOrEqual((hops + 1) * 2)
  })
})
