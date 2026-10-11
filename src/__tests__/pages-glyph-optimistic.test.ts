/**
 * Optimistic cache mutator for a glyph pick (KAN-248 6/8): applyGlyphOptimistic
 * sets ONE row's glyph (null restores automatic) in the pagesKey() cache, so the
 * rail redraws through resolveMark before setPageGlyph's write lands. Mirrors
 * applyRenameOptimistic — touches only the picked row, so rolling back is the
 * same call with the previous glyph.
 */

import { QueryClient } from '@tanstack/react-query'
import { applyGlyphOptimistic, type PageRow } from '@/lib/pages/tree'
import { pagesKey } from '@/lib/pages/keys'

const at = '2026-01-01T00:00:00Z'
const rows = (): PageRow[] => [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: at },
  {
    id: 'sleep',
    parent_id: 'health',
    type: 'page',
    title: 'Sleep',
    order: 0,
    updated_at: at,
    glyph: 'moon',
  },
]
const key = pagesKey('pond-1')
const get = (qc: QueryClient) => qc.getQueryData<PageRow[]>(key)
const byId = (rows: PageRow[], id: string) => rows.find((r) => r.id === id)!

describe('applyGlyphOptimistic', () => {
  it('sets only the picked row’s glyph', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyGlyphOptimistic(client, { id: 'health', glyph: 'flower-02' }, 'pond-1')
    const after = get(client)!
    expect(byId(after, 'health').glyph).toBe('flower-02')
    expect(byId(after, 'sleep').glyph).toBe('moon')
  })

  it('null restores the automatic mark', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyGlyphOptimistic(client, { id: 'sleep', glyph: null }, 'pond-1')
    expect(byId(get(client)!, 'sleep').glyph).toBeNull()
  })

  it('rolling back leaves a move or add that landed in between untouched', () => {
    const client = new QueryClient()
    client.setQueryData(key, rows())
    applyGlyphOptimistic(client, { id: 'health', glyph: 'flower-02' }, 'pond-1')

    // interleaved: a new page lands before the write settles
    client.setQueryData<PageRow[]>(key, (current) => [
      ...(current ?? []),
      { id: 'scratch', parent_id: null, type: 'page', title: 'Scratchpad', order: 1, updated_at: at },
    ])

    applyGlyphOptimistic(client, { id: 'health', glyph: null }, 'pond-1')
    const after = get(client)!
    expect(byId(after, 'health').glyph).toBeNull()
    expect(after.map((r) => r.id)).toEqual(['health', 'sleep', 'scratch'])
  })

  it('does nothing when the pond has no cached pages yet', () => {
    const client = new QueryClient()
    applyGlyphOptimistic(client, { id: 'health', glyph: 'flower-02' }, 'pond-1')
    expect(get(client)).toBeUndefined()
  })
})
