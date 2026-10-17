/**
 * The date atom's `editing` parser (KAN-350, shared with KAN-110): free text to an
 * ISO `YYYY-MM-DD` day, so the keyboard path (type `fri`, press ↵) never needs a
 * native date picker. Pure, no React, no Supabase — `today` is injected so the
 * result is deterministic in tests and at the caller's clock, never `Date.now()`.
 *
 * Dates are kept as UTC calendar parts throughout (never local time), the same
 * discipline `apply.ts`'s `epochDay`/`addDays` and `gantt-shared.ts`'s `formatTick`
 * use — a day never drifts across a timezone or DST boundary.
 */

const SHORT_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const
const SHORT_WEEKDAYS = WEEKDAYS.map((day) => day.slice(0, 3))

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

const isoFromParts = (year: number, month: number, day: number): string =>
  `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`

const utcParts = (date: Date): [number, number, number] => [
  date.getUTCFullYear(),
  date.getUTCMonth() + 1,
  date.getUTCDate(),
]

/** Calendar parts `n` days from `(year, month, day)`, stepping whole UTC days. */
const shiftParts = (
  year: number,
  month: number,
  day: number,
  n: number
): [number, number, number] => {
  const ms = Date.UTC(year, month - 1, day) + n * 86_400_000
  return utcParts(new Date(ms))
}

/**
 * `(year, month, day)` validated by round-tripping through `Date.UTC`: an
 * out-of-range day or month rolls into the next period instead of throwing, so a
 * mismatch after the round trip means the input never named a real day
 * (`31/2`, month `13`). Returns the ISO string, or `null` when it doesn't hold.
 */
const toISOIfValid = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day))
  const holds =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return holds ? isoFromParts(year, month, day) : null
}

/**
 * `today`, as midnight UTC on the LOCAL calendar day — never `new Date()` passed
 * straight to the parser, which reads UTC parts off a local clock: after local
 * midnight but before UTC midnight (e.g. 8pm EDT), `new Date()`'s UTC day is
 * already tomorrow.
 */
export function localToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/**
 * Free text → an ISO day, `'empty'` (the draft clears the value), or `null` (the
 * text names no real day). Accepts, case-insensitively and trimmed: `today`,
 * `tomorrow`, `yesterday`; a weekday name, short or long, which resolves to the
 * next one strictly *after* `today` (typing today's own weekday means next week,
 * never today); `23 sep` / `sep 23` in `today`'s year; `23/9` day/month (Pond is
 * day-first) in `today`'s year; and ISO `YYYY-MM-DD`.
 */
export function parseDateInput(text: string, today: Date): string | null | 'empty' {
  const trimmed = text.trim()
  if (trimmed === '') return 'empty'

  const lower = trimmed.toLowerCase()
  const [todayYear, todayMonth, todayDay] = utcParts(today)

  if (lower === 'today') return isoFromParts(todayYear, todayMonth, todayDay)
  if (lower === 'tomorrow') return isoFromParts(...shiftParts(todayYear, todayMonth, todayDay, 1))
  if (lower === 'yesterday') {
    return isoFromParts(...shiftParts(todayYear, todayMonth, todayDay, -1))
  }

  const weekdayIndex =
    WEEKDAYS.indexOf(lower as (typeof WEEKDAYS)[number]) !== -1
      ? WEEKDAYS.indexOf(lower as (typeof WEEKDAYS)[number])
      : SHORT_WEEKDAYS.indexOf(lower)
  if (weekdayIndex !== -1) {
    const todayIndex = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay)).getUTCDay()
    const daysAhead = (weekdayIndex - todayIndex + 7) % 7 || 7
    return isoFromParts(...shiftParts(todayYear, todayMonth, todayDay, daysAhead))
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (iso) return toISOIfValid(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dayThenMonth = /^(\d{1,2})\s+([a-z]+)$/.exec(lower)
  if (dayThenMonth) {
    const monthIndex = SHORT_MONTHS.indexOf(dayThenMonth[2].slice(0, 3) as (typeof SHORT_MONTHS)[number])
    if (monthIndex === -1) return null
    return toISOIfValid(todayYear, monthIndex + 1, Number(dayThenMonth[1]))
  }

  const monthThenDay = /^([a-z]+)\s+(\d{1,2})$/.exec(lower)
  if (monthThenDay) {
    const monthIndex = SHORT_MONTHS.indexOf(monthThenDay[1].slice(0, 3) as (typeof SHORT_MONTHS)[number])
    if (monthIndex === -1) return null
    return toISOIfValid(todayYear, monthIndex + 1, Number(monthThenDay[2]))
  }

  const dayMonthSlash = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed)
  if (dayMonthSlash) {
    return toISOIfValid(todayYear, Number(dayMonthSlash[2]), Number(dayMonthSlash[1]))
  }

  return null
}

/**
 * `19 sep` — the atom's rest/preview format: day, then the lowercase short month.
 * Pinned to `en-US`, read at UTC noon: `en-GB` writes `sept`, and reading at
 * midnight risks a local timezone pulling the day back across the boundary.
 *
 * `PropertyDef` dates (`schema.ts`) store an ISO date OR datetime, so only the
 * first 10 chars (the `YYYY-MM-DD` day part) are read here — matching
 * `calendar-month.ts`'s/`apply.ts`'s own `value.slice(0, 10)` convention — and a
 * day part that still doesn't parse falls back to the raw string rather than
 * rendering `NaN`.
 */
export function formatAtomDate(iso: string): string {
  const day = iso.slice(0, 10)
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase()
  return `${date.getUTCDate()} ${month}`
}
