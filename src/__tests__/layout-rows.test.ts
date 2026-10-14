/**
 * `layoutRows` (6x) — packs consecutive blocks into a row while their widths add up
 * to full or less, in array order.
 */
import { layoutRows, rowHolds, widthsForDropBeside } from '@/lib/modules/layout-rows'
import type { BlockWidth } from '@/lib/modules/content'

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
