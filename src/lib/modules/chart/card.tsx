'use client'

import type { ReactNode } from 'react'
import type { ChartPoint } from './data'
import { seriesNames } from './data'

/**
 * Shared chart-module CARD chrome (ticket-36) — the Press module-card wrapper every
 * promoted Bklit chart renders inside (w2-design-brief.md: "wrap each in the standard
 * module-card chrome — kicker title, caption line"). The Bklit VISUAL is untouched;
 * this only supplies the surrounding chrome so `chart-line` / `chart-bar` /
 * `chart-area` read as one family: a kicker title, a muted caption, axis + legend
 * labels in the small mono-kicker voice, and a calm empty state that never crashes on
 * degenerate data. Colours are the Bklit palette (via the child chart) plus zinc for
 * chrome text; brand-token reconciliation is a later ticket, mirroring metric-ring.
 */

/** The module-card kicker voice — exported (#12) so the promoted heatmap/stat
 *  modules share the exact chrome instead of restating the classes. Make Noise:
 *  the block eyebrow is the mono machine-surface voice (lowercase, tight
 *  tracking) in muted ink — the label over a data block. */
export const KICKER =
  'font-mono text-mn-11 lowercase tracking-wider text-mn-text-secondary'

export interface ChartCardProps {
  title?: string
  caption?: string
  xLabel?: string
  yLabel?: string
  points: readonly ChartPoint[]
  /** Series colours keyed by name, in series order, for the legend swatches. */
  seriesColors: readonly string[]
  /** The Bklit chart element. Rendered only when there is at least one point. */
  children: ReactNode
}

/**
 * A degenerate chart (no points, or points with no numeric series) must read as a
 * quiet "no data yet" rather than a broken axis or a zero-height SVG. This is the
 * single guard the ticket calls out: "Empty/degenerate data states never crash."
 */
function isEmpty(points: readonly ChartPoint[]): boolean {
  return seriesNames(points).length === 0
}

export function ChartCard({
  title,
  caption,
  xLabel,
  yLabel,
  points,
  seriesColors,
  children,
}: ChartCardProps) {
  const names = seriesNames(points)
  const empty = isEmpty(points)

  return (
    <div className="text-sm text-mn-text">
      {title && <div className={KICKER}>{title}</div>}
      {caption && <div className="mt-0.5 text-xs text-mn-text-secondary">{caption}</div>}

      {empty ? (
        <div className="mt-2 rounded-mn-inner bg-mn-wash py-6 text-center text-xs text-mn-text-secondary">
          No data yet
        </div>
      ) : (
        <>
          <div className="mt-2">{children}</div>

          {/* Axis labels + legend in the mono-kicker voice (small, muted). */}
          {(xLabel || yLabel || names.length > 1) && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <div className="flex flex-wrap items-center gap-3">
                {names.length > 1 &&
                  names.map((name, i) => (
                    <span
                      key={name}
                      className="flex items-center gap-1.5 text-mn-11 text-mn-text-secondary"
                    >
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: seriesColors[i % seriesColors.length] }}
                      />
                      {name}
                    </span>
                  ))}
              </div>
              {(xLabel || yLabel) && (
                <div className={`${KICKER} flex gap-3`}>
                  {yLabel && (
                    <span className="inline-flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M6 2.5v7M4 4.5 6 2.5 8 4.5M4 7.5 6 9.5 8 7.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {yLabel}
                    </span>
                  )}
                  {xLabel && (
                    <span className="inline-flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M2.5 6h7M4.5 4 2.5 6 4.5 8M7.5 4 9.5 6 7.5 8"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {xLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The Press/Bklit series palette, in order. Kept small and derived from the chart
 * CSS vars the Bklit components already default to, so a single-series chart matches
 * the line/bar/area primary and multi-series charts stay within the palette.
 */
export const CHART_SERIES_COLORS = [
  'var(--chart-line-primary)',
  'var(--chart-line-secondary)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
] as const
