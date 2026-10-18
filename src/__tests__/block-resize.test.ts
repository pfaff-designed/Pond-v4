/**
 * `snapPercent` (KAN-441) — Photoshop-guide-style snapping with hysteresis:
 * locks within 8px of a key width's position, releases 8px further (16px
 * from the lock).
 */
import { KEY_WIDTHS, snapPercent } from '@/lib/modules/block-resize'

// At this column width, 1% of the column is exactly 8px, so every test below
// can be written in whole percent points instead of fiddly px/percent math.
const COLUMN_PX = 800

const KEY_PERCENTS = KEY_WIDTHS.map((k) => k.percent)

describe('KEY_WIDTHS', () => {
  it('matches the six named widths in column order', () => {
    expect(KEY_WIDTHS.map((k) => k.percent)).toEqual([25, 33.3, 50, 66.7, 75, 100])
  })
})

describe('snapPercent at rest (unlocked, far from every key)', () => {
  it.each<[number]>([[0], [10], [41.65], [87.5]])(
    'rawPercent %s tracks freely',
    (rawPercent) => {
      expect(snapPercent(rawPercent, COLUMN_PX, null)).toEqual({ percent: rawPercent, locked: false })
    }
  )
})

describe('snapPercent approaching each key width (unlocked)', () => {
  it.each(KEY_PERCENTS)('locks onto %s from just below and just above', (key) => {
    // Just inside the 8px (1%) lock zone on both sides.
    expect(snapPercent(key - 1, COLUMN_PX, null)).toEqual({ percent: key, locked: true })
    expect(snapPercent(key + 1, COLUMN_PX, null)).toEqual({ percent: key, locked: true })
    // Exactly at the key.
    expect(snapPercent(key, COLUMN_PX, null)).toEqual({ percent: key, locked: true })
  })

  it.each(KEY_PERCENTS)('stays free just outside %s on both sides', (key) => {
    // Just past the 1% lock zone on both sides — except full (100%), whose
    // upper side has no neighbour to confuse it with, so both directions
    // behave the same; skip the redundant check there.
    expect(snapPercent(key - 1.1, COLUMN_PX, null)).toEqual({ percent: key - 1.1, locked: false })
    if (key === 100) return
    expect(snapPercent(key + 1.1, COLUMN_PX, null)).toEqual({ percent: key + 1.1, locked: false })
  })
})

describe('snapPercent holding inside the lock zone (already locked)', () => {
  it.each(KEY_PERCENTS)('%s stays locked within 16px (2%) of the lock', (key) => {
    expect(snapPercent(key, COLUMN_PX, key)).toEqual({ percent: key, locked: true })
    expect(snapPercent(key + 1, COLUMN_PX, key)).toEqual({ percent: key, locked: true })
    expect(snapPercent(key - 1, COLUMN_PX, key)).toEqual({ percent: key, locked: true })
    expect(snapPercent(key + 2, COLUMN_PX, key)).toEqual({ percent: key, locked: true })
    expect(snapPercent(key - 2, COLUMN_PX, key)).toEqual({ percent: key, locked: true })
  })
})

describe('snapPercent breaking out past the lock zone', () => {
  it.each(KEY_PERCENTS)('%s releases past 16px (2%) and tracks the raw percent freely', (key) => {
    expect(snapPercent(key + 2.1, COLUMN_PX, key)).toEqual({ percent: key + 2.1, locked: false })
    expect(snapPercent(key - 2.1, COLUMN_PX, key)).toEqual({ percent: key - 2.1, locked: false })
  })

  it('a free percent well past full keeps tracking (clamping is resizeAlone\'s job, not this one\'s)', () => {
    expect(snapPercent(105, COLUMN_PX, 100)).toEqual({ percent: 105, locked: false })
  })
})

describe('snapPercent on a column too narrow for the lock zones to stay separate', () => {
  // At 40px, 8px is 20% of the column — wider than the 8.3-point gap between
  // ¼ and ⅓, so every raw percent in between falls inside more than one
  // key's lock zone at once. The nearer key still wins deterministically.
  const NARROW_COLUMN_PX = 40

  it.each<[number, number]>([
    [27, 25], // closer to ¼ (2pt away) than ⅓ (6.3pt away)
    [30, 33.3], // closer to ⅓ (3.3pt away) than ¼ (5pt away)
    [40, 33.3], // between ⅓ and ½, closer to ⅓
    [45, 50], // between ⅓ and ½, closer to ½
  ])('rawPercent %s locks onto %s', (rawPercent, expectedKey) => {
    expect(snapPercent(rawPercent, NARROW_COLUMN_PX, null)).toEqual({ percent: expectedKey, locked: true })
  })
})
