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
