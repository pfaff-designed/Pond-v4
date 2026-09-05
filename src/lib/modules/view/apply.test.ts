/**
 * view/apply.ts — the pure filter / sort / group core (#19 slice 3).
 *
 * Guards the row math every view mode depends on: single-clause filter across the
 * operators, sort that sinks empties, select/status grouping into option buckets +
 * a trailing "no value" bucket, and the leniency that keeps a stale clause or an
 * off-schema value from ever blanking or crashing a view.
 */
import {
  applyView,
  displayValue,
  filterRows,
  groupRows,
  groupRowsByDate,
  pickDateDef,
  sortRows,
  type CollectionRow,
} from './apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do', color: 'zinc' },
      { id: 'o-doing', label: 'Doing', color: 'amber' },
      { id: 'o-done', label: 'Done', color: 'green' },
    ],
  },
  { id: 'p-priority', name: 'Priority', type: 'number' },
  { id: 'p-notes', name: 'Notes', type: 'text' },
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-fired', name: 'Fired', type: 'checkbox' },
]

const rows: CollectionRow[] = [
  {
    id: 'r1',
    title: 'Trim rim',
    values: {
      'p-status': 'o-doing',
      'p-priority': 2,
      'p-notes': 'lathe',
      'p-due': '2026-09-10',
      'p-fired': false,
    },
  },
  {
    id: 'r2',
    title: 'Glaze test',
    values: {
      'p-status': 'o-done',
      'p-priority': 1,
      'p-notes': 'celadon',
      'p-due': '2026-09-01',
      'p-fired': true,
    },
  },
  {
    id: 'r3',
    title: 'Wedge clay',
    values: {
      'p-status': 'o-todo',
      'p-priority': 3,
      'p-notes': 'stoneware',
      'p-due': '2026-09-20',
      'p-fired': false,
    },
  },
  { id: 'r4', title: 'Untagged', values: {} }, // no values at all
]

describe('filterRows', () => {
  it('eq on a status matches by option id', () => {
    const out = filterRows(rows, schema, { property: 'p-status', op: 'eq', value: 'o-doing' })
    expect(out.map((r) => r.id)).toEqual(['r1'])
  })

  it('eq on a status also matches when the filter value is a label', () => {
    const out = filterRows(rows, schema, { property: 'p-status', op: 'eq', value: 'Done' })
    expect(out.map((r) => r.id)).toEqual(['r2'])
  })

  it('neq excludes matches and keeps the empty-valued row', () => {
    const out = filterRows(rows, schema, { property: 'p-status', op: 'neq', value: 'o-doing' })
    expect(out.map((r) => r.id)).toEqual(['r2', 'r3', 'r4'])
  })

  it('contains matches a status by its label substring', () => {
    // "doi" is only in "Doing" — "Done" and "To do" don't contain it.
    const out = filterRows(rows, schema, { property: 'p-status', op: 'contains', value: 'doi' })
    expect(out.map((r) => r.id)).toEqual(['r1'])
  })

  it('gt / lt compare numbers numerically', () => {
    expect(
      filterRows(rows, schema, { property: 'p-priority', op: 'gt', value: '1' }).map((r) => r.id)
    ).toEqual(['r1', 'r3'])
    expect(
      filterRows(rows, schema, { property: 'p-priority', op: 'lt', value: '3' }).map((r) => r.id)
    ).toEqual(['r1', 'r2'])
  })

  it('contains on a text property is case-insensitive', () => {
    expect(
      filterRows(rows, schema, { property: 'p-notes', op: 'contains', value: 'CELADON' }).map(
        (r) => r.id
      )
    ).toEqual(['r2'])
  })

  it('an unknown property is inert (shows everything)', () => {
    expect(filterRows(rows, schema, { property: 'p-nope', op: 'eq', value: 'x' })).toHaveLength(4)
  })

  it('no clause returns every row in order', () => {
    expect(filterRows(rows, schema, undefined).map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
  })
})

describe('sortRows', () => {
  it('sorts numbers ascending with empties last', () => {
    const out = sortRows(rows, schema, { key: 'p-priority', dir: 'asc' })
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'r4'])
  })

  it('sorts numbers descending with empties still last', () => {
    const out = sortRows(rows, schema, { key: 'p-priority', dir: 'desc' })
    expect(out.map((r) => r.id)).toEqual(['r3', 'r1', 'r2', 'r4'])
  })

  it('sorts a status by its defined option rank, not its label', () => {
    // schema order: To do(o-todo,r3), Doing(o-doing,r1), Done(o-done,r2), empty(r4)
    const out = sortRows(rows, schema, { key: 'p-status', dir: 'asc' })
    expect(out.map((r) => r.id)).toEqual(['r3', 'r1', 'r2', 'r4'])
  })

  it('sorts a status by rank descending, empties still last', () => {
    // reverse of schema order: Done(r2), Doing(r1), To do(r3), then empty(r4)
    const out = sortRows(rows, schema, { key: 'p-status', dir: 'desc' })
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'r4'])
  })

  it('sinks a status pointing at a stale option to the bottom', () => {
    // o-gone is off-schema → treated as no value, sorts last like an empty.
    const stale: CollectionRow[] = [
      { id: 'rx', title: 'Stale', values: { 'p-status': 'o-gone' } },
      { id: 'ry', title: 'Todo', values: { 'p-status': 'o-todo' } },
    ]
    const out = sortRows(stale, schema, { key: 'p-status', dir: 'asc' })
    expect(out.map((r) => r.id)).toEqual(['ry', 'rx'])
  })

  it('sorts dates chronologically', () => {
    const out = sortRows(rows, schema, { key: 'p-due', dir: 'asc' })
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1', 'r3', 'r4'])
  })

  it('an unknown sort key leaves order untouched', () => {
    expect(sortRows(rows, schema, { key: 'p-nope', dir: 'asc' }).map((r) => r.id)).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
    ])
  })
})

