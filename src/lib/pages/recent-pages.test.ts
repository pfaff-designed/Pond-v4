/**
 * Unit tests for the ⌘K palette's recency list (KAN-99) — the localStorage
 * read/write the composer's @ picker now shares. Per-pond (KAN-390): each
 * pond keeps its own 20-entry list under `pond:recent-pages:<pondId>`.
 */

import { readRecentPageIds, writeRecent } from './recent-pages'

describe('readRecentPageIds / writeRecent', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns no ids when nothing has been written', () => {
    expect(readRecentPageIds('pond-1')).toEqual([])
  })

  it('returns written ids, newest first', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' }, 'pond-1')
    writeRecent({ id: 'b', type: 'page', title: 'B' }, 'pond-1')
    expect(readRecentPageIds('pond-1')).toEqual(['b', 'a'])
  })

  it('moves a re-written id to the front instead of duplicating it', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' }, 'pond-1')
    writeRecent({ id: 'b', type: 'page', title: 'B' }, 'pond-1')
    writeRecent({ id: 'a', type: 'page', title: 'A' }, 'pond-1')
    expect(readRecentPageIds('pond-1')).toEqual(['a', 'b'])
  })

  it('caps the list at twenty', () => {
    for (let i = 0; i < 21; i++) {
      writeRecent({ id: `id-${i}`, type: 'page', title: `Page ${i}` }, 'pond-1')
    }
    const ids = readRecentPageIds('pond-1')
    expect(ids).toHaveLength(20)
    expect(ids[0]).toBe('id-20')
    expect(ids).not.toContain('id-0')
  })

  it('caps a list read from a larger, older write', () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      type: 'page',
      title: `Page ${i}`,
    }))
    window.localStorage.setItem('pond:recent-pages:pond-1', JSON.stringify(entries))
    expect(readRecentPageIds('pond-1')).toEqual(entries.slice(0, 20).map((e) => e.id))
  })

  it('returns no ids when localStorage throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readRecentPageIds('pond-1')).toEqual([])
    spy.mockRestore()
  })

  it('keeps two ponds on separate lists', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' }, 'pond-1')
    writeRecent({ id: 'x', type: 'page', title: 'X' }, 'pond-2')
    writeRecent({ id: 'y', type: 'page', title: 'Y' }, 'pond-2')
    expect(readRecentPageIds('pond-1')).toEqual(['a'])
    expect(readRecentPageIds('pond-2')).toEqual(['y', 'x'])
  })

  it('does not read back a list written under the old global key, for either pond', () => {
    window.localStorage.setItem(
      'pond:recent-pages',
      JSON.stringify([{ id: 'a', type: 'page', title: 'A' }])
    )
    expect(readRecentPageIds('pond-1')).toEqual([])
    expect(readRecentPageIds('pond-2')).toEqual([])
  })

  it('does nothing without a pond id', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' }, null)
    expect(readRecentPageIds(null)).toEqual([])
    expect(readRecentPageIds('pond-1')).toEqual([])
  })
})
