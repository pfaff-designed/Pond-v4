/**
 * #58 — content-column width helpers. The editor column's width is user-set
 * (drag or keyboard on the ContentWidthHandle), clamped to a sane band, and
 * persisted to localStorage so it survives reload. These are the pure pieces:
 * the clamp and the throw-tolerant read/write (localStorage can throw in
 * privacy modes/quota — degrade to the default, never crash, matching the
 * AITerminal persisted-state helpers).
 */
import {
  CONTENT_WIDTH_KEY,
  CONTENT_MIN_WIDTH,
  CONTENT_MAX_WIDTH,
  CONTENT_DEFAULT_WIDTH,
  clampContentWidth,
  readStoredContentWidth,
  storeContentWidth,
} from '@/lib/layout/content-width'

beforeEach(() => {
  window.localStorage.clear()
})

describe('clampContentWidth', () => {
  it('passes an in-band width through untouched', () => {
    expect(clampContentWidth(800)).toBe(800)
  })

  it('clamps below the floor and above the ceiling', () => {
    expect(clampContentWidth(CONTENT_MIN_WIDTH - 100)).toBe(CONTENT_MIN_WIDTH)
    expect(clampContentWidth(CONTENT_MAX_WIDTH + 100)).toBe(CONTENT_MAX_WIDTH)
  })

  it('keeps the default inside the band (a fresh install is never clamped)', () => {
    expect(clampContentWidth(CONTENT_DEFAULT_WIDTH)).toBe(CONTENT_DEFAULT_WIDTH)
  })
})

describe('readStoredContentWidth', () => {
  it('returns the default when nothing is stored', () => {
    expect(readStoredContentWidth()).toBe(CONTENT_DEFAULT_WIDTH)
  })

  it('returns a stored in-band width', () => {
    window.localStorage.setItem(CONTENT_WIDTH_KEY, '900')
    expect(readStoredContentWidth()).toBe(900)
  })

  it('clamps a stored out-of-band width (stale or hand-edited value)', () => {
    window.localStorage.setItem(CONTENT_WIDTH_KEY, '5000')
    expect(readStoredContentWidth()).toBe(CONTENT_MAX_WIDTH)
    window.localStorage.setItem(CONTENT_WIDTH_KEY, '10')
    expect(readStoredContentWidth()).toBe(CONTENT_MIN_WIDTH)
  })

  it('returns the default on a garbage value', () => {
    window.localStorage.setItem(CONTENT_WIDTH_KEY, 'not-a-number')
    expect(readStoredContentWidth()).toBe(CONTENT_DEFAULT_WIDTH)
  })

  it('returns the default when localStorage throws (privacy mode)', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readStoredContentWidth()).toBe(CONTENT_DEFAULT_WIDTH)
    spy.mockRestore()
  })
})

describe('storeContentWidth', () => {
  it('writes the width under the pond: key', () => {
    storeContentWidth(840)
    expect(window.localStorage.getItem(CONTENT_WIDTH_KEY)).toBe('840')
  })

  it('swallows a throwing localStorage (quota) instead of crashing', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => storeContentWidth(840)).not.toThrow()
    spy.mockRestore()
  })
})
