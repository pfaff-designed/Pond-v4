/**
 * The data a PondChart kind draws: point-major rows — an x label plus a map of
 * series name → number — exactly the shape the `view` block's aggregation emits
 * (`chartDataFromRows`) and the legacy `chart/data.ts` contract. Declared here so
 * the chart layer never imports from `lib/modules` (dependency direction stays
 * modules → components).
 */
export interface FigurePoint {
  x: string
  values: Record<string, number>
}

/** The numeric values of one series across points, in order; gaps are skipped. */
export function seriesValues(points: readonly FigurePoint[], series: string): number[] {
  const out: number[] = []
  for (const p of points) {
    const v = p.values[series]
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
  }
  return out
}
