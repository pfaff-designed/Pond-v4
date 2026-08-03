// Tests the seed trigger logic extracted from Sidebar — seed fires only when
// areas are empty after loading, and only once.

function shouldSeed(isLoading: boolean, areasLength: number, alreadySeeded: boolean): boolean {
  if (isLoading || areasLength > 0 || alreadySeeded) return false
  return true
}

describe('sidebar seed logic', () => {
  it('does not seed while loading', () => {
    expect(shouldSeed(true, 0, false)).toBe(false)
  })

  it('does not seed when areas already exist', () => {
    expect(shouldSeed(false, 3, false)).toBe(false)
  })

  it('does not seed if already seeded this session', () => {
    expect(shouldSeed(false, 0, true)).toBe(false)
  })

  it('seeds when loaded, areas empty, and not yet seeded', () => {
    expect(shouldSeed(false, 0, false)).toBe(true)
  })

  it('does not seed again after first seed (idempotent guard)', () => {
    // First call triggers seed
    expect(shouldSeed(false, 0, false)).toBe(true)
    // After seededRef.current = true, subsequent calls return false
    expect(shouldSeed(false, 0, true)).toBe(false)
  })
})
