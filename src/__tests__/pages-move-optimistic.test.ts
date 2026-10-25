/**
 * Optimistic cache mutator for drag-to-reparent/reorder (F25):
 * applyMoveOptimistic sets the moved row's parent_id and rewrites order for the
 * reindexed target group in the pagesKey() cache, returning a pre-move
 * snapshot for rollback. Uses a real QueryClient — the same cache the rail reads.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyMoveOptimistic, type PageRow } from '@/lib/pages/tree'

const row = (id: string, parent_id: string | null, order: number): PageRow => ({
  id,
  parent_id,
  type: 'page',
  title: id,
  order,
  updated_at: '2026-09-01T00:00:00Z',
})

function seed(): { qc: QueryClient; rows: PageRow[] } {
  const rows = [
    row('health', null, 0),
    row('sleep', 'health', 0),
    row('marathon', 'health', 0),
    row('scratch', null, 0),
  ]
  const qc = new QueryClient()
  qc.setQueryData(['pages'], rows)
  return { qc, rows }
}

const get = (qc: QueryClient) => qc.getQueryData<PageRow[]>(['pages'])!
const byId = (rows: PageRow[], id: string) => rows.find((r) => r.id === id)!

describe('applyMoveOptimistic', () => {
  it('sets the moved row parent_id and reindexes the target group densely', () => {
    const { qc } = seed()
    applyMoveOptimistic(
      qc,
      {
        movedId: 'scratch',
        newParentId: 'health',
        siblingOrder: ['sleep', 'marathon', 'scratch'],
      },
      null
    )
    const rows = get(qc)
    expect(byId(rows, 'scratch').parent_id).toBe('health')
    expect(byId(rows, 'sleep').order).toBe(0)
    expect(byId(rows, 'marathon').order).toBe(1)
    expect(byId(rows, 'scratch').order).toBe(2)
  })

  it('moves a page to top-level with a null parent_id', () => {
    const { qc } = seed()
    applyMoveOptimistic(
      qc,
      {
        movedId: 'sleep',
        newParentId: null,
        siblingOrder: ['health', 'scratch', 'sleep'],
      },
      null
    )
    expect(byId(get(qc), 'sleep').parent_id).toBeNull()
  })

  it('returns the pre-move snapshot, and restoring it reverts the cache', () => {
    const { qc, rows } = seed()
    const snapshot = applyMoveOptimistic(
      qc,
      {
        movedId: 'scratch',
        newParentId: 'health',
        siblingOrder: ['sleep', 'marathon', 'scratch'],
      },
      null
    )
    expect(snapshot).toBe(rows) // the exact prior array reference
    // moved in the cache…
    expect(byId(get(qc), 'scratch').parent_id).toBe('health')
    // …then rolled back
    qc.setQueryData(['pages'], snapshot)
    expect(byId(get(qc), 'scratch').parent_id).toBeNull()
    expect(byId(get(qc), 'scratch').order).toBe(0)
  })

  it('nesting a coloured area clears its role, as the database does on the move', () => {
    const { qc } = seed()
    qc.setQueryData<PageRow[]>(['pages'], (rows) =>
      rows!.map((r) => (r.id === 'scratch' ? { ...r, area_role: 'area-b' } : r))
    )
    applyMoveOptimistic(
      qc,
      { movedId: 'scratch', newParentId: 'health', siblingOrder: ['sleep', 'marathon', 'scratch'] },
      null
    )
    expect(byId(get(qc), 'scratch').area_role).toBeNull()

    // …so moving it straight back out, before any refetch, draws it in ink.
    applyMoveOptimistic(
      qc,
      { movedId: 'scratch', newParentId: null, siblingOrder: ['health', 'scratch'] },
      null
    )
    expect(byId(get(qc), 'scratch').area_role).toBeNull()
  })

  it('KAN-470: a newTitle renames the moved row in the same optimistic write', () => {
    const { qc } = seed()
    applyMoveOptimistic(
      qc,
      {
        movedId: 'scratch',
        newParentId: 'health',
        siblingOrder: ['sleep', 'marathon', 'scratch'],
        newTitle: 'scratch 2',
      },
      null
    )
    expect(byId(get(qc), 'scratch').title).toBe('scratch 2')
  })

  it('omitting newTitle leaves the moved row title untouched', () => {
    const { qc } = seed()
    applyMoveOptimistic(
      qc,
      {
        movedId: 'scratch',
        newParentId: 'health',
        siblingOrder: ['sleep', 'marathon', 'scratch'],
      },
      null
    )
    expect(byId(get(qc), 'scratch').title).toBe('scratch')
  })

  it('reordering an area among the top level keeps its role', () => {
    const { qc } = seed()
    qc.setQueryData<PageRow[]>(['pages'], (rows) =>
      rows!.map((r) => (r.id === 'scratch' ? { ...r, area_role: 'area-b' } : r))
    )
    applyMoveOptimistic(
      qc,
      { movedId: 'scratch', newParentId: null, siblingOrder: ['scratch', 'health'] },
      null
    )
    expect(byId(get(qc), 'scratch').area_role).toBe('area-b')
  })
})
