'use client'

/**
 * The pond's name — what the rail header shows (AUDIT C3, trimmed by ADR 0002
 * to a NAME: no chevron, no switcher in the head itself).
 *
 * Since #312 there IS a pond row to read, so the name comes from it. The
 * constant below is the only fallback left: outside the shell's `PondProvider`
 * (Storybook, an envless render) or before migration 0018 made the table, where
 * the first pond is always `life`.
 *
 * Lowercase (#101 review): the rail's source copy in `Pond 05 Shell` is
 * lowercase throughout (life, personal, journal, notes) and the capitals in the
 * boards are the eyebrow's own `text-transform: uppercase`, a presentational
 * rule the CSS already carries. The data is lowercase; the transform is the view's.
 */

import { usePond } from './context'

export function defaultPondName(): string {
  return 'life'
}

/**
 * The active pond's name (#312) — the pond the shell resolved from `?pond=`.
 *
 * Until this read the pond row, every surface showing a pond name showed `life`
 * regardless of which pond you were in: a new pond's rail root read `life` while
 * its header read the pond's real name.
 */
export function usePondName(): string {
  const { pond } = usePond()
  return pond?.name ?? defaultPondName()
}
