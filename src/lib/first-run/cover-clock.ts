/**
 * The cover's header row (6d f1): place, then weekday + date, then time —
 * `richmond va` · `tuesday 22 september` · `07:12`. The header's own CSS
 * uppercases these; the strings stay lowercase so they read the same
 * wherever else they might be reused.
 */

/** The IANA zone's last segment as its place label: `America/New_York` → `new york`. */
export function timezoneCity(tz: string): string {
  const city = tz.split('/').pop() ?? tz
  return city.replace(/_/g, ' ').toLowerCase()
}

export interface CoverClock {
  weekday: string
  dateLabel: string
  time: string
}

/** `{ weekday: 'tuesday', dateLabel: '22 september', time: '07:12' }` for a given instant. */
export function formatCoverClock(date: Date): CoverClock {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const month = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return { weekday, dateLabel: `${date.getDate()} ${month}`, time: `${hours}:${minutes}` }
}
