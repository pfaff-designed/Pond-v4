/**
 * The board card's due atom (`Pond 02` 2u `due`, drawn on 6u.1's cards): a date reads
 * `wed 23`, and today reads `today`. Pure, so the clock is the caller's argument.
 */

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type DueAtom = { kind: 'today' } | { kind: 'date'; label: string }

const pad = (n: number): string => String(n).padStart(2, '0')

/** A stored `YYYY-MM-DD` (or datetime) value as the atom; null when it is not a date. */
export function dueAtom(value: string, now: Date): DueAtom | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const iso = `${m[1]}-${m[2]}-${m[3]}`
  if (iso === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`) {
    return { kind: 'today' }
  }
  // Local midnight, so the weekday never drifts a day with the timezone.
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return { kind: 'date', label: `${WEEKDAYS[day.getDay()]} ${day.getDate()}` }
}
