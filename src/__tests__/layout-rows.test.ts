/**
 * `layoutRows` (6x) — packs consecutive blocks into a row while their widths add up
 * to full or less, in array order.
 */
import {
  BLOCK_ROW_GAP_PX,
  blockWidthStyle,
  classifyDropZone,
  detachKeepingRows,
  isWithinPaddedZone,
  layoutRows,
  planBesideDrop,
  rowHolds,
  widthPercent,
  widthsForDropBeside,
  withoutRowStart,
} from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'
import type { DropZone, Point, Rect } from '@/lib/modules/layout-rows'

function blocks(...widths: (BlockWidth | undefined)[]): { id: string; width?: BlockWidth }[] {
  return widths.map((width, i) => ({ id: `b${i}`, width }))
}

describe('layoutRows', () => {
  it('packs ½ + ½ into one row', () => {
    const [a, b] = blocks('1/2', '1/2')
    expect(layoutRows([a, b])).toEqual([[a, b]])
  })

  it('packs ⅓ × 3 into one row', () => {
    const [a, b, c] = blocks('1/3', '1/3', '1/3')
    expect(layoutRows([a, b, c])).toEqual([[a, b, c]])
  })

  it('packs ⅓ + ½ into one row with a sixth left over', () => {
    const [a, b] = blocks('1/3', '1/2')
    expect(layoutRows([a, b])).toEqual([[a, b]])
  })

  it('splits ¾ + ½ into two rows', () => {
    const [a, b] = blocks('3/4', '1/2')
    expect(layoutRows([a, b])).toEqual([[a], [b]])
  })

  it('gives every full block its own row', () => {
    const [a, b, c] = blocks('full', undefined, 'full')
    expect(layoutRows([a, b, c])).toEqual([[a], [b], [c]])
  })

  // Comment-2's three before-states (KAN-440): absent `rowStart`, packing is
  // unchanged from today — the greedy, width-only algorithm this ticket must not
  // regress.
  describe('absent rowStart (KAN-440 Comment 2, unchanged from today)', () => {
    it('A left behind at ½ beside three full blocks: every block alone', () => {
      const [a, b, c, d] = blocks('1/2', 'full', 'full', 'full')
      expect(layoutRows([a, b, c, d])).toEqual([[a], [b], [c], [d]])
    })

    it('A + B left behind at ¼ each beside two full blocks: A and B share a row', () => {
      const [a, b, c, d] = blocks('1/4', '1/4', 'full', 'full')
      expect(layoutRows([a, b, c, d])).toEqual([[a, b], [c], [d]])
    })

    it('all full: every block alone', () => {
      const [a, b, c, d] = blocks('full', 'full', 'full', 'full')
      expect(layoutRows([a, b, c, d])).toEqual([[a], [b], [c], [d]])
    })
  })

  // A row marked `rowStart: true` always starts fresh, even when the running
  // row still has room for it by width alone — the mechanism `planBesideDrop`
  // (next item) relies on to stop a partial-width block repacking the rows after it.
  describe('rowStart forces a fresh row regardless of leftover room', () => {
    it('two ½ blocks would merge into one row without rowStart, but split with it', () => {
      const a = { id: 'a', width: '1/2' as BlockWidth }
      const b = { id: 'b', width: '1/2' as BlockWidth, rowStart: true }
      expect(layoutRows([a, b])).toEqual([[a], [b]])
    })

    it('¼ + ¼ + ½ would all fit in one row (12 twelfths exactly), but rowStart splits off the ½', () => {
      const a = { id: 'a', width: '1/4' as BlockWidth }
      const b = { id: 'b', width: '1/4' as BlockWidth }
      const c = { id: 'c', width: '1/2' as BlockWidth, rowStart: true }
      expect(layoutRows([a, b, c])).toEqual([
        [a, b],
        [c],
      ])
    })

    it('rowStart on the very first block is a no-op: there is no prior row to close', () => {
      const a = { id: 'a', width: '1/2' as BlockWidth, rowStart: true }
      const b = { id: 'b', width: '1/2' as BlockWidth }
      expect(layoutRows([a, b])).toEqual([[a, b]])
    })
  })

  // A free numeric width (KAN-441, set by dragging a block's edge) packs and
  // overflows by its own percent, alongside named widths in the same row.
  describe('a free numeric width packs by percent, not twelfths (KAN-441)', () => {
    it('packs 40% beside a named ½ — the 90% sum leaves room', () => {
      const a = { id: 'a', width: 40 }
      const b = { id: 'b', width: '1/2' as BlockWidth }
      expect(layoutRows([a, b])).toEqual([[a, b]])
    })

    it('starts a new row when the numeric width would push the sum past 100%', () => {
      const a = { id: 'a', width: 60 }
      const b = { id: 'b', width: '1/2' as BlockWidth }
      expect(layoutRows([a, b])).toEqual([[a], [b]])
    })

    it('packs two numeric widths that sum to exactly 100%', () => {
      const a = { id: 'a', width: 46 }
      const b = { id: 'b', width: 54 }
      expect(layoutRows([a, b])).toEqual([[a, b]])
    })

    it('three numeric widths that sum to just over 100% split off the last', () => {
      const a = { id: 'a', width: 40 }
      const b = { id: 'b', width: 40 }
      const c = { id: 'c', width: 20.1 }
      expect(layoutRows([a, b, c])).toEqual([[a, b], [c]])
    })
  })
})

