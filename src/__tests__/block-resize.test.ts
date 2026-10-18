/**
 * `snapPercent` (KAN-441) — Photoshop-guide-style snapping with hysteresis:
 * locks within 8px of a key width's position, releases 8px further (16px
 * from the lock).
 */
import { handOffRowStartOnResize, KEY_WIDTHS, resizeAlone, snapPercent } from '@/lib/modules/block-resize'
import { MIN_BLOCK_WIDTH_PX } from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'

interface TestBlock {
  id: string
  width?: BlockWidth | number
  rowStart?: boolean
}

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

describe('resizeAlone', () => {
  // MIN_BLOCK_WIDTH_PX (240px) is 30% of COLUMN_PX (800px) — a clamp floor
  // that lands clear of every key width, so a clamped result never reads as
  // coincidentally locked.
  const MIN_PERCENT = (MIN_BLOCK_WIDTH_PX / COLUMN_PX) * 100

  it.each<[string, number, number, number | null, { percent: number; locked: boolean }]>([
    ['drags right from 50% to a free 60%, unlocked', 50, 80, null, { percent: 60, locked: false }],
    ['drags left from 60% into the ½ lock zone', 60, -72, null, { percent: 50, locked: true }],
    ['locks onto ¾ dragging right from 70%', 70, 40, null, { percent: 75, locked: true }],
    ['holds the ½ lock within the 16px release zone', 50, 8, 50, { percent: 50, locked: true }],
    [
      'breaks out of the ½ lock past 16px and tracks freely',
      50,
      24,
      50,
      { percent: 53, locked: false },
    ],
    [
      'clamps at the floor dragging far left, unlocked',
      50,
      -500,
      null,
      { percent: MIN_PERCENT, locked: false },
    ],
    [
      'clamps at the ceiling dragging far right, unlocked',
      50,
      500,
      null,
      { percent: 100, locked: false },
    ],
    [
      'snap-then-break-out composed with the floor clamp: releasing a ⅓ lock far past the minimum clamps, unlocked',
      33.3,
      -200,
      33.3,
      { percent: MIN_PERCENT, locked: false },
    ],
    [
      'snap-then-break-out composed with the ceiling clamp: releasing a ¾ lock far past full clamps, unlocked',
      75,
      500,
      75,
      { percent: 100, locked: false },
    ],
  ])('%s', (_description, startPercent, deltaPx, lockedPercent, expected) => {
    expect(resizeAlone(COLUMN_PX, startPercent, deltaPx, lockedPercent)).toEqual(expected)
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

describe('handOffRowStartOnResize', () => {
  it('shrink-opens-room: a shrink that newly fits the next block hands it rowStart', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '3/4' }, { id: 'b', width: '1/3' }]
    // 75 + 33.3 = 108.3 > 100 before the shrink; 50 + 33.3 = 83.3 <= 100 after.
    expect(handOffRowStartOnResize(blocks, 0, 50)).toEqual([
      { id: 'a', width: 50 },
      { id: 'b', width: '1/3', rowStart: true },
    ])
  })

  it('shrink-no-room: a shrink that still overflows the row hands off nothing', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '3/4' }, { id: 'b', width: 'full' }]
    // 75 + 100 = 175 before; 74 + 100 = 174 after — still well over 100.
    expect(handOffRowStartOnResize(blocks, 0, 74)).toEqual([
      { id: 'a', width: 74 },
      { id: 'b', width: 'full' },
    ])
  })

  it('grow: never hands off rowStart, even if the grow would overflow the row', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '1/4' }, { id: 'b', width: '3/4' }]
    // 25 -> 50 is a grow; 50 + 75 = 125 would overflow, but growing is never a handoff.
    expect(handOffRowStartOnResize(blocks, 0, 50)).toEqual([
      { id: 'a', width: 50 },
      { id: 'b', width: '3/4' },
    ])
  })

  it('already rowStart: a next block that already carries rowStart is left alone', () => {
    const blocks: TestBlock[] = [
      { id: 'a', width: '3/4' },
      { id: 'b', width: '1/4', rowStart: true },
    ]
    // 50 + 25 = 75 would newly fit, but b already starts its own row.
    expect(handOffRowStartOnResize(blocks, 0, 50)).toEqual([
      { id: 'a', width: 50 },
      { id: 'b', width: '1/4', rowStart: true },
    ])
  })

  it('last-block-in-list: no next block means nothing to hand off', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '3/4' }]
    expect(handOffRowStartOnResize(blocks, 0, 50)).toEqual([{ id: 'a', width: 50 }])
  })
})
