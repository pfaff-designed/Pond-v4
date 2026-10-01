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

  it('returns null with nothing positive', () => {
    expect(layoutSunburst([{ x: 'a', values: {} }], 'Minutes')).toBeNull()
  })
})
