/**
 * View aggregation (#111) — chart + big-number modes read the RECORDS, never a copy.
 *
 * The non-tautological checks here are the law the issue is about: change a record's
 * value and the derived figure changes, because there is no stored `points` array to
 * drift; and the aggregation the screen shows is the SAME function `serialize` calls,
 * so the AI's context can't disagree with the user's eyes.
 */
import {
  aggregateRows,
  bigNumberFromRows,
  formatFigure,
  numericValue,
  resolveBigNumberConfig,
  signedDelta,
  CHART_KINDS,
} from './aggregate'
import type { CollectionRow } from './apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schema: PropertySchema = [
  { id: 'p-hours', name: 'Hours', type: 'number' },
  { id: 'p-month', name: 'Month', type: 'text' },
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-done', label: 'Done' },
      { id: 'o-open', label: 'Open' },
    ],
  },
  { id: 'p-billed', name: 'Billed', type: 'checkbox' },
]

const row = (id: string, title: string, values: Record<string, unknown>): CollectionRow => ({
  id,
  title,
  values,
})

const rows: CollectionRow[] = [
  row('r1', 'Mill the stock', { 'p-hours': 3, 'p-month': 'Jan', 'p-status': 'o-done', 'p-billed': true }),
  row('r2', 'Glue up', { 'p-hours': 5, 'p-month': 'Jan', 'p-status': 'o-open', 'p-billed': false }),
  row('r3', 'Finish', { 'p-hours': 2, 'p-month': 'Feb', 'p-status': 'o-done', 'p-billed': true }),
]

const hours = schema[0]

describe('numericValue', () => {
  it('reads a number, counts a checkbox as 1/0, and ignores an unset value', () => {
    expect(numericValue(hours, 4)).toBe(4)
    expect(numericValue(schema[3], true)).toBe(1)
    expect(numericValue(schema[3], false)).toBe(0)
    expect(numericValue(hours, undefined)).toBeNull()
  })

  it('does not throw on an off-type cell — it drops out of the aggregate', () => {
    expect(numericValue(hours, 'lots')).toBeNull()
    expect(numericValue(schema[1], 'Jan')).toBeNull()
  })
})

describe('aggregateRows — the six verbs', () => {
  it('sums, averages, mins, maxes and takes the latest', () => {
    expect(aggregateRows(rows, hours, 'sum')).toBe(10)
    expect(aggregateRows(rows, hours, 'avg')).toBeCloseTo(10 / 3)
    expect(aggregateRows(rows, hours, 'min')).toBe(2)
    expect(aggregateRows(rows, hours, 'max')).toBe(5)
    // `latest` is the LAST row in the view's own (filtered + sorted) order.
    expect(aggregateRows(rows, hours, 'latest')).toBe(2)
  })

  it('counts RECORDS, including ones carrying no value, and needs no property', () => {
    expect(aggregateRows(rows, undefined, 'count')).toBe(3)
    expect(aggregateRows([...rows, row('r4', 'No hours', {})], hours, 'count')).toBe(4)
  })

  it('returns null — not 0 — when nothing participates', () => {
    expect(aggregateRows([row('r9', 'Empty', {})], hours, 'sum')).toBeNull()
    expect(aggregateRows([], hours, 'avg')).toBeNull()
  })
})

describe('formatFigure', () => {
  it('formats number / currency / percent deterministically, and null as an em dash', () => {
    expect(formatFigure(1234.5)).toBe('1,234.5')
    expect(formatFigure(1200, 'currency')).toBe('$1,200')
    expect(formatFigure(0.62, 'percent')).toBe('62%')
    expect(formatFigure(null)).toBe('—')
  })

  it('signs a delta fraction', () => {
    expect(signedDelta(0.12)).toBe('+12%')
    expect(signedDelta(-0.05)).toBe('-5%')
  })
})

describe('chart KINDS are config values, not block types', () => {
  it('names all 11 kinds — the eight #94 kinds are values of the chart mode, never block types', () => {
    expect(CHART_KINDS).toHaveLength(11)
    expect(CHART_KINDS).toEqual(
      expect.arrayContaining(['composed', 'net', 'gauge', 'radar', 'scatter', 'sankey', 'sunburst', 'funnel'])
    )
  })
})

describe('bigNumberFromRows', () => {
  it('aggregates one property over the records and applies the format', () => {
    const figure = bigNumberFromRows(rows, schema, {
      property: 'p-hours',
      agg: 'sum',
      format: 'number',
    })
    expect(figure.value).toBe(10)
    expect(figure.formatted).toBe('10')
    expect(figure.label).toBe('Hours')
    expect(figure.recordCount).toBe(3)
  })

  it('formats currency and percent through the same figure path as serialize', () => {
    expect(bigNumberFromRows(rows, schema, { property: 'p-hours', agg: 'sum', format: 'currency' }).formatted).toBe('$10')
    expect(bigNumberFromRows(rows, schema, { property: 'p-hours', agg: 'avg', format: 'percent' }).formatted).toBe('333.3%')
  })

  it('MOVES when a record changes (no copy held)', () => {
    const cfg = { property: 'p-hours', agg: 'sum' as const }
    const edited = rows.map((r) => (r.id === 'r2' ? row(r.id, r.title, { ...r.values, 'p-hours': 15 }) : r))
    expect(bigNumberFromRows(rows, schema, cfg).value).toBe(10)
    expect(bigNumberFromRows(edited, schema, cfg).value).toBe(20)
  })

  it('counts records when no property is configured', () => {
    const figure = bigNumberFromRows(rows, schema, { agg: 'count' })
    expect(figure.value).toBe(3)
    expect(figure.label).toBe('Records')
  })

  it('reads "—" rather than a lying zero when nothing participates', () => {
    expect(bigNumberFromRows([], schema, { property: 'p-hours', agg: 'sum' }).formatted).toBe('—')
  })

  it('computes a delta against the records outside the compare clause', () => {
    // Done rows total 5 hours; the rest total 5 → no change.
    const flat = bigNumberFromRows(rows, schema, {
      property: 'p-hours',
      agg: 'sum',
      delta: { property: 'p-status', value: 'o-done' },
    })
    expect(flat.delta).toBe(0)
    // Shift one hour across the compare boundary and the delta moves with it.
    const shifted = rows.map((r) => (r.id === 'r3' ? row(r.id, r.title, { ...r.values, 'p-hours': 7 }) : r))
    const up = bigNumberFromRows(shifted, schema, {
      property: 'p-hours',
      agg: 'sum',
      delta: { property: 'p-status', value: 'o-done' },
    })
    expect(up.delta).toBeCloseTo((10 - 5) / 5)
  })

  it('falls back to counting records when the configured property is gone', () => {
    const resolved = resolveBigNumberConfig(schema, { property: 'p-deleted', agg: 'sum' })
    expect(resolved.agg).toBe('count')
    expect(bigNumberFromRows(rows, schema, { property: 'p-deleted', agg: 'sum' }).value).toBe(3)
  })
})
