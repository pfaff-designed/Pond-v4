import { initHistory, recordVisit, stepBack, stepForward } from './session-history'

describe('session-history', () => {
  it('first visit seeds a one-entry stack on the current id', () => {
    expect(initHistory('a')).toEqual({ entries: ['a'], cursor: 0 })
  })

  it('a plain forward visit appends and moves the cursor to it', () => {
    const h1 = initHistory('a')
    const h2 = recordVisit(h1, 'b')
    expect(h2).toEqual({ entries: ['a', 'b'], cursor: 1 })
  })

  it('re-recording the same id is a no-op', () => {
    const h1 = initHistory('a')
    const h2 = recordVisit(h1, 'a')
    expect(h2).toEqual(h1)
  })

  it('stepping back then recording a NEW visit drops the forward entries', () => {
    const h1 = recordVisit(recordVisit(initHistory('a'), 'b'), 'c') // a, b, c @ 2
    const back = stepBack(h1)
    expect(back).not.toBeNull()
    const h2 = recordVisit(back!.state, 'd') // was a, b, c @ 1 (b); 'c' drops
    expect(h2).toEqual({ entries: ['a', 'b', 'd'], cursor: 2 })
  })

  it('stepBack at the start boundary returns null and leaves the state alone', () => {
    const h1 = initHistory('a')
    expect(stepBack(h1)).toBeNull()
  })

  it('stepForward at the end boundary returns null and leaves the state alone', () => {
    const h1 = recordVisit(initHistory('a'), 'b')
    expect(stepForward(h1)).toBeNull()
  })

  it('stepBack then stepForward returns to the same entry and cursor', () => {
    const h1 = recordVisit(initHistory('a'), 'b') // a, b @ 1
    const back = stepBack(h1)
    expect(back).toEqual({ state: { entries: ['a', 'b'], cursor: 0 }, id: 'a' })
    const forward = stepForward(back!.state)
    expect(forward).toEqual({ state: { entries: ['a', 'b'], cursor: 1 }, id: 'b' })
  })
})
