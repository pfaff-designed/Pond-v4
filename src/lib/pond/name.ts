'use client'

/**
 * The pond's name — what the rail header shows. It comes from the pond row; the
 * constant below is the only fallback, used outside the shell's `PondProvider`
 * (Storybook, an envless render) or before migration 0018 made the table. It is
 * lowercase because nothing downstream transforms the name's case.
 */

import { usePond } from './context'

export function defaultPondName(): string {
  return 'life'
}

/** No board value exists; a pond's name renders in the rail head and the switcher
 *  menu, so a generous title length rather than the field's own cap. `PAGE_NAME_MAX`
 *  (`page-proposals.ts`) caps a proposed page's name, a different fact. */
export const POND_NAME_MAX = 80

/** `v.slice(0, n)` cuts UTF-16 code units, splitting a surrogate pair (an emoji)
 *  in two and storing the lone leading half. Clamp by code point instead. */
export const clampPondName = (v: string) => Array.from(v).slice(0, POND_NAME_MAX).join('')

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
