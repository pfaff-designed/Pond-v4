/**
 * `layoutRows` (6x) — packs consecutive blocks into a row while their widths add up
 * to full or less, in array order.
 */
import { layoutRows } from '@/lib/modules/layout-rows'
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