describe('widthPercent', () => {
  it.each<[BlockWidth | number | undefined, number]>([
    ['1/4', 25],
    ['1/3', 33.3],
    ['1/2', 50],
    ['2/3', 66.7],
    ['3/4', 75],
    ['full', 100],
    [undefined, 100],
    [46, 46],
    [1, 1],
    [100, 100],
  ])('widthPercent(%s) is %s', (width, expected) => {
    expect(widthPercent(width)).toBe(expected)
  })
})

// Taking a block out of its row — a beside drop, an own-line drop, a
// delete, or ⌥↑/⌥↓ — must hand `rowStart` to the row-mate it leaves behind,
// or that row-mate silently re-packs into the row before it (KAN-440).
describe('detachKeepingRows', () => {
  it('removing a block that is not the rowStart holder leaves every other block untouched', () => {
    const a = { id: 'a', width: '1/4' as BlockWidth, rowStart: true }
    const x = { id: 'x', width: '1/4' as BlockWidth }
    const y = { id: 'y', width: '1/4' as BlockWidth }
    const z = { id: 'z', width: 'full' as BlockWidth }
    expect(detachKeepingRows([a, x, y, z], 1)).toEqual({
      blocks: [a, y, z],
      handedRowStartTo: null,
    })
  })

  it('removing the rowStart holder hands rowStart to the row-mate left behind', () => {
    const a = { id: 'a', width: '1/2' as BlockWidth, rowStart: true }
    const x = { id: 'x', width: '1/2' as BlockWidth, rowStart: true }
    const y = { id: 'y', width: '1/2' as BlockWidth }
    expect(detachKeepingRows([a, x, y], 1)).toEqual({
      blocks: [a, { id: 'y', width: '1/2', rowStart: true }],
      handedRowStartTo: 'y',
    })
  })

  it('removing the rowStart holder that is alone in its row hands off nothing — the next block starts its own row already', () => {
    const a = { id: 'a', width: 'full' as BlockWidth, rowStart: true }
    const x = { id: 'x', width: 'full' as BlockWidth, rowStart: true }
    const y = { id: 'y', width: 'full' as BlockWidth, rowStart: true }
    expect(detachKeepingRows([a, x, y], 1)).toEqual({ blocks: [a, y], handedRowStartTo: null })
  })

  it('removing the rowStart holder with no next block at all hands off nothing', () => {
    const a = { id: 'a', width: '1/2' as BlockWidth, rowStart: true }
    const x = { id: 'x', width: '1/2' as BlockWidth, rowStart: true }
    expect(detachKeepingRows([a, x], 1)).toEqual({ blocks: [a], handedRowStartTo: null })
  })

  it('removing the very first block hands its (implicit) rowStart to the row-mate it leaves behind', () => {
    const a = { id: 'a', width: '1/2' as BlockWidth, rowStart: true }
    const b = { id: 'b', width: '1/2' as BlockWidth }
    expect(detachKeepingRows([a, b], 0)).toEqual({
      blocks: [{ id: 'b', width: '1/2', rowStart: true }],
      handedRowStartTo: 'b',
    })
  })

  it('removing a block with no rowStart at all is a plain filter', () => {
    const a = { id: 'a', width: 'full' as BlockWidth }
    const b = { id: 'b', width: 'full' as BlockWidth }
    expect(detachKeepingRows([a, b], 0)).toEqual({ blocks: [b], handedRowStartTo: null })
  })
})

