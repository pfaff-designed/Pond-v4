/**
 * Unit tests for the rail's per-pond expanded-rows store (KAN-393).
 */

import { readExpandedIds, writeExpandedIds, pruneExpandedIds } from '@/lib/rail/expanded-store'

describe('readExpandedIds / writeExpandedIds', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trips written ids for a pond', () => {
    writeExpandedIds('pond-1', ['a', 'b', 'c'])
    expect(readExpandedIds('pond-1')).toEqual(['a', 'b', 'c'])
  })

  it('keeps ponds isolated', () => {
    writeExpandedIds('pond-1', ['a'])
    writeExpandedIds('pond-2', ['b'])
    expect(readExpandedIds('pond-1')).toEqual(['a'])
    expect(readExpandedIds('pond-2')).toEqual(['b'])
  })

  it('returns no ids for a pond that has never written', () => {
    expect(readExpandedIds('pond-1')).toEqual([])
  })

  it('caps at 500 on write, keeping the last 500 of 600', () => {
    const ids = Array.from({ length: 600 }, (_, i) => `id-${i}`)
    writeExpandedIds('pond-1', ids)
    const stored = readExpandedIds('pond-1')
    expect(stored).toHaveLength(500)
    expect(stored).toEqual(ids.slice(100))
  })

  it('reads malformed JSON back as empty', () => {
    window.localStorage.setItem('pond:rail-expanded:pond-1', '{not json')
    expect(readExpandedIds('pond-1')).toEqual([])
  })

  it('reads a non-array value back as empty', () => {
    window.localStorage.setItem('pond:rail-expanded:pond-1', JSON.stringify({ a: 1 }))
    expect(readExpandedIds('pond-1')).toEqual([])
  })

  it('reads an array with non-string entries back as empty', () => {
    window.localStorage.setItem('pond:rail-expanded:pond-1', JSON.stringify(['a', 1, 'c']))
    expect(readExpandedIds('pond-1')).toEqual([])
  })

  it('does not throw when localStorage.getItem throws, and reads back empty', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => readExpandedIds('pond-1')).not.toThrow()
    expect(readExpandedIds('pond-1')).toEqual([])
    spy.mockRestore()
  })

  it('does not throw when localStorage.setItem throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => writeExpandedIds('pond-1', ['a'])).not.toThrow()
    spy.mockRestore()
  })

  it('writing [] is a no-op that reads back empty', () => {
    writeExpandedIds('pond-1', ['a', 'b'])
    writeExpandedIds('pond-1', [])
    expect(readExpandedIds('pond-1')).toEqual([])
  })
})

describe('pruneExpandedIds', () => {
  it('drops ids not present in validIds', () => {
    expect(pruneExpandedIds(['a', 'b', 'c'], new Set(['a', 'c']))).toEqual(['a', 'c'])
  })

  it('returns [] when nothing is valid', () => {
    expect(pruneExpandedIds(['a', 'b'], new Set())).toEqual([])
  })
})
