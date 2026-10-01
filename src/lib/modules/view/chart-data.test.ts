/**
 * Chart derivation (#111 / #94) — a chart view reads the RECORDS, never a copy.
 *
 * The non-tautological checks: change a record's value and the derived points
 * change, because there is no stored `points` array to drift; and the three kinds
 * with an extra reading (scatter per record, sunburst leaves, gauge figure) derive
 * it from the same rows.
 */
import { chartDataFromRows, resolveChartConfig } from './chart-data'
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

const row = (id: string, title: string, values: Record<string, unknown>): CollectionRow => ({ id, title, values })

const rows: CollectionRow[] = [
  row('r1', 'Mill the stock', { 'p-hours': 3, 'p-month': 'Jan', 'p-status': 'o-done', 'p-billed': true }),
  row('r2', 'Glue up', { 'p-hours': 5, 'p-month': 'Jan', 'p-status': 'o-open', 'p-billed': false }),
  row('r3', 'Finish', { 'p-hours': 2, 'p-month': 'Feb', 'p-status': 'o-done', 'p-billed': true }),
]

const config = {
  kind: 'bar' as const,
  xProperty: 'p-month',
  series: [{ property: 'p-hours', agg: 'sum' as const }],
}

describe('chartDataFromRows', () => {
  it('buckets records by the x property and aggregates each bucket', () => {
    const data = chartDataFromRows(rows, schema, config)
    expect(data.xLabel).toBe('Month')
    expect(data.series.map((s) => s.name)).toEqual(['Hours'])
    expect(data.points).toEqual([
      { x: 'Jan', values: { Hours: 8 } },
      { x: 'Feb', values: { Hours: 2 } },
    ])
  })

  it('MOVES when a record changes — nothing holds a copy (#111)', () => {
    const before = chartDataFromRows(rows, schema, config)
    const edited = rows.map((r) => (r.id === 'r1' ? row(r.id, r.title, { ...r.values, 'p-hours': 30 }) : r))
    const after = chartDataFromRows(edited, schema, config)
    expect(before.points[0].values.Hours).toBe(8)
    expect(after.points[0].values.Hours).toBe(35)
  })

  it('labels choice buckets by option LABEL, not the stored option id', () => {
    const data = chartDataFromRows(rows, schema, { kind: 'bar', xProperty: 'p-status', series: [{ property: 'p-hours', agg: 'sum' }] })
    expect(data.points.map((p) => p.x)).toEqual(['Done', 'Open'])
  })

  it('buckets by record title when no x property is named', () => {
    const data = chartDataFromRows(rows, schema, { kind: 'line', series: [{ property: 'p-hours', agg: 'latest' }] })
    expect(data.points.map((p) => p.x)).toEqual(['Mill the stock', 'Glue up', 'Finish'])
    expect(data.series[0].name).toBe('Hours (latest)')
  })

  it('leaves a bucket with no participating value as a GAP, not a zero', () => {
    const data = chartDataFromRows([...rows, row('r4', 'Unplanned', { 'p-month': 'Mar' })], schema, config)
    expect(data.points[2]).toEqual({ x: 'Mar', values: {} })
  })

  it('infers a drawable config from the schema when the mode arrives unconfigured', () => {
    const resolved = resolveChartConfig(schema, undefined)
    expect(resolved.series[0].def?.id).toBe('p-hours')
    expect(chartDataFromRows(rows, schema, undefined).points.length).toBeGreaterThan(0)
  })

  it('degrades a series whose property is gone into a record count', () => {
    const data = chartDataFromRows(rows, schema, { kind: 'bar', xProperty: 'p-month', series: [{ property: 'p-deleted', agg: 'sum' }] })
    expect(data.series[0].name).toBe('Hours')
    expect(data.points[0].values).toEqual({ Hours: 8 })
  })

  it('carries the configured target through for gauge / composed', () => {
    expect(chartDataFromRows(rows, schema, { ...config, kind: 'composed', target: 100 }).target).toBe(100)
    expect(chartDataFromRows(rows, schema, config).target).toBeUndefined()
  })
})

describe('kind-specific readings (#94)', () => {
  it('scatter keeps one point PER RECORD — two January records stay two dots', () => {
    const data = chartDataFromRows(rows, schema, { ...config, kind: 'scatter' })
    expect(data.points.map((p) => p.x)).toEqual(['Jan', 'Jan', 'Feb'])
    expect(data.points.map((p) => p.values.Hours)).toEqual([3, 5, 2])
  })

  it('sunburst carries each bucket’s records as leaves for the outer ring', () => {
    const data = chartDataFromRows(rows, schema, { ...config, kind: 'sunburst' })
    expect(data.leaves?.Jan.map((l) => l.x)).toEqual(['Mill the stock', 'Glue up'])
    expect(data.leaves?.Jan.map((l) => l.values.Hours)).toEqual([3, 5])
    expect(data.leaves?.Feb).toHaveLength(1)
    // Counting reads each record as 1.
    const counted = chartDataFromRows(rows, schema, { kind: 'sunburst', xProperty: 'p-month', series: [{ property: 'p-month', agg: 'count' }] })
    expect(counted.series[0].name).toBe('Month (count)')
    expect(counted.leaves?.Jan.map((l) => l.values['Month (count)'])).toEqual([1, 1])
  })

  it('gauge reads ONE figure over all rows against the target, defaulting to the record count', () => {
    const done = chartDataFromRows(rows, schema, { kind: 'gauge', series: [{ property: 'p-billed', agg: 'sum' }] })
    expect(done.gauge).toEqual({ value: 2, target: 3 })
    const goal = chartDataFromRows(rows, schema, { kind: 'gauge', series: [{ property: 'p-hours', agg: 'sum' }], target: 40 })
    expect(goal.gauge).toEqual({ value: 10, target: 40 })
    // No sunburst leaves and no gauge figure leak into other kinds.
    expect(chartDataFromRows(rows, schema, config).gauge).toBeUndefined()
    expect(chartDataFromRows(rows, schema, config).leaves).toBeUndefined()
  })
})
