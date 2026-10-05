/**
 * The list's groups (`Pond 06.21` 6v): rows bucketed by when they are due, measured
 * from a fixed Wednesday (2026-10-21) so no weekday of the run can move a boundary.
 */
import { groupRowsByDue, isRowDone, pickDoneState } from './due-buckets'
import type { CollectionRow } from './apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  {
    id: 's',
    name: 'status',
    type: 'status',
    options: [
      { id: 'todo', label: 'to do' },
      { id: 'done', label: 'Done' },
    ],
  },
  { id: 'd', name: 'due', type: 'date' },
]

const WED = new Date(2026, 9, 21)
const row = (id: string, due: string | null, status = 'todo'): CollectionRow => ({
  id,
  title: id,
  values: { s: status, ...(due ? { d: due } : {}) },
})

const bucketsOf = (rows: CollectionRow[], now = WED) =>
  Object.fromEntries(
    groupRowsByDue(rows, schema, now)!.buckets.map((b) => [b.id, b.rows.map((r) => r.id)])
  )

describe('groupRowsByDue', () => {
  it('is null when the collection has no date property', () => {
    expect(groupRowsByDue([], schema.slice(0, 1), WED)).toBeNull()
  })

  it('draws 6v’s four buckets in 6v’s order', () => {
    const grouped = groupRowsByDue(
      [
        row('done-one', '2026-10-19', 'done'),
        row('next', '2026-10-26'),
        row('week', '2026-10-23'),
        row('now', '2026-10-21'),
      ],
      schema,
      WED
    )!
    expect(grouped.buckets.map((b) => b.id)).toEqual(['today', 'this week', 'next week', 'done'])
  })

  it('omits a bucket with no rows', () => {
    expect(Object.keys(bucketsOf([row('a', '2026-10-21')]))).toEqual(['today'])
  })

  it('weeks run Monday to Sunday', () => {
    const b = bucketsOf([
      row('sun', '2026-10-25'),
      row('mon', '2026-10-26'),
      row('next-sun', '2026-11-01'),
      row('after', '2026-11-02'),
    ])
    expect(b['this week']).toEqual(['sun'])
    expect(b['next week']).toEqual(['mon', 'next-sun'])
    expect(b.later).toEqual(['after'])
  })

  it('on a Sunday, today closes the week it is in', () => {
    const sunday = new Date(2026, 9, 25)
    const b = bucketsOf([row('mon', '2026-10-26'), row('prev', '2026-10-24')], sunday)
    expect(b['next week']).toEqual(['mon'])
    expect(b.earlier).toEqual(['prev'])
  })

  it('a record that fits none of 6v’s four is still shown', () => {
    const b = bucketsOf([row('past', '2026-10-20'), row('undated', null), row('far', '2027-01-01')])
    expect(b).toEqual({ earlier: ['past'], later: ['far'], 'no date': ['undated'] })
  })

  it('a done record is done whatever its date says', () => {
    const b = bucketsOf([row('x', '2026-10-21', 'done'), row('y', null, 'done')])
    expect(b).toEqual({ done: ['x', 'y'] })
  })

  it('runs an open bucket earliest-first and keeps the view’s order within a day', () => {
    const b = bucketsOf([
      row('fri', '2026-10-23'),
      row('thu-a', '2026-10-22'),
      row('thu-b', '2026-10-22'),
    ])
    expect(b['this week']).toEqual(['thu-a', 'thu-b', 'fri'])
  })

  it('keeps the view’s own order in done', () => {
    const b = bucketsOf([row('a', '2026-10-13', 'done'), row('b', '2026-10-19', 'done')])
    expect(b.done).toEqual(['a', 'b'])
  })

  it('reads a datetime value as its day', () => {
    expect(bucketsOf([row('t', '2026-10-21T09:00:00Z')]).today).toEqual(['t'])
  })

  it('groupBy may name the date property', () => {
    const two: PropertySchema = [...schema, { id: 'd2', name: 'start', type: 'date' }]
    const rows: CollectionRow[] = [
      { id: 'r', title: 'r', values: { s: 'todo', d: '2026-10-21', d2: '2026-10-26' } },
    ]
    expect(groupRowsByDue(rows, two, WED, 'd2')!.buckets[0].id).toBe('next week')
  })
})

describe('pickDoneState', () => {
  it('writes the option labelled done and unticks to the first that is not', () => {
    const state = pickDoneState(schema)!
    expect(state.def.id).toBe('s')
    expect(state.doneId).toBe('done')
    expect(state.openId).toBe('todo')
  })

  it('is null when the status has no done option — a tick would have nothing to write', () => {
    const noDone: PropertySchema = [
      {
        id: 's',
        name: 'status',
        type: 'status',
        options: [
          { id: 'a', label: 'open' },
          { id: 'b', label: 'closed' },
        ],
      },
      { id: 'd', name: 'due', type: 'date' },
    ]
    expect(pickDoneState(noDone)).toBeNull()
    expect(groupRowsByDue([row('a', '2026-10-21', 'a')], noDone, WED)!.done).toBeNull()
  })

  it('is null with no status or select at all', () => {
    expect(pickDoneState([{ id: 'd', name: 'due', type: 'date' }])).toBeNull()
  })

  it('reads a legacy label-stored value as its option', () => {
    const state = pickDoneState(schema)!
    expect(isRowDone({ id: 'x', title: 'x', values: { s: 'done' } }, state)).toBe(true)
    expect(isRowDone({ id: 'x', title: 'x', values: { s: 'Done' } }, state)).toBe(true)
    expect(isRowDone({ id: 'x', title: 'x', values: { s: 'todo' } }, state)).toBe(false)
    expect(isRowDone({ id: 'x', title: 'x', values: {} }, state)).toBe(false)
    expect(isRowDone({ id: 'x', title: 'x', values: { s: 'done' } }, null)).toBe(false)
  })
})
