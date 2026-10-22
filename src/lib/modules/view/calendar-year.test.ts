import { stepYear, yearPeriodLabel } from './calendar-year'

describe('year span', () => {
  it('labels the focused year', () => {
    expect(yearPeriodLabel('2026-10-19')).toBe('2026')
  })

  it('steps a whole year and keeps the month and day', () => {
    expect(stepYear('2026-10-19', 1)).toBe('2027-10-19')
    expect(stepYear('2026-10-19', -1)).toBe('2025-10-19')
  })

  it('clamps 29 February onto 28 February in a common year', () => {
    expect(stepYear('2024-02-29', 1)).toBe('2025-02-28')
    expect(stepYear('2023-02-28', -1)).toBe('2022-02-28')
  })
})
