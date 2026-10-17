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
  { id: 'p3', title: 'Woodworking', type: 'page' },
  { id: 'p4', title: '', type: 'page' }, // untitled row
]

describe('resolvePageFromRows', () => {
  it('resolves a linked page to its live ref', () => {
    expect(resolvePageFromRows(rows, 'p1')).toEqual({
      id: 'p1',
      title: 'Sanding guide',
      type: 'page',
      isNew: false,
    })
  })

  it('returns null for a missing page (orphaned link — deleted page)', () => {
    expect(resolvePageFromRows(rows, 'gone')).toBeNull()
  })

  it('falls back to "Untitled" for an empty stored title', () => {
    expect(resolvePageFromRows(rows, 'p4')).toEqual({
      id: 'p4',
      title: 'Untitled',
      type: 'page',
      isNew: false,
    })
  })

  it('reads isNew true for a nested page not yet opened (KAN-122)', () => {
    const nested: PageLike[] = [
      { id: 'p5', title: 'cabinets', type: 'page', props: { nestedFrom: 'p1' } },
    ]
    expect(resolvePageFromRows(nested, 'p5')?.isNew).toBe(true)
  })

  it('reads isNew false once the page has been opened', () => {
    const opened: PageLike[] = [
      {
        id: 'p5',
        title: 'cabinets',
        type: 'page',
        props: { nestedFrom: 'p1', openedAt: '2026-10-16T00:00:00.000Z' },
      },
    ]
    expect(resolvePageFromRows(opened, 'p5')?.isNew).toBe(false)
  })

  it('reads isNew false for a page with no nestedFrom stamp', () => {
    expect(resolvePageFromRows(rows, 'p1')?.isNew).toBe(false)
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

  it('carries isNew for a nested, unopened page', () => {
    const nested: PageLike[] = [
      { id: 'p5', title: 'cabinets', type: 'page', props: { nestedFrom: 'p1' } },
    ]
    expect(searchPagesInRows(nested, 'cabinets')[0].isNew).toBe(true)
  })
})
