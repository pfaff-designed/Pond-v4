'use client'

import { useMemo } from 'react'
import type { ModuleViewProps } from '../types'
import type { TimelineBlock } from './schema'
import { layoutTimeline } from './data'
import { KICKER } from '../chart/card'
import { addDays, epochDay } from '../view/apply'
import { formatTick, GANTT_BAR_SHELL } from '../view/gantt-shared'

/**
 * `timeline` view (#11). Read-only, like the promoted charts: composed by the
 * AI, never hand-dragged — no drag, no ResizeObserver, no edge handles (that is
 * the #27 gantt view mode's job, over a real collection). Draws the same surface
 * as the view mode's read-only branch: a fixed label gutter, a weekly axis
 * header, gridlines every 7th day off the range start, and one shared-shell bar
 * per item — all positioned by the UTC-stable `epochDay` math. Chrome mirrors
 * the heatmap module card (kicker title, muted caption, calm empty state).
 */
export function TimelineView({ data }: ModuleViewProps<TimelineBlock>) {
  const layout = useMemo(() => layoutTimeline(data.items ?? []), [data.items])
  const { bars, rangeStart, rangeEnd } = layout

  const empty = bars.length === 0 || !rangeStart || !rangeEnd

  // The axis span + gridline positions — same math as the view mode's gantt.
  const totalDays = empty ? 1 : Math.max(1, epochDay(rangeEnd!) - epochDay(rangeStart!) + 1)
  const startDay = empty ? 0 : epochDay(rangeStart!)
  const pct = (day: number) => ((day - startDay) / totalDays) * 100

  // Weekly gridlines from the first day through the range end (Mon-agnostic —
  // just every 7th day off the start), each labelled with its month/day.
  const ticks: { iso: string; left: number }[] = []
  if (!empty) {
    for (let d = 0; d < totalDays; d += 7) {
      const iso = addDays(rangeStart!, d)
      ticks.push({ iso, left: pct(epochDay(iso)) })
    }
  }

  return (
    <div className="text-sm text-zinc-800">
      {data.title && <div className={KICKER}>{data.title}</div>}
      {data.caption && <div className="mt-0.5 text-xs text-zinc-500">{data.caption}</div>}

      {empty ? (
        <div className="mt-2 rounded-sm border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400">
          No data yet
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <div className="min-w-[28rem]">
            {/* Axis header — weekly tick labels aligned to their gridlines. */}
            <div className="relative mb-1 ml-40 h-4">
              {ticks.map((t) => (
                <span
                  key={t.iso}
                  className="absolute top-0 -translate-x-1/2 text-[0.6rem] whitespace-nowrap text-press-muted tabular-nums"
                  style={{ left: `${t.left}%` }}
                >
                  {formatTick(t.iso)}
                </span>
              ))}
            </div>

            {/* One row per bar: a fixed label column + a proportional track. */}
            <ul role="list" className="space-y-1.5">
              {bars.map(({ id, label, startIso, endIso }) => {
                const left = pct(epochDay(startIso))
                // +1 so an inclusive single-day span still has visible width.
                const width = ((epochDay(endIso) - epochDay(startIso) + 1) / totalDays) * 100
                const span = startIso === endIso ? startIso : `${startIso} – ${endIso}`
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-xs font-medium text-press-ink">
                      {label || 'Untitled'}
                    </span>
                    <span className="relative h-5 flex-1">
                      {/* Weekly gridlines behind the bar. */}
                      {ticks.map((t) => (
                        <span
                          key={t.iso}
                          aria-hidden
                          className="absolute top-0 bottom-0 border-l border-press-hair"
                          style={{ left: `${t.left}%` }}
                        />
                      ))}
                      <span
                        role="img"
                        aria-label={`${label || 'Untitled'}: ${span}`}
                        className={GANTT_BAR_SHELL}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
