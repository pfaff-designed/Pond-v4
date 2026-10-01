/**
 * Radar geometry — PondChart "radar": one axis per category, three grid rings,
 * a polygon per series scaled to the largest value. Read from the mockup at
 * 150 tall: centre (159, 76) = height/2 + 1, rim 14px above the centre (radius
 * 62), labels 14px beyond the rim.
 */
import type { FigurePoint } from '../pond/pond-chart-data'

export interface RadarAxis {
  label: string
  /** Rim point of the spoke. */
  x: number
  y: number
  /** Label anchor, just beyond the rim. */
  lx: number
  ly: number
}
export interface RadarLayout {
  cx: number
  cy: number
  radius: number
  rings: string[]
  axes: RadarAxis[]
  /** One polygon (SVG points string) per series. */
  polygons: { name: string; points: string }[]
  max: number
}

export const RADAR_MIN_AXES = 3
export const RADAR_RINGS = 3

/** Radial frame height: the mockup's 150, growing gently with width to 220. */
export function radialHeight(width: number): number {
  return Math.round(Math.min(220, Math.max(150, width * 0.42)))
}

const fmt = (n: number) => Math.round(n * 100) / 100

export function layoutRadar(
  points: readonly FigurePoint[],
  series: readonly string[],
  width: number,
  height: number
): RadarLayout | null {
  if (points.length < RADAR_MIN_AXES || series.length === 0) return null
  const cx = width / 2
  const cy = height / 2 + 1
  const radius = cy - 14
  const n = points.length
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n
  const at = (i: number, r: number): [number, number] => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))]

  let max = 0
  for (const name of series) for (const p of points) if (typeof p.values[name] === 'number') max = Math.max(max, p.values[name])
  if (max <= 0) return null

  const rings = Array.from({ length: RADAR_RINGS }, (_, k) => {
    const r = (radius * (k + 1)) / RADAR_RINGS
    return points.map((_, i) => at(i, r).map(fmt).join(',')).join(' ')
  })
  const axes = points.map((p, i) => {
    const [x, y] = at(i, radius)
    const [lx, ly] = at(i, radius + 14)
    return { label: p.x, x: fmt(x), y: fmt(y), lx: fmt(lx), ly: fmt(ly) + 3.5 }
  })
  const polygons = series.map((name) => ({
    name,
    points: points
      .map((p, i) => {
        const v = p.values[name]
        return at(i, (Math.max(0, typeof v === 'number' ? v : 0) / max) * radius).map(fmt).join(',')
      })
      .join(' '),
  }))
  return { cx, cy, radius, rings, axes, polygons, max }
}
