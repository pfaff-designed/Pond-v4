/**
 * Jest mock for the Bklit heatmap entry module (`@/components/charts/heatmap`,
 * #12). The real HeatmapChart pulls in `@visx/*` + `motion` (pure ESM) which
 * next/jest won't transpile — same situation, same remedy as the chart-line/bar/
 * area stubs in charts.tsx. The heatmap RENDER (grid, cells, axes) is asserted
 * in the heatmap Storybook story tests (vitest browser env, native ESM); jsdom
 * only needs the module graph to load. The BINNING transform is pure and jest-
 * covered directly (heatmap-data.test.ts) — it lives in heatmap-utils/data.ts,
 * which this stub does not shadow.
 */
import type { ReactNode } from 'react'

export function HeatmapChart({ children }: { children?: ReactNode }) {
  return <div data-chart-stub>{children}</div>
}

// Child components render nothing in jsdom (they only draw SVG / portal labels).
export function HeatmapCells() {
  return null
}
export function HeatmapXAxis() {
  return null
}
export function HeatmapYAxis() {
  return null
}
export function HeatmapLegend() {
  return null
}

export default HeatmapChart
