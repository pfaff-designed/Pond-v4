/**
 * Optimistic cache mutator for a props write (KAN-122): applyPagePropsOptimistic
 * merges a patch onto ONE row's props in the pagesKey() cache, so a write-once
 * stamp (e.g. markOpened's openedAt) is reflected immediately — the page-link
 * chip and the rail row note disappear without waiting on a refetch. Mirrors
 * applyGlyphOptimistic: touches only the picked row.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyPagePropsOptimistic, type PageRow } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'

const at = '2026-01-01T00:00:00Z'
const rows = (): PageRow[] => [
  {
    id: 'kitchen',
    parent_id: null,
    type: 'page',
    title: 'Kitchen renovation',
    order: 0,
    updated_at: at,
  },
  {
    id: 'cabinets',
    parent_id: 'kitchen',
    type: 'page',
    title: 'Cabinets',
    order: 0,
    updated_at: at,
    props: { kind: 'nested page', nestedFrom: 'kitchen' },
  },
]
const key = pagesKey('pond-1')
const get = (qc: QueryClient) => qc.getQueryData<PageRow[]>(key)
const byId = (rows: PageRow[], id: string) => rows.find((r) => r.id === id)!

describe('applyPagePropsOptimistic', () => {
  it('merges the patch into the picked row’s existing props', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyPagePropsOptimistic(
      client,
      { id: 'cabinets', props: { openedAt: '2026-02-01T00:00:00Z' } },
      'pond-1'
    )
    const after = byId(get(client)!, 'cabinets')
    expect(after.props).toEqual({
      kind: 'nested page',
      nestedFrom: 'kitchen',
      openedAt: '2026-02-01T00:00:00Z',
    })
  })

  it('leaves every other row untouched', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyPagePropsOptimistic(client, { id: 'cabinets', props: { openedAt: at } }, 'pond-1')
    expect(byId(get(client)!, 'kitchen').props).toBeUndefined()
  })

  it('sets props on a row that had none yet', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyPagePropsOptimistic(client, { id: 'kitchen', props: { glyphPicked: true } }, 'pond-1')
    expect(byId(get(client)!, 'kitchen').props).toEqual({ glyphPicked: true })
  })

  it('does nothing when the pond has no cached pages yet', () => {
    const client = new QueryClient()
    applyPagePropsOptimistic(client, { id: 'cabinets', props: { openedAt: at } }, 'pond-1')
    expect(get(client)).toBeUndefined()
  })
})
