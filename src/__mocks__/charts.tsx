/**
 * Jest mock for the Bklit chart entry modules the promoted chart views import
 * (ticket-36). The real Bklit charts pull in `@visx/*` → `d3-shape` (pure ESM), and
 * next/jest doesn't transpile node_modules — so any jsdom suite that transitively
 * imports the module registry (→ chart-line/bar/area view → LineChart/BarChart/
 * AreaChart) can't load the real ones. Same situation, same remedy as the
 * `@number-flow/react` and `react-markdown` stubs.
 *
 * The chart RENDER (real Bklit SVG, series, empty state) is asserted in the chart
 * Storybook story tests (vitest browser env, native ESM); jsdom only needs the module
 * graph to load, so these stubs render nothing chart-specific. The card CHROME
 * (title, caption, legend, empty state) is real React with no ESM deps, so tests that
 * care about chrome text still see it — this stub only replaces the SVG guts.
 */
import type { ReactNode } from 'react'

function ChartStub({ children }: { children?: ReactNode }) {
  return <div data-chart-stub>{children}</div>
}

// Series/child components render nothing in jsdom (they only draw SVG).
function SeriesStub() {
  return null
}

export const LineChart = ChartStub
export const BarChart = ChartStub
export const AreaChart = ChartStub
export const Line = SeriesStub
export const Bar = SeriesStub
export const Area = SeriesStub
export const Grid = SeriesStub
export const XAxis = SeriesStub
export const BarXAxis = SeriesStub

export default ChartStub
