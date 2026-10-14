/**
 * `layoutRows` (6x) — packs consecutive blocks into a row while their widths add up
 * to full or less, in array order.
 */
import {
  classifyDropZone,
  layoutRows,
  planBesideDrop,
  rowHolds,
  widthsForDropBeside,
} from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'
import type { Rect } from '@/lib/modules/layout-rows'

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
      { id: 'a', width: '1/3' },
      { id: 'b', width: '1/3' },
      { id: 'd', width: '1/3' },
    ])
  })

  it('refuses a plan a repack would split apart (X 1/2 / A 2/3, B 1/3 + D beside B would otherwise become [X,A][B,D])', () => {
    const x = { id: 'x', width: '1/2' as BlockWidth }
    const a = { id: 'a', width: '2/3' as BlockWidth }
    const b = { id: 'b', width: '1/3' as BlockWidth }
    const d = { id: 'd', width: 'full' as BlockWidth }
    expect(planBesideDrop([x, a, b, d], 3, 'b', 'right')).toBeNull()
  })

  it('refuses a plan beside a row that already holds 4', () => {
    const quarters = ['q1', 'q2', 'q3', 'q4'].map((id) => ({ id, width: '1/4' as BlockWidth }))
    const d = { id: 'd', width: 'full' as BlockWidth }
    expect(planBesideDrop([...quarters, d], 4, 'q1', 'left')).toBeNull()
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
})