describe('withoutRowStart', () => {
  it('omits the key, never sets it false', () => {
    const marked = { id: 'a', rowStart: true }
    expect(withoutRowStart(marked)).toEqual({ id: 'a' })
    expect('rowStart' in withoutRowStart(marked)).toBe(false)
  })

  it('is a no-op (same reference) on a block with no rowStart', () => {
    const plain: { id: string; rowStart?: boolean } = { id: 'a' }
    expect(withoutRowStart(plain)).toBe(plain)
  })
})

describe('rowHolds', () => {
  it('holds two ½ blocks on a wide column', () => {
    expect(rowHolds(600, ['1/2', '1/2'])).toBe(true)
  })

  it('stacks two ½ blocks on a 390px phone column', () => {
    expect(rowHolds(390, ['1/2', '1/2'])).toBe(false)
  })

  it('holds a lone full block even on a narrow column', () => {
    expect(rowHolds(390, ['full'])).toBe(true)
  })

  it('holds right at the 240px boundary', () => {
    // (496 + 16) * 0.5 - 16 = 240 exactly
    expect(rowHolds(496, ['1/2', '1/2'])).toBe(true)
  })

  it('stacks one pixel short of the boundary', () => {
    // (495 + 16) * 0.5 - 16 = 239.5
    expect(rowHolds(495, ['1/2', '1/2'])).toBe(false)
  })

  it('stacks a ⅓ + ½ row when the sixth-sized block is too narrow', () => {
    expect(rowHolds(700, ['1/3', '1/2'])).toBe(false)
  })

  it('holds a numeric width exactly as it would the equal named one', () => {
    expect(rowHolds(496, [50, 50])).toBe(true)
  })

  it('stacks a numeric width below 240px the same as a named one would', () => {
    expect(rowHolds(600, [30, 70])).toBe(false)
  })
})

describe('blockWidthStyle', () => {
  it('renders a numeric width by its own percent', () => {
    const fraction = 0.46
    expect(blockWidthStyle(46)).toBe(
      `calc((100% + ${BLOCK_ROW_GAP_PX}px) * ${fraction} - ${BLOCK_ROW_GAP_PX}px)`
    )
  })

  it('renders a numeric width identically to the equal named one', () => {
    expect(blockWidthStyle(50)).toBe(blockWidthStyle('1/2'))
  })
})

describe('widthsForDropBeside', () => {
  it('drops beside a full block into the equal-share branch, not a special case', () => {
    expect(widthsForDropBeside(['full'])).toEqual(['1/2', '1/2'])
  })

  it('drops beside a lone ⅓ block, taking the room as ⅔', () => {
    expect(widthsForDropBeside(['1/3'])).toEqual(['1/3', '2/3'])
  })

  it('drops into a ⅓ + ½ row with a sixth left over (room=2, < ¼) as ⅓ × 3', () => {
    expect(widthsForDropBeside(['1/3', '1/2'])).toEqual(['1/3', '1/3', '1/3'])
  })

  it('drops into a full ½ + ½ row as ⅓ × 3 (Jira acceptance)', () => {
    expect(widthsForDropBeside(['1/2', '1/2'])).toEqual(['1/3', '1/3', '1/3'])
  })

  it('drops into a full ⅓ × 3 row as ¼ × 4', () => {
    expect(widthsForDropBeside(['1/3', '1/3', '1/3'])).toEqual(['1/4', '1/4', '1/4', '1/4'])
  })

  it('refuses a drop into a row that already holds 4', () => {
    expect(widthsForDropBeside(['1/4', '1/4', '1/4', '1/4'])).toBeNull()
  })
})

