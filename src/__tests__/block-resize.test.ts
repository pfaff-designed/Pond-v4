/**
 * `snapPercent` (KAN-441) — Photoshop-guide-style snapping with hysteresis:
 * locks within 8px of a key width's position, releases 8px further (16px
 * from the lock).
 */
import {
  handOffRowStartOnResize,
  KEY_WIDTHS,
  resizeAlone,
  roundFreePercent,
  snapPercent,
} from '@/lib/modules/block-resize'
import {
  MIN_BLOCK_WIDTH_PX,
  percentToRenderedPx,
  renderedPxToPercent,
  rowHolds,
} from '@/lib/modules/layout-rows'
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
  // The clamp floor is the percent whose *rendered* width (`percentToRenderedPx`'s
  // formula, which includes the `BLOCK_ROW_GAP_PX` term) is MIN_BLOCK_WIDTH_PX —
  // not the naive `MIN_BLOCK_WIDTH_PX / COLUMN_PX`, which lands short of it.
  const MIN_PERCENT = renderedPxToPercent(COLUMN_PX, MIN_BLOCK_WIDTH_PX)

  // `deltaPx` is a real pointer-move distance in rendered px, so a case that
  // needs to land exactly on a percent computes its delta off the renderer's
  // own formula (`percentToRenderedPx`) rather than a plain percent*column
  // scaling, which no longer matches what `resizeAlone` itself does.
  const renderedDelta = (fromPercent: number, toPercent: number) =>
    percentToRenderedPx(COLUMN_PX, toPercent) - percentToRenderedPx(COLUMN_PX, fromPercent)

  it.each<[string, number, number, number | null, { percent: number; locked: boolean }]>([
    [
      'drags right from 50% to a free 60%, unlocked',
      50,
      renderedDelta(50, 60),
      null,
      { percent: 60, locked: false },
    ],
    [
      'drags left from 60% into the ½ lock zone',
      60,
      renderedDelta(60, 51),
      null,
      { percent: 50, locked: true },
    ],
    [
      'locks onto ¾ dragging right from 70%',
      70,
      renderedDelta(70, 75),
      null,
      { percent: 75, locked: true },
    ],
    ['holds the ½ lock within the 16px release zone', 50, 8, 50, { percent: 50, locked: true }],
    [
      'breaks out of the ½ lock past 16px and tracks freely',
      50,
      renderedDelta(50, 53),
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
    const result = resizeAlone(COLUMN_PX, startPercent, deltaPx, lockedPercent)
    expect(result.locked).toBe(expected.locked)
    // 4 decimal places: precise enough to catch a real regression, loose
    // enough to absorb the clamp floor's own deliberate FLOOR_EPSILON_PERCENT
    // nudge (1e-6) and the float round-trip through percentToRenderedPx/
    // renderedPxToPercent above.
    expect(result.percent).toBeCloseTo(expected.percent, 4)
  })

  // The clamp floor itself must render at least MIN_BLOCK_WIDTH_PX — the bug
  // this item fixes: a naive `MIN_BLOCK_WIDTH_PX / columnPx` clamp floor
  // rendered a few px *under* MIN_BLOCK_WIDTH_PX (the `BLOCK_ROW_GAP_PX` term
  // the renderer applies but the old clamp math didn't), so `rowHolds` would
  // stack a block that was just dragged to the clamp, flipping it to 100%
  // wide on release — the opposite of the drag.
  it.each([700, 1000])('the clamp floor at a %dpx column renders >= MIN_BLOCK_WIDTH_PX (rowHolds)', (columnPx) => {
    const { percent } = resizeAlone(columnPx, 50, -1_000_000, null)
    expect(rowHolds(columnPx, [percent])).toBe(true)
  })
})

