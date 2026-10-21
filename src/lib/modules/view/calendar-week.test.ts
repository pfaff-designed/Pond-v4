import { stepWeek, weekPeriodLabel, weekRange } from './calendar-week'

const EN_DASH = '\u2013'

describe('weekRange', () => {
  it.each([
    ['wednesday', '2026-10-21', '2026-10-19', '2026-10-25'],
    ['monday', '2026-10-19', '2026-10-19', '2026-10-25'],
    ['sunday', '2026-10-25', '2026-10-19', '2026-10-25'],
    ['sunday crossing into november', '2026-11-01', '2026-10-26', '2026-11-01'],
  ] as const)('%s', (_label, iso, start, end) => {
    expect(weekRange(iso)).toEqual({ start, end })
  })
})

describe('stepWeek', () => {
  it.each([
    ['forward a week', '2026-10-21', 1, '2026-10-28'],
    ['forward across a month end', '2026-10-28', 1, '2026-11-04'],
    ['back across a month end', '2026-10-01', -1, '2026-09-24'],
  ] as const)('%s', (_label, iso, direction, expected) => {
    expect(stepWeek(iso, direction)).toBe(expected)
  })
})

describe('weekPeriodLabel', () => {
  it.each([
    ['same month', '2026-10-19', '2026-10-25', `19 ${EN_DASH} 25 oct 2026`],
    ['different months', '2026-10-26', '2026-11-01', `26 oct ${EN_DASH} 1 nov 2026`],
    ['year boundary, end year only', '2026-12-28', '2027-01-03', `28 dec ${EN_DASH} 3 jan 2027`],
  ] as const)('%s', (_label, startIso, endIso, expected) => {
    expect(weekPeriodLabel(startIso, endIso)).toBe(expected)
    expect(expected.includes(EN_DASH)).toBe(true)
    expect(expected.includes('-')).toBe(false)
  })
})
