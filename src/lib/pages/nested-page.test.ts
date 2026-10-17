import { isNewNestedPage, readNestedFrom, stampNestedPage } from './nested-page'

describe('stampNestedPage', () => {
  it('stamps kind and nestedFrom onto empty props', () => {
    const stamped = stampNestedPage({}, 'parent-1')
    expect(stamped).toEqual({ kind: 'nested page', nestedFrom: 'parent-1' })
  })

  it('is a no-op once nestedFrom is already present', () => {
    const props = { kind: 'nested page', nestedFrom: 'parent-1', openedAt: '2026-01-01T00:00:00Z' }
    expect(stampNestedPage(props, 'parent-2')).toEqual(props)
  })

  it('preserves other props alongside the stamp', () => {
    const stamped = stampNestedPage({ title: 'untitled' }, 'parent-1')
    expect(stamped).toEqual({ title: 'untitled', kind: 'nested page', nestedFrom: 'parent-1' })
  })
})

describe('readNestedFrom', () => {
  it('reads the parent page id off a stamped page', () => {
    expect(readNestedFrom({ nestedFrom: 'parent-1' })).toBe('parent-1')
  })

  it('returns null when absent', () => {
    expect(readNestedFrom({})).toBeNull()
  })

  it('returns null for malformed props', () => {
    expect(readNestedFrom(null)).toBeNull()
    expect(readNestedFrom(undefined)).toBeNull()
    expect(readNestedFrom({ nestedFrom: 42 })).toBeNull()
  })
})

describe('isNewNestedPage', () => {
  it('is false when there is no stamp', () => {
    expect(isNewNestedPage({})).toBe(false)
  })

  it('is true when stamped and not yet opened', () => {
    expect(isNewNestedPage({ nestedFrom: 'parent-1' })).toBe(true)
  })

  it('is false once openedAt is set', () => {
    expect(
      isNewNestedPage({ nestedFrom: 'parent-1', openedAt: '2026-01-01T00:00:00Z' })
    ).toBe(false)
  })
})