describe('roundFreePercent (the one-decimal commit never renders under the floor)', () => {
  // The bug this item fixes: `Math.round(percent * 10) / 10`, applied to the
  // *unrounded* clamp floor, rounds DOWN at roughly half of all column
  // widths — e.g. at 900px the floor is 27.9476...%, which rounds to 27.9,
  // renders 239.56px, and `rowHolds` then stacks the row, flipping the block
  // to 100% wide on release (the opposite of the drag). Every integer column
  // width in 241..2000 is exercised, not a sample, since which half rounds
  // down depends on each column's own fraction, not on the column's size.
  const committedAtFloor = (columnPx: number): number => {
    const { percent } = resizeAlone(columnPx, 50, -1_000_000, null)
    return roundFreePercent(percent, columnPx)
  }

  it.each(Array.from({ length: 2000 - 241 + 1 }, (_, i) => i + 241))(
    'the committed floor at a %dpx column still satisfies rowHolds',
    (columnPx) => {
      expect(rowHolds(columnPx, [committedAtFloor(columnPx)])).toBe(true)
    }
  )
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

  it('self-handoff: shrinking the resized block itself into room above its own line hands IT rowStart', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '1/2' }, { id: 'b', width: 'full' }]
    // 50 + 100 = 150 > 100 before (b is alone on its own line); 50 + 46 = 96 <= 100 after.
    expect(handOffRowStartOnResize(blocks, 1, 46)).toEqual([
      { id: 'a', width: '1/2' },
      { id: 'b', width: 46, rowStart: true },
    ])
  })

  it('self-handoff: the same, snapped to a named width instead of a free one', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '1/2' }, { id: 'b', width: 'full' }]
    // 50 + 50 = 100 <= 100 after — b would newly pack beside a.
    expect(handOffRowStartOnResize(blocks, 1, '1/2')).toEqual([
      { id: 'a', width: '1/2' },
      { id: 'b', width: '1/2', rowStart: true },
    ])
  })

  it('self-handoff: a resized block that already carries rowStart is left alone', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: '1/2' }, { id: 'b', width: 'full', rowStart: true }]
    expect(handOffRowStartOnResize(blocks, 1, 46)).toEqual([
      { id: 'a', width: '1/2' },
      { id: 'b', width: 46, rowStart: true },
    ])
  })

  it('self-handoff: no handoff when the previous row is already full', () => {
    const blocks: TestBlock[] = [{ id: 'a', width: 'full' }, { id: 'b', width: 'full' }]
    // a alone already fills its row at 100 — no shrink of b can ever fit beside it.
    expect(handOffRowStartOnResize(blocks, 1, 10)).toEqual([
      { id: 'a', width: 'full' },
      { id: 'b', width: 10 },
    ])
  })

  it('both handoffs at once: a middle block that newly packs beside both its neighbours hands rowStart to itself AND the next block', () => {
    const blocks: TestBlock[] = [
      { id: 'a', width: '1/2' },
      { id: 'b', width: 'full' },
      { id: 'c', width: '1/4' },
    ]
    // Before: a alone (50), b alone (100), c alone (25) — none fit together.
    // After b shrinks to 20: a+b = 70 <= 100 (b newly joins a's row), and
    // a+b+c = 95 <= 100 (c would also newly join) — both need protecting.
    expect(handOffRowStartOnResize(blocks, 1, 20)).toEqual([
      { id: 'a', width: '1/2' },
      { id: 'b', width: 20, rowStart: true },
      { id: 'c', width: '1/4', rowStart: true },
    ])
  })

  it("self-handoff cascades to next: c only newly fits beside b once b's own self-handoff gives it a fresh row", () => {
    const blocks: TestBlock[] = [
      { id: 'a', width: '1/2' },
      { id: 'b', width: 'full' },
      { id: 'c', width: '1/2' },
    ]
    // Before: a alone (50), b alone (100), c alone (50) — none fit together.
    // After b shrinks to '1/2' (50): a+b = 100 <= 100 (b newly joins a's row),
    // but a+b+c = 150 > 100 — c does NOT newly fit next to a AND b in one row.
    // Once b's own handoff gives it rowStart (starting a fresh row at b),
    // b+c = 100 <= 100 in THAT row — c must get rowStart too, or it packs
    // in beside b on release.
    expect(handOffRowStartOnResize(blocks, 1, '1/2')).toEqual([
      { id: 'a', width: '1/2' },
      { id: 'b', width: '1/2', rowStart: true },
      { id: 'c', width: '1/2', rowStart: true },
    ])
  })

  it('self-handoff cascades to next: the same shape with a free width instead of a named one', () => {
    const blocks: TestBlock[] = [
      { id: 'a', width: '1/2' },
      { id: 'b', width: 'full' },
      { id: 'c', width: 40 },
    ]
    // After b shrinks to 46: a+b = 96 <= 100 (b newly joins a's row), but
    // a+b+c = 136 > 100. Once b gets its own rowStart, b+c = 86 <= 100 in
    // b's fresh row — c must get rowStart too.
    expect(handOffRowStartOnResize(blocks, 1, 46)).toEqual([
      { id: 'a', width: '1/2' },
      { id: 'b', width: 46, rowStart: true },
      { id: 'c', width: 40, rowStart: true },
    ])
  })
})
