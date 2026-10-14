/**
 * Unit tests for the composer's @ picker narrowing/ordering (KAN-99).
 */

import { linkedPageIds, orderMentionPages } from './mention-pages'
import type { PageRow } from './tree'

const page = (id: string, title: string, parent_id: string | null = null): PageRow => ({
  id,
  parent_id,
  type: 'page',
  title,
  order: 0,
  updated_at: '2026-01-01',
})

describe('linkedPageIds', () => {
  const pages = [
    page('root', 'Root'),
    page('kitchen', 'Kitchen renovation', 'root'),
    page('budget', 'Budget', 'kitchen'),
    page('timeline', 'Timeline', 'kitchen'),
    page('unrelated', 'Unrelated'),
  ]

  it("includes a ref'd page's parent", () => {
    expect(linkedPageIds(pages, ['kitchen'])).toContain('root')
  })

  it("includes every page parented under a ref'd page", () => {
    const linked = linkedPageIds(pages, ['kitchen'])
    expect(linked).toEqual(expect.arrayContaining(['budget', 'timeline']))
  })

  it('excludes pages unrelated to any ref', () => {
    expect(linkedPageIds(pages, ['kitchen'])).not.toContain('unrelated')
  })

  it("returns no ids for a ref'd page with no parent and no children", () => {
    expect(linkedPageIds(pages, ['unrelated'])).toEqual([])
  })
})

describe('orderMentionPages', () => {
  const pages = [
    page('a', 'Alpha'),
    page('b', 'Beta'),
    page('c', 'Gamma'),
    page('d', 'Delta'),
  ]

  it('matches title case-insensitively, substring, empty query matches all', () => {
    expect(orderMentionPages(pages, { recentIds: [], linkedIds: [], excludeIds: [] }, 'eta')
      .map((p) => p.id)).toEqual(['b'])
    expect(orderMentionPages(pages, { recentIds: [], linkedIds: [], excludeIds: [] }, 'GAM')
      .map((p) => p.id)).toEqual(['c'])
    expect(orderMentionPages(pages, { recentIds: [], linkedIds: [], excludeIds: [] }, '')
      .map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('orders recent matches first, in recentIds order', () => {
    const result = orderMentionPages(
      pages,
      { recentIds: ['c', 'a'], linkedIds: [], excludeIds: [] },
      ''
    )
    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('orders linked matches after recent, before the rest, without duplicating a recent pick', () => {
    const result = orderMentionPages(
      pages,
      { recentIds: ['b'], linkedIds: ['b', 'd'], excludeIds: [] },
      ''
    )
    expect(result.map((p) => p.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('falls back to input order for pages neither recent nor linked', () => {
    const result = orderMentionPages(pages, { recentIds: [], linkedIds: [], excludeIds: [] }, '')
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops excluded pages outright, even if recent or linked', () => {
    const result = orderMentionPages(
      pages,
      { recentIds: ['a'], linkedIds: ['b'], excludeIds: ['a', 'b'] },
      ''
    )
    expect(result.map((p) => p.id)).toEqual(['c', 'd'])
  })
})
