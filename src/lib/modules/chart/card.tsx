'use client'

import type { ReactNode } from 'react'
import type { ChartPoint } from './data'
import { seriesNames } from './data'
import { pageEyebrowClass } from '@/components/atoms/kicker'

/**
 * Shared chart CARD chrome — the module-card wrapper every chart KIND renders inside.
 * The Bklit VISUAL is untouched; this only supplies the surrounding chrome so all
 * thirteen kinds read as one family: a sans eyebrow title, a muted caption, axis + legend
 * labels in the same eyebrow voice, and a calm empty state that never crashes on
 * degenerate data. Colours are the Make Noise chart tokens only (#94 retint).
 */

/** The block eyebrow — exported so any surface that needs it shares the exact
 *  chrome instead of restating the classes. `PondBlock.dc.html` (read inline):
 *  10.5 / 500 / .1em / uppercase / a(.68) with NO font-family, so it inherits the
 *  block's sans. A block lives on a PAGE, so it is the page eyebrow — never the
 *  mono machine voice (atoms/kicker.ts, "two mediums"; #220). */
export const KICKER = pageEyebrowClass

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
 * The chart series ramp, re-exported from the chart layer's single definition
 * (`components/charts/chart-ramp.ts` ↔ `--chart-1…5` in globals.css) so the
 * module cards and the kind renderers can never disagree on a colour.
 */
export { CHART_SERIES_COLORS } from '@/components/charts/chart-ramp'
