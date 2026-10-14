/**
 * Unit tests for the ⌘K palette's recency list (KAN-99) — the localStorage
 * read/write the composer's @ picker now shares.
 */

import { readRecentPageIds, writeRecent } from './recent-pages'

describe('readRecentPageIds / writeRecent', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns no ids when nothing has been written', () => {
    expect(readRecentPageIds()).toEqual([])
  })

  it('returns written ids, newest first', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' })
    writeRecent({ id: 'b', type: 'page', title: 'B' })
    expect(readRecentPageIds()).toEqual(['b', 'a'])
  })

  it('moves a re-written id to the front instead of duplicating it', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' })
    writeRecent({ id: 'b', type: 'page', title: 'B' })
    writeRecent({ id: 'a', type: 'page', title: 'A' })
    expect(readRecentPageIds()).toEqual(['a', 'b'])
  })

  it('caps the list at three', () => {
    writeRecent({ id: 'a', type: 'page', title: 'A' })
    writeRecent({ id: 'b', type: 'page', title: 'B' })
    writeRecent({ id: 'c', type: 'page', title: 'C' })
    writeRecent({ id: 'd', type: 'page', title: 'D' })
    expect(readRecentPageIds()).toEqual(['d', 'c', 'b'])
  })

  it('caps a list read from a larger, older write', () => {
    window.localStorage.setItem(
      'pond:recent-pages',
      JSON.stringify([
        { id: 'a', type: 'page', title: 'A' },
        { id: 'b', type: 'page', title: 'B' },
        { id: 'c', type: 'page', title: 'C' },
        { id: 'd', type: 'page', title: 'D' },
      ])
    )
    expect(readRecentPageIds()).toEqual(['a', 'b', 'c'])
  })

  it('returns no ids when localStorage throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readRecentPageIds()).toEqual([])
    spy.mockRestore()
  })
})
