/**
 * Pure scale helpers for the PondChart kinds — a linear map and "nice" ticks (the
 * 1 / 2 / 5 step rule d3 uses), written by hand so the chart kinds have no
 * `d3-*` ESM dependency and stay loadable in the jsdom suite.
 */

/** A linear map from a value domain to a pixel range (degenerate domains map to the range midpoint). */
export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d1 === d0) return () => (r0 + r1) / 2
  const k = (r1 - r0) / (d1 - d0)
  return (v: number) => r0 + (v - d0) * k
}

/** `[min, max]` of a list, or null when nothing is finite. */
export function extent(values: readonly number[]): [number, number] | null {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return min <= max ? [min, max] : null
}

/** A "nice" step for roughly `count` ticks across `span`: 1, 2 or 5 × a power of ten. */
export function niceStep(span: number, count: number): number {
  if (span <= 0 || count <= 0) return 1
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * mag
}

/**
 * Tick values from `min` to `max` at a nice step, extended outward so the first
 * tick is ≤ min and the last ≥ max. `includeZero` pulls the domain to zero (bars
 * and nets must be read from a zero baseline).
 */
export function niceTicks(min: number, max: number, count = 4, includeZero = false): number[] {
  let lo = includeZero ? Math.min(0, min) : min
  let hi = includeZero ? Math.max(0, max) : max
  if (lo === hi) {
    // A flat series still needs a readable band around its one value.
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.5
    lo -= pad
    hi += pad
  }
  const step = niceStep(hi - lo, count)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) {
    // Snap away float drift (0.30000000000000004 → 0.3).
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}

/** Compact tick label: "10k", "1.5k", "500", "-240", "0.5". Lowercase k/m like the mockup. */
export function formatTick(v: number): string {
  if (!Number.isFinite(v)) return ''
  const abs = Math.abs(v)
  if (abs >= 1000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
      .format(v)
      .toLowerCase()
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

/** Full value label: "1,150", "3,200.5". For flow / funnel / legend figures. */
export function formatValue(v: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v)
}