describe('planBesideDrop', () => {
  it('reads the row the same way for the dragged block as it would for the commit, when the dragged block currently sits inside it (A 1/3 / D full dragged / B 1/3): D lands at 1/3, not the pre-fix hover\'s 2/3', () => {
    const a = { id: 'a', width: '1/3' as BlockWidth }
    const d = { id: 'd', width: 'full' as BlockWidth }
    const b = { id: 'b', width: '1/3' as BlockWidth }
    const next = planBesideDrop([a, d, b], 1, 'b', 'right')
    expect(next).toEqual([
      { id: 'a', width: '1/3', rowStart: true },
      { id: 'b', width: '1/3' },
      { id: 'd', width: '1/3' },
    ])
  })

  // Pre-fix, this plan was refused: the widths it set let x (1/2) merge with a
  // (now 1/3) into one row, splitting the planned [a, b, d] row apart. `rowStart`
  // on a — the planned row's first block — now forces a's row open regardless,
  // so the same plan keeps the row together (KAN-440 Comment 2).
  it('rowStart keeps a plan together that a repack would otherwise split (X 1/2 / A 2/3, B 1/3 + D beside B)', () => {
    const x = { id: 'x', width: '1/2' as BlockWidth }
    const a = { id: 'a', width: '2/3' as BlockWidth }
    const b = { id: 'b', width: '1/3' as BlockWidth }
    const d = { id: 'd', width: 'full' as BlockWidth }
    const next = planBesideDrop([x, a, b, d], 3, 'b', 'right')
    expect(next).toEqual([
      { id: 'x', width: '1/2' },
      { id: 'a', width: '1/3', rowStart: true },
      { id: 'b', width: '1/3' },
      { id: 'd', width: '1/3' },
    ])
  })

  it('refuses a plan beside a row that already holds 4', () => {
    const quarters = ['q1', 'q2', 'q3', 'q4'].map((id) => ({ id, width: '1/4' as BlockWidth }))
    const d = { id: 'd', width: 'full' as BlockWidth }
    expect(planBesideDrop([...quarters, d], 4, 'q1', 'left')).toBeNull()
  })

  // Comment 2's three before-states: pre-fix every beside drop into these rows
  // returned null, because the planned row's widths let it merge into whatever
  // sat before it. `rowStart` on the planned row's first block stops that, so
  // every drop below now returns a plan.
  describe('Comment 2: a block left behind at a partial width no longer blocks every beside drop after it', () => {
    it('A ½ / B full / C full / D full — B beside C', () => {
      const a = { id: 'a', width: '1/2' as BlockWidth }
      const b = { id: 'b', width: 'full' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 1, 'c', 'left')
      expect(next).toEqual([
        { id: 'a', width: '1/2' },
        { id: 'b', width: '1/2', rowStart: true },
        { id: 'c', width: '1/2' },
        { id: 'd', width: 'full' },
      ])
    })

    it('A ½ / B full / C full / D full — C beside B', () => {
      const a = { id: 'a', width: '1/2' as BlockWidth }
      const b = { id: 'b', width: 'full' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 2, 'b', 'right')
      expect(next).toEqual([
        { id: 'a', width: '1/2' },
        { id: 'b', width: '1/2', rowStart: true },
        { id: 'c', width: '1/2' },
        { id: 'd', width: 'full' },
      ])
    })

    it('A ½ / B full / C full / D full — D beside B', () => {
      const a = { id: 'a', width: '1/2' as BlockWidth }
      const b = { id: 'b', width: 'full' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 3, 'b', 'right')
      expect(next).toEqual([
        { id: 'a', width: '1/2' },
        { id: 'b', width: '1/2', rowStart: true },
        { id: 'd', width: '1/2' },
        { id: 'c', width: 'full' },
      ])
    })

    it('A ¼ + B ¼ / C full / D full — A beside C', () => {
      const a = { id: 'a', width: '1/4' as BlockWidth }
      const b = { id: 'b', width: '1/4' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 0, 'c', 'left')
      expect(next).toEqual([
        { id: 'b', width: '1/4' },
        { id: 'a', width: '1/2', rowStart: true },
        { id: 'c', width: '1/2' },
        { id: 'd', width: 'full' },
      ])
    })

    it('A ¼ + B ¼ / C full / D full — C beside D', () => {
      const a = { id: 'a', width: '1/4' as BlockWidth }
      const b = { id: 'b', width: '1/4' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 2, 'd', 'left')
      expect(next).toEqual([
        { id: 'a', width: '1/4' },
        { id: 'b', width: '1/4' },
        { id: 'c', width: '1/2', rowStart: true },
        { id: 'd', width: '1/2' },
      ])
    })

    it('A ¼ + B ¼ / C full / D full — D beside C', () => {
      const a = { id: 'a', width: '1/4' as BlockWidth }
      const b = { id: 'b', width: '1/4' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 3, 'c', 'right')
      expect(next).toEqual([
        { id: 'a', width: '1/4' },
        { id: 'b', width: '1/4' },
        { id: 'c', width: '1/2', rowStart: true },
        { id: 'd', width: '1/2' },
      ])
    })

    it('dragging a row\'s rowStart holder elsewhere hands rowStart to the row-mate left behind (KAN-440)', () => {
      const a = { id: 'a', width: '1/2' as BlockWidth, rowStart: true }
      const x = { id: 'x', width: '1/2' as BlockWidth, rowStart: true }
      const y = { id: 'y', width: '1/2' as BlockWidth }
      const z = { id: 'z', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, x, y, z], 1, 'z', 'left')
      expect(next).toEqual([
        { id: 'a', width: '1/2', rowStart: true },
        { id: 'y', width: '1/2', rowStart: true },
        { id: 'x', width: '1/2', rowStart: true },
        { id: 'z', width: '1/2' },
      ])
    })

    it('all full — B beside C still plans, matching the already-working case', () => {
      const a = { id: 'a', width: 'full' as BlockWidth }
      const b = { id: 'b', width: 'full' as BlockWidth }
      const c = { id: 'c', width: 'full' as BlockWidth }
      const d = { id: 'd', width: 'full' as BlockWidth }
      const next = planBesideDrop([a, b, c, d], 1, 'c', 'left')
      expect(next).toEqual([
        { id: 'a', width: 'full' },
        { id: 'b', width: '1/2', rowStart: true },
        { id: 'c', width: '1/2' },
        { id: 'd', width: 'full' },
      ])
    })
  })
})

