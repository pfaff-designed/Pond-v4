import { layoutSankey, sankeyHeight } from './sankey-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

const spend: FigurePoint[] = [
  { x: 'food', values: { Amount: 420 } },
  { x: 'rent', values: { Amount: 1150 } },
  { x: 'saved', values: { Amount: 700 } },
  { x: 'refund', values: { Amount: -30 } },
  { x: 'empty', values: {} },
]

describe('layoutSankey', () => {
  it('flows the total into positive categories, largest first', () => {
    const layout = layoutSankey(spend, 'Amount', 318, 150)!
    expect(layout.total).toBe(2270)
    expect(layout.flows.map((f) => f.label)).toEqual(['rent', 'saved', 'food'])
    expect(layout.flows.map((f) => f.rank)).toEqual([0, 1, 2])
  })

  it('reproduces the mockup frame: source 12/6/10→128, targets 80 in from the right', () => {
    const layout = layoutSankey(spend, 'Amount', 318, 150)!
    expect(layout.source).toEqual({ x: 12, y: 10, w: 6, h: 118 })
    expect(layout.flows[0].node.x).toBe(238)
    expect(layout.flows[0].path.startsWith('M18,10 C128,10 128,')).toBe(true)
  })

  it('sizes node heights by share and keeps the frame at 150 for up to six flows', () => {
    const layout = layoutSankey(spend, 'Amount', 318, 150)!
    const heights = layout.flows.map((f) => f.node.h)
    expect(heights[0]).toBeGreaterThan(heights[1])
    expect(heights.reduce((a, b) => a + b, 0)).toBeCloseTo(118 - 2.4 * 2, 1)
    expect(sankeyHeight(6)).toBe(164)
    expect(sankeyHeight(3)).toBe(150)
  })

  it('keeps thin adjacent labels at least 12px apart without moving their nodes', () => {
    const thin = [
      { x: 'rent', values: { Amount: 2000 } },
      { x: 'saved', values: { Amount: 30 } },
      { x: 'subs', values: { Amount: 20 } },
      { x: 'fees', values: { Amount: 10 } },
    ]
    const layout = layoutSankey(thin, 'Amount', 318, 150)!
    const ys = layout.flows.map((f) => f.ly)
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(12)
    // The node for the thinnest flow is still where its share puts it (just under the one before).
    const [, saved, subs] = layout.flows
    expect(subs.node.y).toBeCloseTo(saved.node.y + saved.node.h + 2.4, 2)
  })

  it('returns null with nothing positive to flow', () => {
    expect(layoutSankey([{ x: 'a', values: { Amount: 0 } }], 'Amount', 318, 150)).toBeNull()
  })
})
