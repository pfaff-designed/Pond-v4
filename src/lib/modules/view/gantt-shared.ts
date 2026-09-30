import { addDays } from './apply'

/**
 * Shared gantt-rendering fragments (#11) — the pieces the #27 collection gantt
 * VIEW MODE (view/view.tsx) and the standalone read-only `timeline` MODULE
 * (timeline/view.tsx) must draw identically. Kept in ONE place so the two
 * renderers can never drift: the axis tick label, the tick-selection math, and
 * the bar rectangle's look.
 */

/** Minimum on-screen px between tick labels before neighbours collide (#57):
 *  a "Sep 22"-shaped label (~34px at text-[0.6rem]) plus breathing room. */
export const MIN_TICK_SPACING_PX = 44

/** One axis tick: its ISO day and its % offset from the track's left edge. */
export interface GanttTick {
  iso: string
  left: number
}

/**
 * The axis ticks both renderers draw (#57): every 7th day off the range start,
 * THINNED to the smallest weekly multiple whose on-screen spacing clears
 * MIN_TICK_SPACING_PX at the measured track width — so date labels never
 * overlap, however narrow the card — and with any tick dropped whose centred
 * label would spill past the track's right edge and get cut off. An unmeasured
 * track (0 — first render, jsdom) keeps the weekly baseline unthinned.
 */
export function buildTicks(rangeStart: string, totalDays: number, trackPx: number): GanttTick[] {
  let stepDays = 7
  if (trackPx > 0) {
    while (stepDays < totalDays && (stepDays / totalDays) * trackPx < MIN_TICK_SPACING_PX) {
      stepDays += 7
    }
  }
  const ticks: GanttTick[] = []
  for (let d = 0; d < totalDays; d += stepDays) {
    const left = (d / totalDays) * 100
    // The label is centred on its gridline (-translate-x-1/2): within half a
    // label of the right edge it would render clipped, so the tick goes.
    if (trackPx > 0 && (left / 100) * trackPx > trackPx - MIN_TICK_SPACING_PX / 2) continue
    ticks.push({ iso: addDays(rangeStart, d), left })
  }
  return ticks
}

/** A short "Sep 8" tick label for a gridline, built at UTC noon so it never drifts. */
export function formatTick(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** The bar rectangle's shared look — the gantt view mode's editable wrapper, its
 *  read-only bar, and the timeline module's bar all draw the same shape (position +
 *  fill), differing only in what they carry (grab zones vs an aria label). */
export const GANTT_BAR_SHELL =
  'absolute top-0.5 bottom-0.5 min-w-[0.5rem] rounded-sm bg-mn-text/80'
