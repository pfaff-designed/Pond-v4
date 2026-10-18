import { buildMonthGrid, dateForDrop, goToday, stepMonth } from './calendar-month'
import type { CollectionRow } from './apply'
import type { PropertyDef } from '@/lib/properties/schema'

const dueDef: PropertyDef = { id: 'p-due', name: 'Due', type: 'date' }

const row = (id: string, due: string): CollectionRow => ({
  id,
  title: id,
  values: { 'p-due': due },
})

describe('buildMonthGrid', () => {
  it('builds the whole-week grid around the focused month (gStart/nWeeks)', () => {
    // September 2026: 1st is a Tuesday, so the grid starts Monday 31 aug and
    // needs 5 weeks to cover the 30 days (ceil((1 + 30) / 7)).
    const grid = buildMonthGrid('2026-09-15', '2026-09-23', [], dueDef)

    expect(grid.periodLabel).toBe('september 2026')
    expect(grid.weeks).toHaveLength(5)
    grid.weeks.forEach((week) => expect(week.days).toHaveLength(7))
    expect(grid.weeks[0].days[0].iso).toBe('2026-08-31')
    expect(grid.weeks[0].days[0].inMonth).toBe(false)
    expect(grid.weeks[4].days[6].iso).toBe('2026-10-04')
    expect(grid.weeks[4].days[6].inMonth).toBe(false)
    const firstOfMonth = grid.weeks[0].days[1]
    expect(firstOfMonth.iso).toBe('2026-09-01')
    expect(firstOfMonth.inMonth).toBe(true)
    expect(firstOfMonth.dayOfMonth).toBe(1)
  })

  it('marks the today cell', () => {
    const grid = buildMonthGrid('2026-09-15', '2026-09-23', [], dueDef)
    const todayCell = grid.weeks.flatMap((w) => w.days).find((d) => d.iso === '2026-09-23')
    expect(todayCell?.isToday).toBe(true)
    const otherCell = grid.weeks.flatMap((w) => w.days).find((d) => d.iso === '2026-09-22')
    expect(otherCell?.isToday).toBe(false)
  })

  it('caps a day at 3 items and reports the overflow count', () => {
    const rows = [
      row('r1', '2026-09-23'),
      row('r2', '2026-09-23'),
      row('r3', '2026-09-23'),
      row('r4', '2026-09-23'),
    ]
    const grid = buildMonthGrid('2026-09-15', '2026-09-23', rows, dueDef)
    const cell = grid.weeks.flatMap((w) => w.days).find((d) => d.iso === '2026-09-23')
    expect(cell?.items).toHaveLength(3)
    expect(cell?.moreCount).toBe(1)
  })

  it('leaves an under-filled day with no overflow', () => {
    const rows = [row('r1', '2026-09-23'), row('r2', '2026-09-23')]
    const grid = buildMonthGrid('2026-09-15', '2026-09-23', rows, dueDef)
    const cell = grid.weeks.flatMap((w) => w.days).find((d) => d.iso === '2026-09-23')
    expect(cell?.items).toHaveLength(2)
    expect(cell?.moreCount).toBe(0)
  })

  it('buckets a datetime value by its date part', () => {
    const rows = [row('r1', '2026-09-23T09:30:00')]
    const grid = buildMonthGrid('2026-09-15', '2026-09-23', rows, dueDef)
    const cell = grid.weeks.flatMap((w) => w.days).find((d) => d.iso === '2026-09-23')
    expect(cell?.items.map((r) => r.id)).toEqual(['r1'])
  })

  it('drops a row with no date value', () => {
    const rows = [row('r1', '')]
    const grid = buildMonthGrid('2026-09-15', '2026-09-23', rows, dueDef)
    grid.weeks
      .flatMap((w) => w.days)
      .forEach((cell) => {
        expect(cell.items).toHaveLength(0)
      })
  })
})

describe('stepMonth', () => {
  it('moves the focus to the 1st of the next month', () => {
    expect(stepMonth('2026-09-15', 1)).toBe('2026-10-01')
  })

  it('moves the focus to the 1st of the previous month', () => {
    expect(stepMonth('2026-09-15', -1)).toBe('2026-08-01')
  })

  it('rolls the year over at a december/january boundary', () => {
    expect(stepMonth('2026-12-10', 1)).toBe('2027-01-01')
    expect(stepMonth('2027-01-10', -1)).toBe('2026-12-01')
  })

  it('reflects in the built grid', () => {
    const next = buildMonthGrid(stepMonth('2026-09-15', 1), '2026-09-23', [], dueDef)
    expect(next.periodLabel).toBe('october 2026')
  })
})

describe('dateForDrop', () => {
  it.each([
    ['date-only', '2026-09-12', '2026-09-15', '2026-09-15'],
    ['datetime with seconds', '2026-09-12T09:30:45', '2026-09-15', '2026-09-15T09:30:45'],
    ['datetime with zone', '2026-09-12T09:30:00+02:00', '2026-09-15', '2026-09-15T09:30:00+02:00'],
    ['cross-month', '2026-09-28T09:30:00Z', '2026-10-02', '2026-10-02T09:30:00Z'],
    ['cross-year', '2026-12-28T09:30:00Z', '2027-01-03', '2027-01-03T09:30:00Z'],
    ['leap day', '2027-02-27T09:30:00Z', '2028-02-29', '2028-02-29T09:30:00Z'],
  ])('%s', (_label, value, dayIso, expected) => {
    expect(dateForDrop(value, dayIso)).toBe(expected)
  })

  it('treats a non-string or missing value as date-only', () => {
    expect(dateForDrop(undefined, '2026-09-15')).toBe('2026-09-15')
    expect(dateForDrop(null, '2026-09-15')).toBe('2026-09-15')
    expect(dateForDrop(42, '2026-09-15')).toBe('2026-09-15')
  })
})

describe('goToday', () => {
  it('returns today unchanged, so the grid resolves to the current month', () => {
    expect(goToday('2026-09-23')).toBe('2026-09-23')
    const grid = buildMonthGrid(goToday('2026-09-23'), '2026-09-23', [], dueDef)
    expect(grid.periodLabel).toBe('september 2026')
  })
})
