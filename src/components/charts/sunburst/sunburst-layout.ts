/**
 * Sunburst geometry — PondChart "sunburst": an inner ring of categories and an
 * outer ring of each category's records ("pages, then their nested pages"). Read
 * from the mockup's 140 × 150 drawing: inner ring radii 22 → 44, outer 46 → 66,
 * slices clockwise from the top, ranked fills with the outer ring at .52 of its
 * parent's opacity.
 */
import type { FigurePoint } from '../pond/pond-chart-data'

export interface SunburstSlice {
  label: string
  value: number
  /** Share of the ring total, 0…1. */
  share: number
  rank: number
  path: string
}
export interface SunburstLayout {
  size: number
  cx: number
  cy: number
  total: number
  inner: SunburstSlice[]
  /** Outer-ring slices, each pointing at its parent's rank for colour. */
  outer: (SunburstSlice & { parentRank: number })[]
}

export const SUNBURST_SIZE = 150
export const SUNBURST_OUTER_OPACITY = 0.52
const RADII = { innerIn: 22, innerOut: 44, outerIn: 46, outerOut: 66 }
/** A sliver of air between slices, in radians. */
const GAP = 0.02
const TAU = Math.PI * 2

const r = (n: number) => Math.round(n * 1000) / 1000
const at = (cx: number, cy: number, radius: number, a: number): string => `${r(cx + radius * Math.sin(a))},${r(cy - radius * Math.cos(a))}`

/** A donut slice from angle a0 to a1 (clockwise from the top). */
export function donutPath(cx: number, cy: number, inner: number, outer: number, a0: number, a1: number): string {
  const sweep = Math.min(a1 - a0, TAU - 0.001)
  const end = a0 + sweep
  const large = sweep > Math.PI ? 1 : 0
  return `M${at(cx, cy, outer, a0)} A${outer},${outer} 0 ${large} 1 ${at(cx, cy, outer, end)} L${at(cx, cy, inner, end)} A${inner},${inner} 0 ${large} 0 ${at(cx, cy, inner, a0)} Z`
}

export function layoutSunburst(
  points: readonly FigurePoint[],
  series: string,
  leaves: Readonly<Record<string, readonly FigurePoint[]>> = {}
): SunburstLayout | null {
  const items = points
    .map((p) => ({ label: p.x, value: p.values[series] }))
    .filter((it): it is { label: string; value: number } => typeof it.value === 'number' && it.value > 0)
  if (items.length === 0) return null
  const total = items.reduce((a, it) => a + it.value, 0)
  const cx = SUNBURST_SIZE / 2 - 5
  const cy = SUNBURST_SIZE / 2
  const ranked = [...items].sort((a, b) => b.value - a.value)
  const rankOf = new Map(ranked.map((it, i) => [it.label, i]))

  let a = 0
  const inner: SunburstSlice[] = []
  const outer: SunburstLayout['outer'] = []
  for (const it of items) {
    const sweep = (it.value / total) * TAU
    const rank = rankOf.get(it.label) ?? 0
    inner.push({ label: it.label, value: it.value, share: it.value / total, rank, path: donutPath(cx, cy, RADII.innerIn, RADII.innerOut, a + GAP / 2, a + sweep - GAP / 2) })
    const kids = (leaves[it.label] ?? [])
      .map((p) => ({ label: p.x, value: p.values[series] }))
      .filter((k): k is { label: string; value: number } => typeof k.value === 'number' && k.value > 0)
    const kidTotal = kids.reduce((s, k) => s + k.value, 0)
    let b = a
    kids.forEach((k, i) => {
      const ks = (k.value / kidTotal) * sweep
      outer.push({ label: k.label, value: k.value, share: k.value / total, rank: i, parentRank: rank, path: donutPath(cx, cy, RADII.outerIn, RADII.outerOut, b + GAP / 2, b + ks - GAP / 2) })
      b += ks
    })
    a += sweep
  }
  return { size: SUNBURST_SIZE, cx, cy, total, inner, outer }
}
