/**
 * Shared gantt-rendering fragments (#11) — the pieces the #27 collection gantt
 * VIEW MODE (view/view.tsx) and the standalone read-only `timeline` MODULE
 * (timeline/view.tsx) must draw identically. Kept in ONE place so the two
 * renderers can never drift: the axis tick label and the bar rectangle's look.
 */

/** A short "Sep 8" tick label for a gridline, built at UTC noon so it never drifts. */
export function formatTick(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** The bar rectangle's shared look — the gantt view mode's editable wrapper, its
 *  read-only bar, and the timeline module's bar all draw the same shape (position +
 *  fill), differing only in what they carry (grab zones vs an aria label). */
export const GANTT_BAR_SHELL =
  'absolute top-0.5 bottom-0.5 min-w-[0.5rem] rounded-sm bg-press-accent/80'
