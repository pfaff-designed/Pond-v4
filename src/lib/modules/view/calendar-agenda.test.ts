import type { PropertyDef } from '@/lib/properties/schema'
import type { CollectionRow } from './apply'
import {
  agendaPeriodLabel,
  agendaRange,
  buildAgenda,
  stepAgenda,
  type AgendaGroup,
} from './calendar-agenda'

const dueDef: PropertyDef = { id: 'p-due', name: 'Due', type: 'date' }

const row = (title: string, due: string): CollectionRow => ({
  id: title,
  title,
  values: { 'p-due': due },
})

/**
 * Encounter order puts timed `optician` before date-only `plaster`. `skip hire`
 * is the day before the Monday; `renew` is the day after the window ends.
 */
const coming = [
  row('confirm alcove', '2026-10-19'),
  row('dentist', '2026-10-20T10:00:00'),
  row('optician', '2026-10-21T09:00:00'),
  row('plaster', '2026-10-21'),
  row('skip hire', '2026-10-18'),
  row('renew', '2026-11-02'),
]

const listed = (group: AgendaGroup): string[] => [
  ...group.rows.untimed.map((item) => item.title),
  ...group.rows.timed.map((item) => `${item.row.title} ${item.timeLabel}`),
]

describe('agendaRange', () => {
  it.each([
    ['wednesday 21 oct', '2026-10-21', '2026-10-19', '2026-11-01', 'from 19 oct'],
    ['monday 19 oct', '2026-10-19', '2026-10-19', '2026-11-01', 'from 19 oct'],
    ['monday 2 nov', '2026-11-02', '2026-11-02', '2026-11-15', 'from 2 nov'],
  ] as const)('%s', (_label, iso, start, end, period) => {
    expect(agendaRange(iso)).toEqual({ start, end })
    expect(agendaPeriodLabel(agendaRange(iso).start)).toBe(period)
    expect(period).not.toMatch(/\d{4}/)
    expect(period).not.toMatch(/from 0\d/)
  })
})

describe('stepAgenda', () => {
  it.each([
    ['forward fourteen days, not snapped to Monday', '2026-10-21', 1, '2026-11-04'],
    ['back fourteen days', '2026-10-19', -1, '2026-10-05'],
  ] as const)('%s', (_label, iso, direction, expected) => {
    expect(stepAgenda(iso, direction)).toBe(expected)
  })
})

describe('buildAgenda', () => {
  it('lists days with rows, untimed then timed, and drops rows outside the window', () => {
    const groups = buildAgenda('2026-10-19', '2026-10-19', coming, dueDef)

    expect(groups.map((group) => group.iso)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
    expect(groups.map(listed)).toEqual([
      ['confirm alcove'],
      ['dentist 10:00'],
      ['plaster', 'optician 09:00'],
    ])
    expect(groups.map((group) => group.iso)).not.toContain('2026-10-22')
    expect(listed(groups[0])).not.toContain('skip hire')
    expect(groups.flatMap(listed).join(' ')).not.toMatch(/skip hire|renew/)
  })

  it('uses the same window when focus is Wednesday of that week', () => {
    const fromMonday = buildAgenda('2026-10-19', '2026-10-19', coming, dueDef)
    const fromWednesday = buildAgenda('2026-10-21', '2026-10-19', coming, dueDef)
    expect(fromWednesday).toEqual(fromMonday)
  })

  it('keeps a value with a T timed outside 08:00–19:00', () => {
    const groups = buildAgenda(
      '2026-10-19',
      '2026-11-20',
      [row('early', '2026-10-22T07:15:00'), row('late', '2026-10-22T20:30:00')],
      dueDef
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.iso).toBe('2026-10-22')
    expect(groups[0]?.rows.untimed).toEqual([])
    expect(groups[0]?.rows.timed.map((item) => item.timeLabel)).toEqual(['07:15', '20:30'])
  })

  it('keeps today when that day has no rows and omits every other empty day', () => {
    const groups = buildAgenda('2026-10-19', '2026-10-22', [row('skip hire', '2026-10-18')], dueDef)

    expect(groups.map((group) => group.iso)).toEqual(['2026-10-22'])
    expect(groups[0]?.rows).toEqual({ untimed: [], timed: [] })
  })

  it('returns no groups for an empty window whose today is outside it', () => {
    expect(buildAgenda('2026-10-19', '2026-11-20', [], dueDef)).toEqual([])
    expect(
      buildAgenda('2026-10-19', '2026-10-05', [row('skip hire', '2026-10-18'), row('renew', '2026-11-02')], dueDef)
    ).toEqual([])
  })

  it('returns no groups when the collection has no date property', () => {
    expect(buildAgenda('2026-10-19', '2026-10-19', coming, undefined)).toEqual([])
  })

  it('includes a row on the end day and omits the day after', () => {
    const groups = buildAgenda(
      '2026-10-19',
      '2026-11-20',
      [row('last', '2026-11-01'), row('renew', '2026-11-02')],
      dueDef
    )

    expect(groups.map((group) => group.iso)).toEqual(['2026-11-01'])
    expect(listed(groups[0] as AgendaGroup)).toEqual(['last'])
  })
})
