/**
 * view/apply.ts — the pure filter / sort / group core (#19 slice 3).
 *
 * Guards the row math every view mode depends on: single-clause filter across the
 * operators, sort that sinks empties, select/status grouping into option buckets +
 * a trailing "no value" bucket, and the leniency that keeps a stale clause or an
 * off-schema value from ever blanking or crashing a view.
 */
import {
  addDays,
  applyView,
  displayValue,
  epochDay,
  filterRows,
  groupRows,
  groupRowsByDate,
  layoutBars,
  layoutGanttBars,
  pickDateDef,
  pickGanttDefs,
  pickGroupDef,
  pickRepeatDef,
  pixelsToDays,
  shiftBar,
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

// ── Gantt (#27) ──────────────────────────────────────────────────────────────

const ganttSchema: PropertySchema = [
  { id: 'p-start', name: 'Start', type: 'date' },
  { id: 'p-end', name: 'End', type: 'date' },
  { id: 'p-name', name: 'Name', type: 'text' },
]

describe('pickGanttDefs', () => {
  it('infers the 1st date property as start and the 2nd as end', () => {
    const defs = pickGanttDefs(ganttSchema)
    expect(defs?.startDef.id).toBe('p-start')
    expect(defs?.endDef?.id).toBe('p-end')
  })

  it('honors named start/end ids over positional inference', () => {
    const defs = pickGanttDefs(ganttSchema, 'p-end', 'p-start')
    expect(defs?.startDef.id).toBe('p-end')
    expect(defs?.endDef?.id).toBe('p-start')
  })

  it('falls back to inference when a named id is not a date property', () => {
    // p-name is text → ignored; start falls back to the first date property.
    const defs = pickGanttDefs(ganttSchema, 'p-name')
    expect(defs?.startDef.id).toBe('p-start')
    expect(defs?.endDef?.id).toBe('p-end')
  })

  it('leaves end undefined when the collection has a single date property', () => {
    const oneDate: PropertySchema = [{ id: 'p-when', name: 'When', type: 'date' }]
    const defs = pickGanttDefs(oneDate)
    expect(defs?.startDef.id).toBe('p-when')
    expect(defs?.endDef).toBeUndefined()
  })

  it('returns undefined when the collection has no date property', () => {
    expect(pickGanttDefs(schema.filter((d) => d.type !== 'date'))).toBeUndefined()
  })
})

describe('layoutBars (#11 — the pure core layoutGanttBars and the timeline module share)', () => {
  const items = [
    { id: 'a', label: 'Throw', startIso: '2026-09-10', endIso: '2026-09-12' },
    { id: 'b', label: 'Glaze', startIso: '2026-09-01', endIso: '2026-09-05' },
    { id: 'c', label: 'Fire', startIso: '2026-09-20' }, // no end → single-day tick
    { id: 'd', label: 'Someday', startIso: null }, // no start → omitted
    { id: 'e', label: 'Backwards', startIso: '2026-09-08', endIso: '2026-09-06' }, // end < start
  ]

  it('sorts bars by start ascending and omits items with no start', () => {
    const { bars } = layoutBars(items)
    expect(bars.map((b) => b.id)).toEqual(['b', 'e', 'a', 'c'])
  })

  it('carries the label through so a rowless caller can draw the gutter', () => {
    const { bars } = layoutBars(items)
    expect(bars[0].label).toBe('Glaze')
  })

  it('makes a single-day tick for a missing end and clamps a backwards end', () => {
    const { bars } = layoutBars(items)
    const fire = bars.find((b) => b.id === 'c')!
    expect(fire.endIso).toBe('2026-09-20')
    const back = bars.find((b) => b.id === 'e')!
    expect(back.endIso).toBe('2026-09-08')
  })

  it('computes the inclusive range from min start to max end', () => {
    const { rangeStart, rangeEnd } = layoutBars(items)
    expect(rangeStart).toBe('2026-09-01')
    expect(rangeEnd).toBe('2026-09-20')
  })

  it('returns an empty layout with null bounds for no items', () => {
    expect(layoutBars([])).toEqual({ bars: [], rangeStart: null, rangeEnd: null })
  })
})

describe('layoutGanttBars', () => {
  const startDef = ganttSchema[0]
  const endDef = ganttSchema[1]
  const ganttRows: CollectionRow[] = [
    { id: 'r1', title: 'Throw', values: { 'p-start': '2026-09-10', 'p-end': '2026-09-12' } },
    { id: 'r2', title: 'Glaze', values: { 'p-start': '2026-09-01', 'p-end': '2026-09-05' } },
    { id: 'r3', title: 'Fire', values: { 'p-start': '2026-09-20' } }, // no end → single day
    { id: 'r4', title: 'Someday', values: {} }, // no start → omitted
    { id: 'r5', title: 'Backwards', values: { 'p-start': '2026-09-08', 'p-end': '2026-09-06' } }, // end < start
  ]

  it('sorts bars by start ascending and omits rows with no start', () => {
    const { bars } = layoutGanttBars(ganttRows, startDef, endDef)
    expect(bars.map((b) => b.row.id)).toEqual(['r2', 'r5', 'r1', 'r3'])
  })

  it('makes a single-day tick when a row has a start but no end', () => {
    const { bars } = layoutGanttBars(ganttRows, startDef, endDef)
    const fire = bars.find((b) => b.row.id === 'r3')!
    expect(fire.startIso).toBe('2026-09-20')
    expect(fire.endIso).toBe('2026-09-20')
  })

  it('clamps an end that falls before its start to a single-day tick', () => {
    const { bars } = layoutGanttBars(ganttRows, startDef, endDef)
    const back = bars.find((b) => b.row.id === 'r5')!
    expect(back.startIso).toBe('2026-09-08')
    expect(back.endIso).toBe('2026-09-08')
  })

  it('computes the inclusive range from min start to max end', () => {
    const { rangeStart, rangeEnd } = layoutGanttBars(ganttRows, startDef, endDef)
    expect(rangeStart).toBe('2026-09-01')
    expect(rangeEnd).toBe('2026-09-20')
  })

  it('draws every bar as single-day when there is no end property', () => {
    const { bars } = layoutGanttBars(ganttRows, startDef, undefined)
    expect(bars.every((b) => b.startIso === b.endIso)).toBe(true)
  })

  it('returns an empty layout with null bounds when no row has a start', () => {
    const layout = layoutGanttBars([{ id: 'x', title: 'x', values: {} }], startDef, endDef)
    expect(layout.bars).toEqual([])
    expect(layout.rangeStart).toBeNull()
    expect(layout.rangeEnd).toBeNull()
  })
})

// ── Gantt reschedule (drag) ────────────────────────────────────────────────

describe('pixelsToDays', () => {
  it('maps a full-track pixel travel to the whole span', () => {
    // Dragging the entire track width across a 10-day span = 10 days.
    expect(pixelsToDays(200, 200, 10)).toBe(10)
  })

  it('maps a fraction of the track proportionally, rounded to whole days', () => {
    // 50% of a 200px track over a 10-day span = 5 days.
    expect(pixelsToDays(100, 200, 10)).toBe(5)
    // 57% over 10 days = 5.7 → rounds to 6.
    expect(pixelsToDays(114, 200, 10)).toBe(6)
  })

  it('carries the sign for a leftward (negative) drag', () => {
    expect(pixelsToDays(-60, 200, 10)).toBe(-3)
  })

  it('rounds sub-day travel to zero (a click is not a reschedule)', () => {
    expect(pixelsToDays(6, 200, 10)).toBe(0)
  })

  it('returns zero when the track has no measurable width', () => {
    expect(pixelsToDays(100, 0, 10)).toBe(0)
  })
})

describe('shiftBar', () => {
  const span = { startIso: '2026-09-10', endIso: '2026-09-12', hasEndDef: true }
  const milestone = { startIso: '2026-09-20', endIso: null, hasEndDef: true }
  const singleDate = { startIso: '2026-09-10', endIso: null, hasEndDef: false }

  describe('move', () => {
    it('shifts both start and end by the delta, preserving duration', () => {
      expect(shiftBar(span, 'move', 2)).toEqual({ startIso: '2026-09-12', endIso: '2026-09-14' })
      expect(shiftBar(span, 'move', -3)).toEqual({ startIso: '2026-09-07', endIso: '2026-09-09' })
    })

    it('shifts only the start of a milestone — moving never creates an end', () => {
      expect(shiftBar(milestone, 'move', 5)).toEqual({ startIso: '2026-09-25' })
    })

    it('shifts only the start when there is no end property', () => {
      expect(shiftBar(singleDate, 'move', 5)).toEqual({ startIso: '2026-09-15' })
    })

    it('is a no-op for a zero delta', () => {
      expect(shiftBar(span, 'move', 0)).toEqual({})
    })
  })

  describe('resize-start', () => {
    it('moves the start alone', () => {
      expect(shiftBar(span, 'resize-start', 1)).toEqual({ startIso: '2026-09-11' })
    })

    it('clamps the start so it cannot cross the end (min one-day span)', () => {
      // +5 would land on 09-15, past the 09-12 end → pinned to the end day.
      expect(shiftBar(span, 'resize-start', 5)).toEqual({ startIso: '2026-09-12' })
    })

    it('is a no-op for a zero delta', () => {
      expect(shiftBar(span, 'resize-start', 0)).toEqual({})
    })
  })

  describe('resize-end', () => {
    it('moves the end alone', () => {
      expect(shiftBar(span, 'resize-end', 2)).toEqual({ endIso: '2026-09-14' })
    })

    it('clamps the end so it cannot precede the start (min one-day span)', () => {
      // -5 would land on 09-07, before the 09-10 start → pinned to the start day.
      expect(shiftBar(span, 'resize-end', -5)).toEqual({ endIso: '2026-09-10' })
    })

    it('creates an end on a milestone, turning a tick into a span', () => {
      expect(shiftBar(milestone, 'resize-end', 2)).toEqual({ endIso: '2026-09-22' })
    })

    it('is disabled when there is no end property to store into', () => {
      expect(shiftBar(singleDate, 'resize-end', 2)).toEqual({})
    })

    it('is a no-op for a zero delta', () => {
      expect(shiftBar(span, 'resize-end', 0)).toEqual({})
    })
  })
})

describe('epochDay / addDays', () => {
  it('increments by exactly one per calendar day, timezone-stable', () => {
    expect(epochDay('2026-09-11') - epochDay('2026-09-10')).toBe(1)
    expect(epochDay('2026-09-10')).toBe(Math.floor(Date.UTC(2026, 8, 10) / 86_400_000))
  })

  it('yields 0 for a malformed day rather than NaN', () => {
    expect(epochDay('not-a-date')).toBe(0)
  })

  it('addDays moves forward and backward, crossing month and year boundaries', () => {
    expect(addDays('2026-09-10', 5)).toBe('2026-09-15')
    expect(addDays('2026-09-10', -3)).toBe('2026-09-07')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('addDays returns a malformed input unchanged', () => {
    expect(addDays('not-a-date', 3)).toBe('not-a-date')
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

// ── pickGroupDef / pickRepeatDef ─────────────────────────────────────────────

describe('pickGroupDef', () => {
  const status = { id: 'st', name: 'status', type: 'status' as const, options: [] }
  const stage = { id: 'sg', name: 'stage', type: 'select' as const, options: [] }
  const due = { id: 'd', name: 'due', type: 'date' as const }

  it('returns the select/status property the view names', () => {
    expect(pickGroupDef([status, stage], 'sg')).toBe(stage)
  })

  it('with no group-by named, prefers the first status, then the first select', () => {
    expect(pickGroupDef([stage, status, due], undefined)).toBe(status)
    expect(pickGroupDef([due, stage], undefined)).toBe(stage)
  })

  it('returns undefined when nothing can group', () => {
    expect(pickGroupDef([due], undefined)).toBeUndefined()
  })

  it('falls back to the default grouping when the named property is gone or the wrong type', () => {
    // `groupBy` is shared by board, calendar and list: a calendar's date property
    // must not leave the board with no lanes after a mode switch.
    expect(pickGroupDef([status, stage, due], 'gone')).toBe(status)
    expect(pickGroupDef([stage, status, due], 'd')).toBe(status)
    expect(pickGroupDef([due, stage], 'd')).toBe(stage)
  })

  it('returns undefined for a bad name when nothing can group', () => {
    expect(pickGroupDef([due], 'd')).toBeUndefined()
  })
})

describe('pickRepeatDef', () => {
  it('finds a text or select property named repeat / repeats, any case', () => {
    const repeats = { id: 'r', name: 'Repeats', type: 'text' as const }
    expect(pickRepeatDef([{ id: 'x', name: 'note', type: 'text' as const }, repeats])).toBe(repeats)
    const repeat = { id: 'r2', name: 'repeat', type: 'select' as const, options: [] }
    expect(pickRepeatDef([repeat])).toBe(repeat)
  })

  it('ignores other types and other names', () => {
    expect(pickRepeatDef([{ id: 'n', name: 'repeats', type: 'number' as const }])).toBeUndefined()
    expect(pickRepeatDef([{ id: 'n', name: 'repeating', type: 'text' as const }])).toBeUndefined()
  })
})
