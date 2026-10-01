/**
 * Composed chart geometry (PondChart "composed + projection"): the FIRST series as
 * bars, every further series as a line — or, with one series only, its RUNNING
 * TOTAL as the line (the mockup's "spend, running total, budget"). An optional
 * `target` draws the dashed reference line the mockup labels "budget".
 */
import type { FigurePoint } from '../pond/pond-chart-data'
import { linearScale, niceTicks } from '../pond/linear-scale'
import type { XLabel } from '../pond/cartesian-axes'

export interface ComposedBar {
  x: number
  y: number
  w: number
  h: number
  label: string
  value: number
}
export interface ComposedLine {
  name: string
  points: { x: number; y: number }[]
}
export interface ComposedLayout {
  ticks: number[]
  y: (v: number) => number
  bars: ComposedBar[]
  lines: ComposedLine[]
  target?: { y: number; label: string }
  xLabels: XLabel[]
}

/** The mockup's bar: 26px wide in a 44px slot (≈ 60%), never wider than 26. */
export const COMPOSED_BAR_MAX_W = 26

/** Running total of a series across points (gaps contribute nothing). */
export function runningTotal(points: readonly FigurePoint[], series: string): (number | undefined)[] {
  let acc = 0
  let seen = false
  return points.map((p) => {
    const v = p.values[series]
    if (typeof v === 'number') {
      acc += v
      seen = true
    }
    return seen ? acc : undefined
  })
}

export function layoutComposed(
  points: readonly FigurePoint[],
  series: readonly string[],
  plotW: number,
  plotH: number,
  target?: number
): ComposedLayout | null {
  const primary = series[0]
  if (!primary || points.length === 0 || plotW <= 0 || plotH <= 0) return null

  const lineSeries: { name: string; values: (number | undefined)[] }[] =
    series.length > 1
      ? series.slice(1).map((name) => ({ name, values: points.map((p) => p.values[name]) }))
      : [{ name: `${primary} (running total)`, values: runningTotal(points, primary) }]

  const all: number[] = []
  for (const p of points) if (typeof p.values[primary] === 'number') all.push(p.values[primary])
  for (const l of lineSeries) for (const v of l.values) if (typeof v === 'number') all.push(v)
  if (typeof target === 'number') all.push(target)
  if (all.length === 0) return null

  const ticks = niceTicks(Math.min(...all), Math.max(...all), 2, true)
  const y = linearScale(ticks[0], ticks[ticks.length - 1], plotH, 0)
  const slot = plotW / points.length
  const w = Math.min(COMPOSED_BAR_MAX_W, slot * 0.6)
  const centre = (i: number) => slot * i + slot / 2
  const zeroY = y(0)

  const bars: ComposedBar[] = []
  points.forEach((p, i) => {
    const v = p.values[primary]
    if (typeof v !== 'number') return
    const top = Math.min(y(v), zeroY)
    bars.push({ x: centre(i) - w / 2, y: top, w, h: Math.abs(zeroY - y(v)), label: p.x, value: v })
  })

  const lines: ComposedLine[] = lineSeries.map((l) => ({
    name: l.name,
    points: l.values.flatMap((v, i) => (typeof v === 'number' ? [{ x: centre(i), y: y(v) }] : [])),
  }))

  return {
    ticks,
    y,
    bars,
    lines,
    target: typeof target === 'number' ? { y: y(target), label: 'target' } : undefined,
    xLabels: points.map((p, i) => ({ label: p.x, x: centre(i) })),
  }
}
