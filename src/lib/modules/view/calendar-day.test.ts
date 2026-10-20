import type { PropertyDef } from '@/lib/properties/schema'
import type { CollectionRow } from './apply'
import {
  DAY_DEFAULT_DURATION_HOURS,
  DAY_GUTTER,
  DAY_HOUR_END,
  DAY_HOUR_START,
  DAY_ROW_HEIGHT,
  dayHourLabels,
  dayPeriodLabel,
  nowLineTop,
  slicedHm,
  splitDayRows,
  stepDay,
  stripWeek,
  type StripDay,
} from './calendar-day'

const dueDef: PropertyDef = { id: 'p-due', name: 'Due', type: 'date' }

const row = (id: string, due: string): CollectionRow => ({
  id,
  title: id,
  values: { 'p-due': due },
})

describe('slicedHm', () => {
  it.each([
    ['local clock', '2026-10-19T10:00:00', '10:00'],
    ['millis and Z', '2026-10-19T10:00:00.000Z', '10:00'],
    ['date only', '2026-10-19', null],
    ['bare T', '2026-10-19T', null],
    ['digits without a colon', '2026-10-19T1000', null],
    ['empty', '', null],
  ] as const)('%s', (_label, value, expected) => {
    expect(slicedHm(value)).toBe(expected)
  })
})

describe('dayPeriodLabel', () => {
  it.each([
    ['wednesday in october', '2026-10-21', 'wed 21 oct 2026'],
    ['unpadded first of the month', '2026-10-01', 'thu 1 oct 2026'],
    ['monday', '2026-10-19', 'mon 19 oct 2026'],
    ['sunday', '2026-10-25', 'sun 25 oct 2026'],
    ['january', '2026-01-01', 'thu 1 jan 2026'],
    ['december', '2026-12-31', 'thu 31 dec 2026'],
  ])('%s', (_label, iso, expected) => {
    expect(dayPeriodLabel(iso)).toBe(expected)
  })
})

describe('stepDay', () => {
  it.each([
    ['next day', '2026-10-21', 1, '2026-10-22'],
    ['previous day', '2026-10-21', -1, '2026-10-20'],
    ['month end forward', '2026-10-31', 1, '2026-11-01'],
    ['month start back', '2026-10-01', -1, '2026-09-30'],
    ['year end forward', '2026-12-31', 1, '2027-01-01'],
    ['year start back', '2027-01-01', -1, '2026-12-31'],
    ['leap day forward', '2028-02-28', 1, '2028-02-29'],
    ['leap day back', '2028-03-01', -1, '2028-02-29'],
    ['non-leap february', '2026-03-01', -1, '2026-02-28'],
    ['malformed input unchanged', 'not-a-date', 1, 'not-a-date'],
  ] as const)('%s', (_label, iso, direction, expected) => {
    expect(stepDay(iso, direction)).toBe(expected)
  })
})

describe('day grid geometry', () => {
  it('labels 08:00 through 18:00, 8 inclusive and 19 exclusive', () => {
    const labels = dayHourLabels()
    expect(DAY_HOUR_START).toBe(8)
    expect(DAY_HOUR_END).toBe(19)
    expect(labels).toHaveLength(DAY_HOUR_END - DAY_HOUR_START)
    expect(labels[0]).toBe('08:00')
    expect(labels[labels.length - 1]).toBe('18:00')
    expect(labels).not.toContain('07:00')
    expect(labels).not.toContain('19:00')
    expect(labels).toEqual([
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ])
  })

  it('uses the board row height and gutter for desktop and mobile', () => {
    expect(DAY_ROW_HEIGHT).toEqual({ desktop: 44, mobile: 48 })
    expect(DAY_GUTTER).toEqual({ desktop: 52, mobile: 40 })
  })
})

describe('splitDayRows', () => {
  const rows = [
    row('late', '2026-10-21T15:00:00'),
    row('dentist', '2026-10-21'),
    row('early', '2026-10-21T08:15:00Z'),
    row('reading', '2026-10-21'),
    row('millis', '2026-10-21T10:00:00.000Z'),
    row('same-a', '2026-10-21T09:00:00'),
    row('zoned', '2026-10-21T09:05:00+02:00'),
    row('same-b', '2026-10-21T09:00:30'),
    row('other-day', '2026-10-22'),
    row('other-time', '2026-10-20T09:00:00'),
    row('blank', ''),
    row('broken-clock', '2026-10-21Tnope'),
  ]

  it('keeps untimed rows in encounter order and drops other days', () => {
    const { untimed } = splitDayRows(rows, dueDef, '2026-10-21')
    expect(untimed.map((item) => item.id)).toEqual(['dentist', 'reading', 'broken-clock'])
  })

  it('orders timed rows by the sliced HH:MM and labels them with it', () => {
    const { timed } = splitDayRows(rows, dueDef, '2026-10-21')
    expect(timed.map((item) => item.timeLabel)).toEqual([
      '08:15',
      '09:00',
      '09:00',
      '09:05',
      '10:00',
      '15:00',
    ])
    expect(timed.map((item) => item.row.id)).toEqual([
      'early',
      'same-a',
      'same-b',
      'zoned',
      'millis',
      'late',
    ])
  })

  it.each([
    ['on the hour', 'late', 15, 15.5],
    ['quarter hour', 'early', 8.25, 8.75],
    ['with milliseconds', 'millis', 10, 10.5],
  ] as const)('missing end is start + 0.5h (%s)', (_label, id, startHours, endHours) => {
    const { timed } = splitDayRows(rows, dueDef, '2026-10-21')
    const item = timed.find((entry) => entry.row.id === id)
    expect(item?.startHours).toBe(startHours)
    expect(item?.endHours).toBe(endHours)
    expect(DAY_DEFAULT_DURATION_HOURS).toBe(0.5)
    expect(item?.endHours).toBe((item?.startHours ?? 0) + DAY_DEFAULT_DURATION_HOURS)
  })

  it('returns nothing when the collection has no date property', () => {
    expect(splitDayRows(rows, undefined, '2026-10-21')).toEqual({ untimed: [], timed: [] })
  })
})

