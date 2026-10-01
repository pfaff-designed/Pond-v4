import { layoutNet, netValues } from './net-layout'
import type { FigurePoint } from '../pond/pond-chart-data'

const points: FigurePoint[] = [
  { x: 'oct', values: { In: 1200, Out: 900 } },
  { x: 'nov', values: { In: 800, Out: 1040 } },
  { x: 'dec', values: { In: 1500, Out: 1000 } },
]

describe('netValues', () => {
  it('reads one series as signed values, or first minus second', () => {
    expect(netValues(points, ['In'])).toEqual([1200, 800, 1500])
    expect(netValues(points, ['In', 'Out'])).toEqual([300, -240, 500])
  })
})

describe('layoutNet', () => {
  it('reads from a zero baseline, dashes segments that touch a below-zero point, hollows those markers', () => {
    const layout = layoutNet(points, ['In', 'Out'], 284, 124)!
    expect(layout.ticks).toContain(0)
    expect(layout.markers.map((m) => m.below)).toEqual([false, true, false])
    expect(layout.segments.map((s) => s.dashed)).toEqual([true, true])
    // The band spans from the zero line to the floor.
    expect(layout.band).toEqual({ y: layout.zeroY, h: 124 - layout.zeroY })
  })

  it('has no band and no dashes when nothing is negative', () => {
    const layout = layoutNet(points, ['In'], 284, 124)!
    expect(layout.band).toBeNull()
    expect(layout.segments.every((s) => !s.dashed)).toBe(true)
  })

  it('spreads points edge to edge and centres a single point', () => {
    const layout = layoutNet(points, ['In'], 284, 124)!
    expect(layout.markers[0].x).toBe(0)
    expect(layout.markers[2].x).toBe(284)
    expect(layoutNet([points[0]], ['In'], 284, 124)!.markers[0].x).toBe(142)
  })
})
