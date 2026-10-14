/**
 * The session's "just saved" template — src/lib/templates/just-saved.ts.
 *
 * Per pond, in memory: set/get, isolated per pond, cleared once applied, and
 * emptied on pagehide.
 */

import { clearOnPageHide, createJustSaved } from '@/lib/templates/just-saved'

const POND = 'pond-1'
const OTHER_POND = 'pond-2'

describe('createJustSaved', () => {
  it('reads nothing before anything is saved', () => {
    const store = createJustSaved()

    expect(store.get(POND)).toBeNull()
  })

  it('returns what was just set', () => {
    const store = createJustSaved()

    store.set(POND, 'template-1')

    expect(store.get(POND)).toBe('template-1')
  })

  it('keeps each pond isolated', () => {
    const store = createJustSaved()

    store.set(POND, 'template-1')

    expect(store.get(OTHER_POND)).toBeNull()

    store.set(OTHER_POND, 'template-2')

    expect(store.get(POND)).toBe('template-1')
    expect(store.get(OTHER_POND)).toBe('template-2')
  })

  it('clears it once applied', () => {
    const store = createJustSaved()
    store.set(POND, 'template-1')

    store.clear(POND, 'template-1')

    expect(store.get(POND)).toBeNull()
  })

  it('does not clear a different template than the one held', () => {
    const store = createJustSaved()
    store.set(POND, 'template-1')

    store.clear(POND, 'template-2')

    expect(store.get(POND)).toBe('template-1')
  })

  it('a later save replaces the earlier one', () => {
    const store = createJustSaved()
    store.set(POND, 'template-1')
    store.set(POND, 'template-2')

    expect(store.get(POND)).toBe('template-2')
  })
})

describe('clearOnPageHide', () => {
  it('empties every pond when the tab or app goes away', () => {
    const store = createJustSaved()
    store.set(POND, 'template-1')
    store.set(OTHER_POND, 'template-2')
    const stop = clearOnPageHide(window, store)

    window.dispatchEvent(new Event('pagehide'))

    expect(store.get(POND)).toBeNull()
    expect(store.get(OTHER_POND)).toBeNull()
    stop()
  })

  it('stops listening once released', () => {
    const store = createJustSaved()
    const stop = clearOnPageHide(window, store)
    stop()
    store.set(POND, 'template-1')

    window.dispatchEvent(new Event('pagehide'))

    expect(store.get(POND)).toBe('template-1')
  })
})
