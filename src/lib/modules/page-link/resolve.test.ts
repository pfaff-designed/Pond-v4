/**
 * F27 — pure page-link resolution. The context provider is a thin shell over these,
 * so covering them (against a fixture rows array) covers the resolution logic without
 * React.
 */
import { resolvePageFromRows, searchPagesInRows } from './resolve'
import type { PageLike } from './resolve'

const rows: PageLike[] = [
  { id: 'p1', title: 'Sanding guide', type: 'page' },
  { id: 'p2', title: 'Supplies', type: 'page' },
  { id: 'p3', title: 'Woodworking', type: 'area' },
  { id: 'p4', title: '', type: 'page' }, // untitled row
]

describe('resolvePageFromRows', () => {
  it('resolves a linked page to its live ref', () => {
    expect(resolvePageFromRows(rows, 'p1')).toEqual({
      id: 'p1',
      title: 'Sanding guide',
      type: 'page',
    })
  })

  it('returns null for a missing page (orphaned link — deleted page)', () => {
    expect(resolvePageFromRows(rows, 'gone')).toBeNull()
  })

  it('falls back to "Untitled" for an empty stored title', () => {
    expect(resolvePageFromRows(rows, 'p4')).toEqual({ id: 'p4', title: 'Untitled', type: 'page' })
  })
})

describe('searchPagesInRows', () => {
  it('matches titles case-insensitively by substring', () => {
    expect(searchPagesInRows(rows, 'sand').map((r) => r.id)).toEqual(['p1'])
    expect(searchPagesInRows(rows, 'WOOD').map((r) => r.id)).toEqual(['p3'])
  })

  it('lists the first rows for an empty query', () => {
    expect(searchPagesInRows(rows, '   ').map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('respects the result limit', () => {
    expect(searchPagesInRows(rows, '', 2).map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  it('normalizes an empty title to "Untitled" in results', () => {
    expect(searchPagesInRows(rows, '').find((r) => r.id === 'p4')?.title).toBe('Untitled')
  })
})