describe('classifyDropZone', () => {
  // width 100, height 200 — different axes catch a swapped width/height by construction.
  const rect: Rect = { left: 0, right: 100, top: 0, bottom: 200 }

  it('classifies the left zone\'s centre', () => {
    expect(classifyDropZone(rect, { x: 12.5, y: 100 })).toBe('left')
  })

  it('classifies the right zone\'s centre', () => {
    expect(classifyDropZone(rect, { x: 87.5, y: 100 })).toBe('right')
  })

  it("classifies the above zone's centre", () => {
    expect(classifyDropZone(rect, { x: 50, y: 25 })).toBe('above')
  })

  it("classifies the below zone's centre", () => {
    expect(classifyDropZone(rect, { x: 50, y: 175 })).toBe('below')
  })

  it('treats the 25% width boundary as beside-left', () => {
    expect(classifyDropZone(rect, { x: 25, y: 100 })).toBe('left')
  })

  it('treats the 75% width boundary as beside-right', () => {
    expect(classifyDropZone(rect, { x: 75, y: 100 })).toBe('right')
  })

  it('treats the 25% height boundary (within the middle width) as above', () => {
    expect(classifyDropZone(rect, { x: 50, y: 50 })).toBe('above')
  })

  it('treats the 75% height boundary (within the middle width) as below', () => {
    expect(classifyDropZone(rect, { x: 50, y: 150 })).toBe('below')
  })

  it('offsets by the rect\'s own position, not just its size', () => {
    const offsetRect: Rect = { left: 50, right: 150, top: 20, bottom: 220 }
    expect(classifyDropZone(offsetRect, { x: 62.5, y: 120 })).toBe('left')
    expect(classifyDropZone(offsetRect, { x: 100, y: 45 })).toBe('above')
  })

  describe('a point outside the rect (KAN-440: onDragOver fires for these too)', () => {
    it.each<[string, Point, DropZone]>([
      ['left of the rect at mid-height', { x: -20, y: 100 }, 'left'],
      ['below the rect in the middle width', { x: 50, y: 260 }, 'below'],
      ['above the rect in the middle width', { x: 50, y: -60 }, 'above'],
      ['right of the rect at mid-height', { x: 150, y: 100 }, 'right'],
      ['outside the top-left corner', { x: -20, y: -60 }, 'left'],
      ['outside the top-right corner', { x: 150, y: -60 }, 'right'],
      ['outside the bottom-left corner', { x: -20, y: 260 }, 'left'],
      ['outside the bottom-right corner', { x: 150, y: 260 }, 'right'],
    ])('%s classifies as %s', (_label, point, expected) => {
      expect(classifyDropZone(rect, point)).toBe(expected)
    })
  })
})

