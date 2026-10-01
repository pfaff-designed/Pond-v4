import { donutPath, layoutSunburst } from './sunburst-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

const pages: FigurePoint[] = [
  { x: 'work', values: { Minutes: 460 } },
  { x: 'home', values: { Minutes: 240 } },
  { x: 'health', values: { Minutes: 180 } },
  { x: 'making', values: { Minutes: 120 } },
]
const leaves: Record<string, FigurePoint[]> = {
  work: [
    { x: 'roadmap', values: { Minutes: 300 } },
    { x: 'hiring', values: { Minutes: 160 } },
  ],
  home: [{ x: 'kitchen', values: { Minutes: 240 } }],
}

describe('donutPath', () => {
  it('starts at the top and sweeps clockwise, flagging arcs over a half turn', () => {
    const quarter = donutPath(70, 75, 22, 44, 0, Math.PI / 2)
    expect(quarter.startsWith('M70,31 A44,44 0 0 1 114,75')).toBe(true)
    expect(donutPath(70, 75, 22, 44, 0, Math.PI * 1.5)).toContain('A44,44 0 1 1')
  })
})

describe('layoutSunburst', () => {
  it('shares the inner ring by value in point order, ranked by size for colour', () => {
    const layout = layoutSunburst(pages, 'Minutes')!
    expect(layout.total).toBe(1000)
    expect(layout.inner.map((s) => s.label)).toEqual(['work', 'home', 'health', 'making'])
    expect(layout.inner.map((s) => s.share)).toEqual([0.46, 0.24, 0.18, 0.12])
    expect(layout.inner.map((s) => s.rank)).toEqual([0, 1, 2, 3])
  })

  it('splits the outer ring inside each parent and points at the parent rank', () => {
    const layout = layoutSunburst(pages, 'Minutes', leaves)!
    expect(layout.outer.map((s) => s.label)).toEqual(['roadmap', 'hiring', 'kitchen'])
    expect(layout.outer.map((s) => s.parentRank)).toEqual([0, 0, 1])
    expect(layout.outer[0].share).toBeCloseTo(0.3)
  })

  it('never inverts a sliver thinner than the gap (B1): every arc sweeps forward', () => {
    const layout = layoutSunburst([{ x: 'big', values: { V: 10000 } }, { x: 'tiny', values: { V: 10 } }], 'V')!
    expect(layout.inner).toHaveLength(2)
    // A forward sweep of a sub-gap slice is a short arc with the small-arc flag, not a ~353° one.
    expect(layout.inner[1].path).toContain('A44,44 0 0 1')
    const [x0, y0] = layout.inner[1].path.slice(1).split(' ')[0].split(',').map(Number)
    const [x1, y1] = layout.inner[1].path.split(' ')[5].split(',').map(Number)
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1)
  })

  it('returns null with nothing positive', () => {
    expect(layoutSunburst([{ x: 'a', values: {} }], 'Minutes')).toBeNull()
  })
})