describe('nowLineTop', () => {
  it.each([
    ['08:00 is the top of the grid', '2026-10-21', '2026-10-21', '08:00', 'desktop', 0],
    ['07:59 is outside', '2026-10-21', '2026-10-21', '07:59', 'desktop', null],
    ['18:00 sits ten rows down', '2026-10-21', '2026-10-21', '18:00', 'desktop', 10 * 44],
    ['19:00 is the bottom edge', '2026-10-21', '2026-10-21', '19:00', 'desktop', 11 * 44],
    ['19:01 is outside', '2026-10-21', '2026-10-21', '19:01', 'desktop', null],
    ['another day draws no line', '2026-10-21', '2026-10-22', '11:20', 'desktop', null],
    ['mobile rows are 48px', '2026-10-21', '2026-10-21', '19:00', 'mobile', 11 * 48],
    [
      '11:20 is (nowH - 8) * row height',
      '2026-10-21',
      '2026-10-21',
      '11:20',
      'desktop',
      (11 + 20 / 60 - 8) * 44,
    ],
    [
      '11:20 on mobile',
      '2026-10-21',
      '2026-10-21',
      '11:20',
      'mobile',
      (11 + 20 / 60 - 8) * 48,
    ],
  ] as const)('%s', (_label, dayIso, todayIso, nowHm, size, expected) => {
    const top = nowLineTop(dayIso, todayIso, nowHm, size)
    if (expected === null) expect(top).toBeNull()
    else expect(top).toBeCloseTo(expected)
  })
})

const stripDay = (
  iso: string,
  letter: string,
  day: number,
  isFocus: boolean,
  hasDot: boolean
): StripDay => ({ iso, letter, day, isFocus, hasDot })

/** Monday 19 Oct 2026 through Sunday 25 Oct 2026. */
const weekOf19Oct = (focusIso: string, dottedIso: string | null): StripDay[] => [
  stripDay('2026-10-19', 'm', 19, focusIso === '2026-10-19', dottedIso === '2026-10-19'),
  stripDay('2026-10-20', 't', 20, focusIso === '2026-10-20', dottedIso === '2026-10-20'),
  stripDay('2026-10-21', 'w', 21, focusIso === '2026-10-21', dottedIso === '2026-10-21'),
  stripDay('2026-10-22', 't', 22, focusIso === '2026-10-22', dottedIso === '2026-10-22'),
  stripDay('2026-10-23', 'f', 23, focusIso === '2026-10-23', dottedIso === '2026-10-23'),
  stripDay('2026-10-24', 's', 24, focusIso === '2026-10-24', dottedIso === '2026-10-24'),
  stripDay('2026-10-25', 's', 25, focusIso === '2026-10-25', dottedIso === '2026-10-25'),
]

const missingDateRow: CollectionRow = { id: 'missing', title: 'missing', values: {} }

describe('stripWeek', () => {
  it.each([
    ['Wed 2026-10-21 focuses the 21st with letter w', '2026-10-21', [], dueDef, weekOf19Oct('2026-10-21', null)],
    ['Sun 2026-10-25 is the same week, Sunday focused', '2026-10-25', [], dueDef, weekOf19Oct('2026-10-25', null)],
    ['Mon 2026-10-19 focuses Monday', '2026-10-19', [], dueDef, weekOf19Oct('2026-10-19', null)],
    [
      'Sun 2026-11-01 starts the week on 2026-10-26',
      '2026-11-01',
      [],
      dueDef,
      [
        stripDay('2026-10-26', 'm', 26, false, false),
        stripDay('2026-10-27', 't', 27, false, false),
        stripDay('2026-10-28', 'w', 28, false, false),
        stripDay('2026-10-29', 't', 29, false, false),
        stripDay('2026-10-30', 'f', 30, false, false),
        stripDay('2026-10-31', 's', 31, false, false),
        stripDay('2026-11-01', 's', 1, true, false),
      ],
    ],
    [
      'a row dated the 21st dots only the 21st',
      '2026-10-21',
      [row('optician', '2026-10-21')],
      dueDef,
      weekOf19Oct('2026-10-21', '2026-10-21'),
    ],
    [
      'an undated row dots nothing',
      '2026-10-21',
      [row('blank', '')],
      dueDef,
      weekOf19Oct('2026-10-21', null),
    ],
    [
      'a row missing its date value dots nothing',
      '2026-10-21',
      [missingDateRow],
      dueDef,
      weekOf19Oct('2026-10-21', null),
    ],
    [
      'a missing date property dots nothing',
      '2026-10-21',
      [row('optician', '2026-10-21')],
      undefined,
      weekOf19Oct('2026-10-21', null),
    ],
  ] as const)('%s', (_label, focusIso, rows, dateDef, expected) => {
    expect(stripWeek(focusIso, rows, dateDef)).toEqual(expected)
  })
})
