import { clearPendingReorder, rememberReorder, takePendingReorder } from './favourites-undo'

const POND_A = 'pond-a'
const POND_B = 'pond-b'

describe('favourites-undo', () => {
  afterEach(() => {
    clearPendingReorder(POND_A)
    clearPendingReorder(POND_B)
  })

  it('no entry → takePendingReorder returns null', () => {
    expect(takePendingReorder(POND_A)).toBeNull()
  })

  it('rememberReorder then takePendingReorder → returns the stashed order', () => {
    rememberReorder(POND_A, ['a', 'b', 'c'])

    expect(takePendingReorder(POND_A)).toEqual(['a', 'b', 'c'])
  })

  it('takePendingReorder consumes the slot — a second take returns null', () => {
    rememberReorder(POND_A, ['a', 'b'])

    takePendingReorder(POND_A)

    expect(takePendingReorder(POND_A)).toBeNull()
  })

  it('slots are per-pond — remembering for one pond does not affect another', () => {
    rememberReorder(POND_A, ['a', 'b'])

    expect(takePendingReorder(POND_B)).toBeNull()
    expect(takePendingReorder(POND_A)).toEqual(['a', 'b'])
  })

  it('clearPendingReorder discards the slot without returning it', () => {
    rememberReorder(POND_A, ['a', 'b'])

    clearPendingReorder(POND_A)

    expect(takePendingReorder(POND_A)).toBeNull()
  })

  it('clearPendingReorder on an empty slot is a no-op', () => {
    expect(() => clearPendingReorder(POND_A)).not.toThrow()
  })

  it('rememberReorder overwrites a prior stash for the same pond', () => {
    rememberReorder(POND_A, ['a', 'b'])
    rememberReorder(POND_A, ['c', 'd'])

    expect(takePendingReorder(POND_A)).toEqual(['c', 'd'])
  })
})
