/**
 * Gauge geometry — PondChart "gauge": ONE figure against a target, as a half
 * ring. Read inline from the mockup at 318 wide: outer radius 92, band 14, centre
 * 30px above the floor, end labels 18px below the centre line.
 */
export interface GaugeLayout {
  cx: number
  cy: number
  outer: number
  inner: number
  /** 0…1 of the target reached (clamped; a target ≤ 0 reads as 0). */
  fraction: number
  track: string
  progress: string
}

export const GAUGE_BAND = 14
const MOCKUP_RADIUS = 92
const MOCKUP_WIDTH = 318

/** The outer radius for a frame width: the mockup's 92 at card width, capped at 120. */
export function gaugeRadius(width: number): number {
  return Math.round(Math.min(120, Math.max(60, (width / MOCKUP_WIDTH) * MOCKUP_RADIUS)))
}

/** The frame height a gauge of this radius needs (150 at the mockup radius). */
export function gaugeHeight(width: number): number {
  return gaugeRadius(width) + 58
}

/** A point on the half ring at fraction `f` (0 = left end, 1 = right end). */
function at(cx: number, cy: number, r: number, f: number): [number, number] {
  const a = Math.PI * (1 - f)
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)]
}

/** The SVG path of a half-ring band from fraction 0 to `f`. */
export function halfRingPath(cx: number, cy: number, outer: number, inner: number, f: number): string {
  const [ox0, oy0] = at(cx, cy, outer, 0)
  const [ox1, oy1] = at(cx, cy, outer, f)
  const [ix1, iy1] = at(cx, cy, inner, f)
  const [ix0, iy0] = at(cx, cy, inner, 0)
  const round = (n: number) => Math.round(n * 1000) / 1000
  return `M${round(ox0)},${round(oy0)} A${outer},${outer} 0 0 1 ${round(ox1)},${round(oy1)} L${round(ix1)},${round(iy1)} A${inner},${inner} 0 0 0 ${round(ix0)},${round(iy0)} Z`
}

export function layoutGauge(value: number, target: number, width: number, height: number): GaugeLayout {
  const outer = gaugeRadius(width)
  const inner = outer - GAUGE_BAND
  const cx = width / 2
  const cy = height - 30
  const fraction = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0
  return {
    cx,
    cy,
    outer,
    inner,
    fraction,
    track: halfRingPath(cx, cy, outer, inner, 1),
    // A zero fraction draws nothing (a zero-length arc would still paint caps).
    progress: fraction > 0 ? halfRingPath(cx, cy, outer, inner, fraction) : '',
  }
}
