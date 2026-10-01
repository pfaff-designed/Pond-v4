import { isValidDate, safeShortDate, safeWeekdayDate, shortDateFmt } from './chart-formatters'

describe('safe date formatters (#94 regression)', () => {
  it('formats a real date exactly like the raw formatter', () => {
    const d = new Date('2026-09-10T12:00:00Z')
    expect(safeShortDate(d)).toBe(shortDateFmt.format(d))
  })

  it('never throws on an Invalid Date — the RangeError that killed the page', () => {
    const bad = new Date('o-rent')
    expect(() => shortDateFmt.format(bad)).toThrow(RangeError)
    expect(safeShortDate(bad)).toBe('')
    expect(safeWeekdayDate(bad)).toBe('')
    expect(isValidDate(bad)).toBe(false)
    expect(isValidDate(new Date(0))).toBe(true)
  })
})
