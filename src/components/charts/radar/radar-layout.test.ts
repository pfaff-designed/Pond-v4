import { layoutRadar, radialHeight } from './radar-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

const groups: FigurePoint[] = [
  { x: 'push', values: { Sets: 24 } },
  { x: 'pull', values: { Sets: 18 } },
  { x: 'legs', values: { Sets: 22 } },
  { x: 'core', values: { Sets: 10 } },
  { x: 'cardio', values: { Sets: 14 } },
]

describe('layoutRadar', () => {
  it('needs at least three axes and a positive value', () => {
    expect(layoutRadar(groups.slice(0, 2), ['Sets'], 318, 150)).toBeNull()
    expect(layoutRadar(groups.map((g) => ({ ...g, values: {} })), ['Sets'], 318, 150)).toBeNull()
  })

  it('reproduces the mockup frame: radius 62, first axis straight up, three rings', () => {
    const layout = layoutRadar(groups, ['Sets'], 318, 150)!
    expect(layout.radius).toBe(61)
    expect(layout.rings).toHaveLength(3)
    expect(layout.axes[0].x).toBe(159)
    expect(layout.axes[0].y).toBeCloseTo(76 - 61)
    expect(layout.axes.map((a) => a.label)).toEqual(['push', 'pull', 'legs', 'core', 'cardio'])
  })

  it('scales every series to the shared maximum', () => {
    const layout = layoutRadar(groups, ['Sets'], 318, 150)!
    expect(layout.max).toBe(24)
    // The largest value touches the rim on its axis.
    expect(layout.polygons[0].points.split(' ')[0]).toBe(`${layout.axes[0].x},${layout.axes[0].y}`)
  })

  it('grows the radial frame with width up to a cap', () => {
    expect(radialHeight(318)).toBe(150)
    expect(radialHeight(1000)).toBe(220)
  })
})
