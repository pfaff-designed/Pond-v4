import type { ChartPhase } from './chart-phase'
import { type LineLoadingPulseMode, resolveLineLoadingPulseMode } from './line-loading-pulse'

/**
 * Pulse mode for a series' loading overlay. Precedence: an explicit
 * `loading={false}` disables the pulse outright; an explicit
 * `loadingPulseMode` wins next; `loading={true}` forces a loop; otherwise
 * the chart phase decides (loading → loop, exiting → exit,
 * revealingLoading → enter, else no pulse).
 */
export function resolveSeriesPulseMode(
  chartPhase: ChartPhase,
  loading: boolean | undefined,
  loadingPulseMode: LineLoadingPulseMode | undefined
): LineLoadingPulseMode | null {
  if (loading === false) {
    return null
  }
  return loadingPulseMode ?? (loading === true ? 'loop' : resolveLineLoadingPulseMode(chartPhase))
}

/**
 * Whether a series' real content (stroke / fill / markers) should render:
 * only once the chart has revealed — including the exit-from-ready phase,
 * where content stays visible while the loading chrome tweens back in.
 */
export function isSeriesContentVisible(chartPhase: ChartPhase): boolean {
  return chartPhase === 'revealing' || chartPhase === 'ready' || chartPhase === 'exitingReady'
}
