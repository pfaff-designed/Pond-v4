/**
 * Optimistic cache mutator for a colour pick (KAN-249 1/7): applyAreaRoleOptimistic
 * sets ONE row's area_role (null restores ink) in the pagesKey() cache, so the
 * rail and breadcrumb redraw through resolveMark before setAreaRole's write lands.
 * Mirrors applyGlyphOptimistic — touches only the picked row, so rolling back is
 * the same call with the previous role.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyAreaRoleOptimistic, type PageRow } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'

const at = '2026-01-01T00:00:00Z'
const rows = (): PageRow[] => [
  {
    id: 'health',
    parent_id: null,
    type: 'page',
    title: 'Health',
    order: 0,
    updated_at: at,
    area_role: 'area-a',
  },
  { id: 'sleep', parent_id: 'health', type: 'page', title: 'Sleep', order: 0, updated_at: at },
]
const key = pagesKey('pond-1')
const get = (qc: QueryClient) => qc.getQueryData<PageRow[]>(key)
const byId = (rows: PageRow[], id: string) => rows.find((r) => r.id === id)!

describe('applyAreaRoleOptimistic', () => {
  it('sets only the picked row’s area_role', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyAreaRoleOptimistic(client, { id: 'health', role: 'area-b' }, 'pond-1')
    const after = get(client)!
    expect(byId(after, 'health').area_role).toBe('area-b')
    expect(byId(after, 'sleep').area_role).toBeUndefined()
  })

  it('a null role restores ink', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyAreaRoleOptimistic(client, { id: 'health', role: null }, 'pond-1')
    expect(byId(get(client)!, 'health').area_role).toBeNull()
  })

  it('rolling back leaves a move or add that landed in between untouched', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyAreaRoleOptimistic(client, { id: 'health', role: 'area-c' }, 'pond-1')

    // interleaved: a new page lands before the write settles
    client.setQueryData<PageRow[]>(key, (current) => [
      ...(current ?? []),
      { id: 'scratch', parent_id: null, type: 'page', title: 'Scratchpad', order: 1, updated_at: at },
    ])

    applyAreaRoleOptimistic(client, { id: 'health', role: null }, 'pond-1')
    const after = get(client)!
    expect(byId(after, 'health').area_role).toBeNull()
    expect(after.map((r) => r.id)).toEqual(['health', 'sleep', 'scratch'])
  })

  it('does nothing when the pond has no cached pages yet', () => {
    const client = new QueryClient()
    applyAreaRoleOptimistic(client, { id: 'health', role: 'area-a' }, 'pond-1')
    expect(get(client)).toBeUndefined()
  })
})
