import { formatAtomDate, localToday, parseDateInput } from './date-input'

/** `today` fixed at UTC noon, same discipline the parser itself keeps. */
const TODAY = new Date('2026-09-16T12:00:00Z') // a Wednesday

/** The next `name`-weekday strictly after `TODAY`, found the dumb way (brute-force
 *  day-by-day), independent of the parser, so the weekday assertions below don't
 *  just restate the implementation. */
const nextWeekdayAfter = (name: string): string => {
  const names = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  const target = names.indexOf(name)
  for (let n = 1; n <= 7; n++) {
    const d = new Date(TODAY.getTime() + n * 86_400_000)
    if (d.getUTCDay() === target) return d.toISOString().slice(0, 10)
  }
  throw new Error('unreachable')
}

describe('parseDateInput', () => {
  it('clears on empty or whitespace-only text', () => {
    expect(parseDateInput('', TODAY)).toBe('empty')
    expect(parseDateInput('   ', TODAY)).toBe('empty')
  })

  it('resolves today/tomorrow/yesterday', () => {
    expect(parseDateInput('today', TODAY)).toBe('2026-09-16')
    expect(parseDateInput('tomorrow', TODAY)).toBe('2026-09-17')
    expect(parseDateInput('yesterday', TODAY)).toBe('2026-09-15')
    expect(parseDateInput('Tomorrow', TODAY)).toBe('2026-09-17')
    expect(parseDateInput('  today  ', TODAY)).toBe('2026-09-16')
  })

  it('resolves a weekday name to the next one strictly after today, short or long', () => {
    expect(parseDateInput('wednesday', TODAY)).toBe(nextWeekdayAfter('wednesday'))
    expect(parseDateInput('wed', TODAY)).toBe(nextWeekdayAfter('wednesday'))
    expect(parseDateInput('fri', TODAY)).toBe(nextWeekdayAfter('friday'))
    expect(parseDateInput('Friday', TODAY)).toBe(nextWeekdayAfter('friday'))
  })

  it('resolves "23 sep" and "sep 23" in today\'s year', () => {
    expect(parseDateInput('23 sep', TODAY)).toBe('2026-09-23')
    expect(parseDateInput('sep 23', TODAY)).toBe('2026-09-23')
    expect(parseDateInput('3 Oct', TODAY)).toBe('2026-10-03')
  })

  it('resolves day/month slash dates (day-first) in today\'s year', () => {
    expect(parseDateInput('23/9', TODAY)).toBe('2026-09-23')
    expect(parseDateInput('01/12', TODAY)).toBe('2026-12-01')
  })

  it('resolves ISO yyyy-mm-dd', () => {
    expect(parseDateInput('2026-10-20', TODAY)).toBe('2026-10-20')
  })

  it('rejects a day that does not exist in its month', () => {
    expect(parseDateInput('31/2', TODAY)).toBeNull()
    expect(parseDateInput('30 feb', TODAY)).toBeNull()
  })

  it('rejects an out-of-range ISO month', () => {
    expect(parseDateInput('2026-13-01', TODAY)).toBeNull()
  })

  it('rejects garbage text', () => {
    expect(parseDateInput('foo', TODAY)).toBeNull()
    expect(parseDateInput('next thursday', TODAY)).toBeNull()
    expect(parseDateInput('13', TODAY)).toBeNull()
  })
})

describe('localToday', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('stays on the local calendar day late in the evening, even when UTC has already rolled over', () => {
    // Stand-in whose LOCAL getters read 16 Oct 2026 while its UTC getters read 17 Oct —
    // true on any machine's zone, since the local getters are mocked directly rather than
    // produced by setting process.env.TZ (which Node reads once and caches, so it is a
    // no-op at runtime and the real local/UTC split only matches on a New York host).
    const lateEvening = new Date(Date.UTC(2026, 9, 17, 3, 0, 0))
    expect(lateEvening.getUTCDate()).toBe(17)
    jest.spyOn(lateEvening, 'getFullYear').mockReturnValue(2026)
    jest.spyOn(lateEvening, 'getMonth').mockReturnValue(9)
    jest.spyOn(lateEvening, 'getDate').mockReturnValue(16)

    const today = localToday(lateEvening)
    expect(today.getUTCFullYear()).toBe(2026)
    expect(today.getUTCMonth()).toBe(9)
    expect(today.getUTCDate()).toBe(16)
  })
})

describe('formatAtomDate', () => {
  it('reads day then lowercase short month', () => {
    expect(formatAtomDate('2026-09-19')).toBe('19 sep')
    expect(formatAtomDate('2026-01-01')).toBe('1 jan')
    expect(formatAtomDate('2026-12-31')).toBe('31 dec')
  })

  it('reads the day part of a datetime value', () => {
    expect(formatAtomDate('2026-09-23T09:30:00')).toBe('23 sep')
  })

  it('falls back to the raw string when the day part still does not parse', () => {
    expect(formatAtomDate('not-a-date')).toBe('not-a-date')
  })
})
