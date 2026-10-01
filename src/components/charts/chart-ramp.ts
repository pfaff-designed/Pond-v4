/**
 * The ONE chart colour ramp (#94 retint) — the TS mirror of `--chart-1…5` in
 * `globals.css`. Make Noise charts are single-hue: every step is ink over paper
 * (paper over the dark card in `.dark`), stepping 1 → .72 → .5 → .32 → .18. It is
 * used two ways, and nowhere else defines chart colours:
 *
 * - `seriesColor(i)` — CATEGORICAL: a second/third series cycles the ramp.
 * - `rankColor(i)` — RANKED: a sunburst slice, funnel step or flow target fades
 *   down the ramp by rank and CLAMPS at the palest step, so the sixth item never
 *   snaps back to solid ink beside a near-paper fifth.
 *
 * PROJECT_RULES: area colours (sage/mist/navy) are marks only; signals (burnt
 * orange, wheat, red) each have one job. Neither ever enters a chart.
 */
export const CHART_SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

/** Categorical: series `i` cycles the ramp. */
export function seriesColor(i: number): string {
  return CHART_SERIES_COLORS[((i % CHART_SERIES_COLORS.length) + CHART_SERIES_COLORS.length) % CHART_SERIES_COLORS.length]
}

/** Ranked: rank `i` (0 = strongest) fades down the ramp and clamps at the palest step. */
export function rankColor(i: number): string {
  return CHART_SERIES_COLORS[Math.min(Math.max(i, 0), CHART_SERIES_COLORS.length - 1)]
}
