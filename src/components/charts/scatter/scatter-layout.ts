/**
 * Scatter geometry — PondChart "scatter": each point a dot, x read from the
 * point's label (numeric → a true two-variable scatter like "sleep vs energy";
 * a date → chronological; anything else → ordinal), y from each series. A dashed
 * least-squares trend is drawn for the first series when the x axis is measurable
 * and there are at least three dots.
 */
import type { FigurePoint } from '../pond/pond-chart-data'
import { extent, formatTick, linearScale, niceTicks } from '../pond/linear-scale'
import type { XLabel } from '../pond/cartesian-axes'

export type ScatterAxisKind = 'numeric' | 'date' | 'ordinal'

export interface ScatterDot {
  x: number
  y: number
  label: string
  value: number
}
export interface ScatterLayout {
  axis: ScatterAxisKind
  yTicks: number[]
  y: (v: number) => number
  /** One dot list per series, in series order. */
  dots: ScatterDot[][]
  trend: { x1: number; y1: number; x2: number; y2: number } | null
  xLabels: XLabel[]
}

const isNumericLabel = (s: string) => s.trim() !== '' && Number.isFinite(Number(s))
const isDateLabel = (s: string) => !isNumericLabel(s) && Number.isFinite(Date.parse(s))

/** What the x labels are: all numbers, all dates, or plain categories. */
export function detectAxis(labels: readonly string[]): ScatterAxisKind {
  if (labels.length > 0 && labels.every(isNumericLabel)) return 'numeric'
  if (labels.length > 0 && labels.every(isDateLabel)) return 'date'
  return 'ordinal'
}

/**
 * Clip the segment (x1,y1)→(x2,y2) to the rect [0,w]×[0,h] (Liang–Barsky), keeping
 * its slope — clamping the endpoints independently would bend the line. Null when
 * the segment misses the rect entirely.
 */
export function clipSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = x2 - x1
  const dy = y2 - y1
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-dx, x1],
    [dx, w - x1],
    [-dy, y1],
    [dy, h - y1],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return { x1: x1 + t0 * dx, y1: y1 + t0 * dy, x2: x1 + t1 * dx, y2: y1 + t1 * dy }
}

/** Ordinary least squares `y = a + b·x`; null when x has no spread. */
export function leastSquares(xs: readonly number[], ys: readonly number[]): { a: number; b: number } | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  if (sxx === 0) return null
  const b = sxy / sxx
  return { a: my - b * mx, b }
}

export function layoutScatter(
  points: readonly FigurePoint[],
  series: readonly string[],
  plotW: number,
  plotH: number
): ScatterLayout | null {
  if (points.length === 0 || series.length === 0 || plotW <= 0 || plotH <= 0) return null
  const labels = points.map((p) => p.x)
  const axis = detectAxis(labels)
  const xRaw = labels.map((s, i) => (axis === 'numeric' ? Number(s) : axis === 'date' ? Date.parse(s) : i))

  const ys: number[] = []
  for (const name of series) for (const p of points) if (typeof p.values[name] === 'number') ys.push(p.values[name])
  const yExtent = extent(ys)
  if (!yExtent) return null
  const yTicks = niceTicks(yExtent[0], yExtent[1], 3)
  const y = linearScale(yTicks[0], yTicks[yTicks.length - 1], plotH, 0)

  let xDomain: [number, number]
  let xLabels: XLabel[]
  if (axis === 'numeric') {
    const ticks = niceTicks(Math.min(...xRaw), Math.max(...xRaw), 2)
    xDomain = [ticks[0], ticks[ticks.length - 1]]
    const sx = linearScale(xDomain[0], xDomain[1], 0, plotW)
    xLabels = ticks.map((t) => ({ label: formatTick(t), x: sx(t) }))
  } else {
    const ext = extent(xRaw) ?? [0, 0]
    xDomain = ext[0] === ext[1] ? [ext[0] - 1, ext[1] + 1] : ext
    const sx = linearScale(xDomain[0], xDomain[1], 0, plotW)
    xLabels = points.map((p, i) => ({ label: p.x, x: sx(xRaw[i]) }))
  }
  const x = linearScale(xDomain[0], xDomain[1], 0, plotW)

  const dots = series.map((name) =>
    points.flatMap((p, i) => {
      const v = p.values[name]
      return typeof v === 'number' ? [{ x: x(xRaw[i]), y: y(v), label: p.x, value: v }] : []
    })
  )

  let trend: ScatterLayout['trend'] = null
  if (axis !== 'ordinal' && dots[0].length >= 3) {
    const pairs = points.flatMap((p, i) =>
      typeof p.values[series[0]] === 'number' ? [[xRaw[i], p.values[series[0]]] as const] : []
    )
    const fit = leastSquares(
      pairs.map((q) => q[0]),
      pairs.map((q) => q[1])
    )
    if (fit) {
      // Evaluate across the DATA's x extent (not the nice-extended axis), then clip
      // the segment to the plot so its slope is the fit's slope, never a bent one.
      const xs = pairs.map((q) => q[0])
      const [dx0, dx1] = [Math.min(...xs), Math.max(...xs)]
      trend = clipSegment(x(dx0), y(fit.a + fit.b * dx0), x(dx1), y(fit.a + fit.b * dx1), plotW, plotH)
    }
  }

  return { axis, yTicks, y, dots, trend, xLabels }
}
