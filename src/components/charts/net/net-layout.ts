/**
 * Net (profit / loss) line geometry — PondChart "net": one signed series read
 * against a zero line. With TWO series the net is `first − second` ("in minus
 * out"). Segments touching a below-zero point are dashed and below-zero markers
 * are hollow, so the sign reads without a second colour (red is for diff
 * removals only — PROJECT_RULES).
 */
import type { FigurePoint } from '../pond/pond-chart-data'
import { linearScale, niceTicks } from '../pond/linear-scale'
import type { XLabel } from '../pond/cartesian-axes'

export interface NetMarker {
  x: number
  y: number
  label: string
  value: number
  /** True when the value is below zero → hollow marker. */
  below: boolean
}
export interface NetSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Dashed when either end is below zero. */
  dashed: boolean
}
export interface NetLayout {
  ticks: number[]
  y: (v: number) => number
  zeroY: number
  /** The below-zero band: from the zero line to the plot floor (null when nothing is ever negative). */
  band: { y: number; h: number } | null
  markers: NetMarker[]
  segments: NetSegment[]
  xLabels: XLabel[]
}

/** The signed net value per point: series[0], or series[0] − series[1] when two are plotted. */
export function netValues(points: readonly FigurePoint[], series: readonly string[]): (number | undefined)[] {
  const [a, b] = series
  return points.map((p) => {
    const va = a ? p.values[a] : undefined
    if (typeof va !== 'number') return undefined
    if (!b) return va
    const vb = p.values[b]
    return typeof vb === 'number' ? va - vb : va
  })
}

export function layoutNet(
  points: readonly FigurePoint[],
  series: readonly string[],
  plotW: number,
  plotH: number
): NetLayout | null {
  if (points.length === 0 || series.length === 0 || plotW <= 0 || plotH <= 0) return null
  const values = netValues(points, series)
  const present = values.filter((v): v is number => typeof v === 'number')
  if (present.length === 0) return null

  const ticks = niceTicks(Math.min(...present), Math.max(...present), 3, true)
  const y = linearScale(ticks[0], ticks[ticks.length - 1], plotH, 0)
  const zeroY = y(0)
  const x = (i: number) => (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1))

  const markers: NetMarker[] = []
  values.forEach((v, i) => {
    if (typeof v === 'number') markers.push({ x: x(i), y: y(v), label: points[i].x, value: v, below: v < 0 })
  })
  const segments: NetSegment[] = []
  for (let i = 1; i < markers.length; i++) {
    const a = markers[i - 1]
    const b = markers[i]
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, dashed: a.below || b.below })
  }

  return {
    ticks,
    y,
    zeroY,
    band: present.some((v) => v < 0) ? { y: zeroY, h: plotH - zeroY } : null,
    markers,
    segments,
    xLabels: points.map((p, i) => ({ label: p.x, x: x(i) })),
  }
}