describe('isWithinPaddedZone', () => {
  // Same 100x200 rect as `classifyDropZone`'s own tests: left/right split at
  // x=50, above/below bands at y=50/y=150 — each padded 8px on every side.
  const rect: Rect = { left: 0, right: 100, top: 0, bottom: 200 }

  it.each<[Parameters<typeof isWithinPaddedZone>[2], number, number, boolean]>([
    // left zone's own sub-rect is {left: 0, right: 50, top: 0, bottom: 200}.
    ['left', 57, 100, true], // 7px past the right edge — inside the 8px pad.
    ['left', 59, 100, false], // 9px past it — outside.
    ['left', 25, -8, true], // 8px above the top edge — inside the pad.
    ['left', 25, -9, false], // 9px above it — outside.
    // right zone's own sub-rect is {left: 50, right: 100, top: 0, bottom: 200}.
    ['right', 43, 100, true], // 7px short of the left edge — inside the pad.
    ['right', 41, 100, false], // 9px short of it — outside.
    // above zone's own sub-rect is {left: 0, right: 100, top: 0, bottom: 50}.
    ['above', 50, 57, true], // 7px past the bottom edge — inside the pad.
    ['above', 50, 59, false], // 9px past it — outside.
    // below zone's own sub-rect is {left: 0, right: 100, top: 150, bottom: 200}.
    ['below', 50, 143, true], // 7px short of the top edge — inside the pad.
    ['below', 50, 141, false], // 9px short of it — outside.
  ])('%s zone at (%d, %d) is within its padding: %s', (zone, x, y, expected) => {
    expect(isWithinPaddedZone(rect, { x, y }, zone)).toBe(expected)
  })
})

describe("isWithinPaddedZone matches classifyDropZone's real regions (KAN-440)", () => {
  // Same 100x200 rect as the describes above: outer strips at x<=25/x>=75 (full
  // height), middle-height quarters reaching to x=50 within y in [50,150], above/below
  // bands at x in [25,75] with y<=50/y>=150.
  const rect: Rect = { left: 0, right: 100, top: 0, bottom: 200 }

  it.each<[Parameters<typeof isWithinPaddedZone>[2], number, number, boolean]>([
    // The bug this item fixes: with 'left' shown, a point in the top-middle of the
    // left half (x=37.5, in the quarter band) — which `classifyDropZone` calls
    // 'above' — used to stay 'left' because the old sub-rect was the whole left
    // half at any height. It no longer does: the real 'left' region only reaches
    // this x at middle height, so from the very top it's 12.5px away, past the 8px
    // pad.
    ['left', 37.5, 0, false],
    // The same quarter band, 8px above its own top edge (y=42, edge at y=50) — still
    // held; 9px above (y=41) — not.
    ['left', 37.5, 42, true],
    ['left', 37.5, 41, false],
    // Mirrored on the right: top-middle of the right half (x=62.5) is 'above' too,
    // and no longer held as 'right' from the top.
    ['right', 62.5, 0, false],
  ])('%s zone at (%d, %d): %s', (zone, x, y, expected) => {
    expect(isWithinPaddedZone(rect, { x, y }, zone)).toBe(expected)
  })

  // Every corner of the rect sits in an outer strip (left at x=0, right at x=100),
  // full height. A diagonal offset of (5, 5) from a corner is ~7.07px away by
  // Euclidean distance — within the 8px pad — but (6, 6) is ~8.49px away — outside
  // it, even though neither axis alone clears 8px. That distinguishes true distance
  // from the old independent-per-axis padding, which would have held both.
  it.each<[Parameters<typeof isWithinPaddedZone>[2], number, number, boolean]>([
    ['left', -5, -5, true], // top-left corner (0, 0), 5px out on each axis.
    ['left', -6, -6, false], // 6px out on each axis — ~8.49px away.
    ['right', 105, -5, true], // top-right corner (100, 0).
    ['right', 106, -6, false],
    ['left', -5, 205, true], // bottom-left corner (0, 200).
    ['left', -6, 206, false],
    ['right', 105, 205, true], // bottom-right corner (100, 200).
    ['right', 106, 206, false],
  ])('%s zone near a corner at (%d, %d): %s', (zone, x, y, expected) => {
    expect(isWithinPaddedZone(rect, { x, y }, zone)).toBe(expected)
  })
})
