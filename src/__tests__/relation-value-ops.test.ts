/**
 * Pure list ops behind the RelationValue picker (#20 slice 4). A relation value is
 * a string[] of linked page-ids; the picker adds, removes, and (when `single`)
 * replaces. Kept pure so the edit logic is tested without rendering.
 */

import { addLink, removeLink } from '@/lib/modules/view/relation-value-ops'

describe('addLink', () => {
  it('appends a new id to the end (multi)', () => {
    expect(addLink(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('is idempotent — an already-linked id is not duplicated (multi)', () => {
    expect(addLink(['a', 'b'], 'b')).toEqual(['a', 'b'])
  })

  it('adds to an empty value', () => {
    expect(addLink([], 'a')).toEqual(['a'])
  })

  it('single replaces the whole value with just the picked id (radio)', () => {
    expect(addLink(['a', 'b'], 'c', true)).toEqual(['c'])
  })

  it('single on an empty value yields the single id', () => {
    expect(addLink([], 'a', true)).toEqual(['a'])
  })

  it('does not mutate the input array', () => {
    const value = ['a']
    addLink(value, 'b')
    expect(value).toEqual(['a'])
  })
})

describe('removeLink', () => {
  it('drops the given id', () => {
    expect(removeLink(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('is a no-op when the id is absent', () => {
    expect(removeLink(['a', 'b'], 'z')).toEqual(['a', 'b'])
  })

  it('removes every occurrence of a duplicated id (defensive)', () => {
    expect(removeLink(['a', 'a', 'b'], 'a')).toEqual(['b'])
  })
})
