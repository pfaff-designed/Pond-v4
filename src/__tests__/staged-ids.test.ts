// Staged-deletion id registry (KAN-300). jsdom provides a real sessionStorage,
// so "fresh page load" is simulated with jest.resetModules() + re-import,
// which re-runs the module's lazy hydrate against the same sessionStorage.

describe('staged-ids', () => {
  beforeEach(() => {
    sessionStorage.clear()
    jest.resetModules()
  })

  it('stage -> isStaged -> unstage', async () => {
    const { stageId, isStaged, unstageId, stagedIds } = await import('@/lib/deletion/staged-ids')

    expect(isStaged('page-1')).toBe(false)

    stageId('page-1')
    expect(isStaged('page-1')).toBe(true)
    expect(stagedIds()).toEqual(['page-1'])

    unstageId('page-1')
    expect(isStaged('page-1')).toBe(false)
    expect(stagedIds()).toEqual([])
  })

  it('persists across a fresh page load', async () => {
    const first = await import('@/lib/deletion/staged-ids')
    first.stageId('page-1')
    first.stageId('page-2')
    first.unstageId('page-2')

    jest.resetModules()
    const second = await import('@/lib/deletion/staged-ids')

    expect(second.isStaged('page-1')).toBe(true)
    expect(second.isStaged('page-2')).toBe(false)
    expect(second.stagedIds()).toEqual(['page-1'])
  })

  it('storage unavailable does not crash any call', async () => {
    const { stageId, isStaged, unstageId, stagedIds } = await import('@/lib/deletion/staged-ids')

    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => stageId('page-1')).not.toThrow()
    expect(isStaged('page-1')).toBe(true)
    expect(() => unstageId('page-1')).not.toThrow()
    expect(() => stagedIds()).not.toThrow()

    setItem.mockRestore()
  })

  it('storage read failure does not crash hydrate', async () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    const { isStaged, stageId } = await import('@/lib/deletion/staged-ids')
    expect(() => isStaged('page-1')).not.toThrow()
    expect(() => stageId('page-1')).not.toThrow()

    getItem.mockRestore()
  })

  it('priorLifeIds only counts ids present at this script\'s first hydrate, not ids staged afterward', async () => {
    sessionStorage.setItem('pond:pending-deletes', JSON.stringify(['leftover-1']))
    const { stageId, unstageId, priorLifeIds } = await import('@/lib/deletion/staged-ids')

    // 'fresh-1' is staged during this same script execution — never a prior life.
    stageId('fresh-1')
    expect(priorLifeIds()).toEqual(['leftover-1'])

    // Once committed, a prior-life id drops out of its own snapshot.
    unstageId('leftover-1')
    expect(priorLifeIds()).toEqual([])
  })
})