describe('applyView', () => {
  it('filters then sorts', () => {
    const out = applyView(rows, schema, {
      filter: { property: 'p-status', op: 'neq', value: 'o-done' },
      sort: { key: 'p-priority', dir: 'asc' },
    })
    // drops r2 (Done); remaining by priority asc: r1(2), r3(3), r4(empty)
    expect(out.map((r) => r.id)).toEqual(['r1', 'r3', 'r4'])
  })
})

describe('groupRows', () => {
  it('buckets rows by status option in schema order + a trailing no-value bucket', () => {
    const grouped = groupRows(rows, schema, 'p-status')
    expect(grouped).not.toBeNull()
    const { groups } = grouped!
    expect(groups.map((g) => g.id)).toEqual(['o-todo', 'o-doing', 'o-done', null])
    expect(groups.map((g) => g.label)).toEqual(['To do', 'Doing', 'Done', 'No Status'])
    expect(groups.find((g) => g.id === 'o-doing')!.rows.map((r) => r.id)).toEqual(['r1'])
    expect(groups.find((g) => g.id === null)!.rows.map((r) => r.id)).toEqual(['r4'])
  })

  it('carries the option color onto its column', () => {
    const { groups } = groupRows(rows, schema, 'p-status')!
    expect(groups.find((g) => g.id === 'o-done')!.color).toBe('green')
  })

  it('a row pointing at a stale option id falls into the no-value bucket', () => {
    const stale: CollectionRow[] = [{ id: 'rx', title: 'Stale', values: { 'p-status': 'o-gone' } }]
    const { groups } = groupRows(stale, schema, 'p-status')!
    expect(groups.find((g) => g.id === null)!.rows.map((r) => r.id)).toEqual(['rx'])
  })

  it('returns null when grouping by a non-choice property', () => {
    expect(groupRows(rows, schema, 'p-priority')).toBeNull()
    expect(groupRows(rows, schema, undefined)).toBeNull()
    expect(groupRows(rows, schema, 'p-nope')).toBeNull()
  })
})

describe('pickDateDef', () => {
  it('prefers the groupBy property when it is a date', () => {
    expect(pickDateDef(schema, 'p-due')?.id).toBe('p-due')
  })

  it('falls back to the first date property when groupBy is not a date', () => {
    // p-status is a status, not a date → fall through to the schema's first date prop.
    expect(pickDateDef(schema, 'p-status')?.id).toBe('p-due')
    expect(pickDateDef(schema, undefined)?.id).toBe('p-due')
  })

  it('returns undefined when the collection has no date property', () => {
    const noDates: PropertySchema = schema.filter((d) => d.type !== 'date')
    expect(pickDateDef(noDates, undefined)).toBeUndefined()
  })
})

describe('groupRowsByDate', () => {
  it('buckets rows into chronological date lanes with a trailing undated bucket', () => {
    const grouped = groupRowsByDate(rows, schema, 'p-due')
    expect(grouped).not.toBeNull()
    const { buckets } = grouped!
    // r2 (09-01), r1 (09-10), r3 (09-20), then the undated r4.
    expect(buckets.map((b) => b.iso)).toEqual(['2026-09-01', '2026-09-10', '2026-09-20', null])
    expect(buckets[0].rows.map((r) => r.id)).toEqual(['r2'])
    expect(buckets.find((b) => b.iso === null)!.rows.map((r) => r.id)).toEqual(['r4'])
  })

  it('buckets a datetime value by its date part', () => {
    const dt: CollectionRow[] = [
      { id: 'rd', title: 'Timed', values: { 'p-due': '2026-09-01T14:30:00' } },
    ]
    const { buckets } = groupRowsByDate(dt, schema, 'p-due')!
    expect(buckets.map((b) => b.iso)).toEqual(['2026-09-01'])
  })

  it('omits the undated bucket when every row has a date', () => {
    const dated = rows.filter((r) => r.id !== 'r4')
    const { buckets } = groupRowsByDate(dated, schema, 'p-due')!
    expect(buckets.every((b) => b.iso !== null)).toBe(true)
  })

  it('returns null when the property is not a date', () => {
    expect(groupRowsByDate(rows, schema, 'p-priority')).toBeNull()
    expect(groupRowsByDate(rows, schema, undefined)).toBeNull()
    expect(groupRowsByDate(rows, schema, 'p-nope')).toBeNull()
  })
})

describe('displayValue', () => {
  it('renders a status as its option label', () => {
    expect(displayValue(schema[0], 'o-doing')).toBe('Doing')
  })
  it('renders a legacy label-stored status value', () => {
    expect(displayValue(schema[0], 'Done')).toBe('Done')
  })
  it('renders a checkbox as a check or empty', () => {
    expect(displayValue(schema[4], true)).toBe('✓')
    expect(displayValue(schema[4], false)).toBe('')
  })
  it('renders a number and empty for missing', () => {
    expect(displayValue(schema[1], 3)).toBe('3')
    expect(displayValue(schema[1], null)).toBe('')
  })
})
