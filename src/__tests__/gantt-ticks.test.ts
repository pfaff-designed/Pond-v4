/**
 * The gantt's pure half (`gantt-shared.ts`), as #260 re-cut it to the board:
 * `PondTemplate.dc.html` draws the axis as `gTicks: repeat(4, …)` over a track whose
 * gridlines repeat at `25%` — four ticks at the range's quarters, not a thinned
 * weekly series — labelled in the board's own `20 oct` form. `buildTicks` (#57) and
 * its collision floor went with the weekly axis: a label per grid cell cannot collide.
 */
import {
  GANTT_TICK_COUNT,
  quarterTicks,
  formatTick,
  ganttRowDone,
} from '@/lib/modules/view/gantt-shared'
import type { PropertySchema } from '@/lib/properties/schema'

describe('quarterTicks', () => {
  it('four ticks at 0 / ¼ / ½ / ¾ of the range — the board’s `20 oct · 27 oct · 3 nov · 10 nov` over 28 days', () => {
    expect(GANTT_TICK_COUNT).toBe(4)
    expect(quarterTicks('2026-10-20', 28)).toEqual([
      '2026-10-20',
      '2026-10-27',
      '2026-11-03',
      '2026-11-10',
    ])
  })

  it('rounds to whole days on a range that does not divide by four', () => {
    expect(quarterTicks('2026-09-01', 30)).toEqual([
      '2026-09-01',
      '2026-09-09', // 7.5 → 8
      '2026-09-16', // 15
      '2026-09-24', // 22.5 → 23
    ])
  })

  it('a single-day range repeats the one day — four cells, never a crash', () => {
    expect(quarterTicks('2026-09-01', 1)).toEqual([
      '2026-09-01',
      '2026-09-01',
      '2026-09-01',
      '2026-09-01',
    ])
  })
})

describe('formatTick', () => {
  it('reads as the board writes it: day, then the lowercase short month', () => {
    expect(formatTick('2026-10-20')).toBe('20 oct')
    expect(formatTick('2026-11-03')).toBe('3 nov')
    expect(formatTick('2026-09-01')).toBe('1 sep')
  })

  it('is built at UTC noon, so a day never drifts across a timezone', () => {
    expect(formatTick('2026-01-01')).toBe('1 jan')
    expect(formatTick('2026-12-31')).toBe('31 dec')
  })
})

describe('ganttRowDone', () => {
  const schema: PropertySchema = [
    { id: 'start', name: 'Start', type: 'date' },
    {
      id: 'status',
      name: 'Status',
      type: 'status',
      options: [
        { id: 'o1', label: 'To do' },
        { id: 'o2', label: 'Done' },
      ],
    },
  ]

  it('a row whose status option is labelled done (any case) is done', () => {
    expect(ganttRowDone(schema, { id: 'r', title: 'r', values: { status: 'o2' } })).toBe(true)
    expect(ganttRowDone(schema, { id: 'r', title: 'r', values: { status: 'Done' } })).toBe(true)
    expect(ganttRowDone(schema, { id: 'r', title: 'r', values: { status: 'o1' } })).toBe(false)
    expect(ganttRowDone(schema, { id: 'r', title: 'r', values: {} })).toBe(false)
  })
})
