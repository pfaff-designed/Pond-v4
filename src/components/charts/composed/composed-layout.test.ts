import { layoutComposed, runningTotal } from './composed-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

const points: FigurePoint[] = [
  { x: 'may', values: { Spend: 400 } },
  { x: 'jun', values: { Spend: 900 } },
  { x: 'jul', values: {} },
  { x: 'aug', values: { Spend: 700 } },
]

describe('runningTotal', () => {
  it('accumulates across points and carries the total through a gap', () => {
    expect(runningTotal(points, 'Spend')).toEqual([400, 1300, 1300, 2000])
  })
})

describe('layoutComposed', () => {
  it('draws the first series as bars from a zero baseline and its running total as the line', () => {
    const layout = layoutComposed(points, ['Spend'], 284, 124)
    expect(layout).not.toBeNull()
    expect(layout!.bars).toHaveLength(3) // the gap month has no bar
    expect(layout!.ticks[0]).toBe(0)
    expect(layout!.lines[0].name).toBe('Spend (running total)')
    expect(layout!.lines[0].points).toHaveLength(4)
    // Bars sit on the zero line and never exceed the mockup's 26px.
    const bar = layout!.bars[0]
    expect(bar.y + bar.h).toBeCloseTo(layout!.y(0))
    expect(bar.w).toBeLessThanOrEqual(26)
  })

  it('uses further series as lines when more than one is plotted', () => {
    const two = points.map((p) => ({ ...p, values: { ...p.values, Budget: 800 } }))
    const layout = layoutComposed(two, ['Spend', 'Budget'], 284, 124)!
    expect(layout.lines.map((l) => l.name)).toEqual(['Budget'])
  })

  it('places a target reference inside the y domain', () => {
    const layout = layoutComposed(points, ['Spend'], 284, 124, 10000)!
    expect(layout.target?.label).toBe('target')
    expect(layout.ticks[layout.ticks.length - 1]).toBeGreaterThanOrEqual(10000)
  })

  it('returns null with nothing to draw', () => {
    expect(layoutComposed([], ['Spend'], 284, 124)).toBeNull()
    expect(layoutComposed(points, [], 284, 124)).toBeNull()
  })
})
