/**
 * Optimistic cache mutator for drag-to-reparent/reorder (F25):
 * applyMoveOptimistic sets the moved row's parent_id and rewrites order for the
 * reindexed target group in the ['pages', workspace] cache, returning a pre-move
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
  qc.setQueryData(['pages', 'main'], rows)
  return { qc, rows }
}

const get = (qc: QueryClient) => qc.getQueryData<PageRow[]>(['pages', 'main'])!
const byId = (rows: PageRow[], id: string) => rows.find((r) => r.id === id)!

describe('applyMoveOptimistic', () => {
  it('sets the moved row parent_id and reindexes the target group densely', () => {
    const { qc } = seed()
    applyMoveOptimistic(qc, 'main', {
      movedId: 'scratch',
      newParentId: 'health',
      siblingOrder: ['sleep', 'marathon', 'scratch'],
    })
    const rows = get(qc)
    expect(byId(rows, 'scratch').parent_id).toBe('health')
    expect(byId(rows, 'sleep').order).toBe(0)
    expect(byId(rows, 'marathon').order).toBe(1)
    expect(byId(rows, 'scratch').order).toBe(2)
  })

  it('moves a page to top-level with a null parent_id', () => {
    const { qc } = seed()
    applyMoveOptimistic(qc, 'main', {
      movedId: 'sleep',
      newParentId: null,
      siblingOrder: ['health', 'scratch', 'sleep'],
    })
    expect(byId(get(qc), 'sleep').parent_id).toBeNull()
  })

  it('returns the pre-move snapshot, and restoring it reverts the cache', () => {
    const { qc, rows } = seed()
    const snapshot = applyMoveOptimistic(qc, 'main', {
      movedId: 'scratch',
      newParentId: 'health',
      siblingOrder: ['sleep', 'marathon', 'scratch'],
    })
    expect(snapshot).toBe(rows) // the exact prior array reference
    // moved in the cache…
    expect(byId(get(qc), 'scratch').parent_id).toBe('health')
    // …then rolled back
    qc.setQueryData(['pages', 'main'], snapshot)
    expect(byId(get(qc), 'scratch').parent_id).toBeNull()
    expect(byId(get(qc), 'scratch').order).toBe(0)
  })
})
