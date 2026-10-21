/**
 * The `configure_view` tool INPUT gate (#19 slice 5, widened by #111).
 *
 * The tool input is the server-side validation boundary: a shape that fails here
 * triggers `repairToolCall`, which re-asks the model with the corrective message.
 * What matters for #111 is that a chart or big-number view cannot be proposed
 * WITHOUT saying what it aggregates — the renderer tolerates an unconfigured mode so
 * a stale config never blanks a view, but the model must not lean on that tolerance
 * and quietly show a figure nobody asked for.
 */
import { configureViewTool } from '@/app/api/chat/tools'

const parse = (input: unknown) => configureViewTool.inputSchema.safeParse(input)

const assumption = 'Taking the only existing view block as the one to reconfigure.'

describe('configure_view input — chart mode (#111)', () => {
  it('accepts a chart naming its kind, axis property and plotted series by NAME', () => {
    const r = parse({
      pageId: 'p1',
      mode: 'chart',
      chart: { kind: 'line', xProperty: 'Date', series: [{ property: 'Weight', agg: 'latest' }] },
      assumption,
    })
    expect(r.success).toBe(true)
  })

  it('accepts a chart with no x property (one point per record)', () => {
    expect(
      parse({
        pageId: 'p1',
        mode: 'chart',
        chart: { kind: 'bar', series: [{ property: 'Hours', agg: 'sum' }] },
        assumption,
      }).success
    ).toBe(true)
  })

  it('REJECTS mode:"chart" with no chart config (repair re-asks)', () => {
    const r = parse({ pageId: 'p1', mode: 'chart', assumption })
    expect(r.success).toBe(false)
    expect(r.success === false && JSON.stringify(r.error.issues)).toMatch(/what it plots/i)
  })

  it('rejects an unknown kind, an empty series list and a bogus verb', () => {
    const bad = [
      { kind: 'donut', series: [{ property: 'Hours', agg: 'sum' }] },
      { kind: 'bar', series: [] },
      { kind: 'bar', series: [{ property: 'Hours', agg: 'median' }] },
    ]
    for (const chart of bad) {
      expect(parse({ pageId: 'p1', mode: 'chart', chart, assumption }).success).toBe(false)
    }
  })

  it('takes all 11 chart kinds — they are config values, not block types', () => {
    const kinds = [
      'line',
      'area',
      'bar',
      'composed',
      'net',
      'gauge',
      'radar',
      'scatter',
      'sankey',
      'sunburst',
      'funnel',
    ]
    for (const kind of kinds) {
      expect(
        parse({
          pageId: 'p1',
          mode: 'chart',
          chart: { kind, series: [{ property: 'Hours', agg: 'sum' }] },
          assumption,
        }).success
      ).toBe(true)
    }
  })
})

describe('configure_view input — big-number mode (#111)', () => {
  it('accepts a figure named by property, verb and format', () => {
    expect(
      parse({
        pageId: 'p1',
        mode: 'big-number',
        bigNumber: { property: 'Spend', agg: 'sum', format: 'currency' },
        assumption,
      }).success
    ).toBe(true)
  })

  it('accepts a figure with a trend clause (named by property + option LABEL)', () => {
    expect(
      parse({
        pageId: 'p1',
        mode: 'big-number',
        bigNumber: {
          property: 'Spend',
          agg: 'sum',
          delta: { property: 'Month', value: 'September' },
        },
        assumption,
      }).success
    ).toBe(true)
    // A half-written trend (no value) fails the gate rather than writing a clause
    // that can never match a record.
    expect(
      parse({
        pageId: 'p1',
        mode: 'big-number',
        bigNumber: { property: 'Spend', agg: 'sum', delta: { property: 'Month' } },
        assumption,
      }).success
    ).toBe(false)
  })

  it('accepts a property-less count of records', () => {
    expect(
      parse({ pageId: 'p1', mode: 'big-number', bigNumber: { agg: 'count' }, assumption }).success
    ).toBe(true)
  })

  it('REJECTS mode:"big-number" with no bigNumber config', () => {
    const r = parse({ pageId: 'p1', mode: 'big-number', assumption })
    expect(r.success).toBe(false)
    expect(r.success === false && JSON.stringify(r.error.issues)).toMatch(/which figure/i)
  })

  it('rejects a bogus verb or format', () => {
    expect(
      parse({
        pageId: 'p1',
        mode: 'big-number',
        bigNumber: { property: 'x', agg: 'median' },
        assumption,
      }).success
    ).toBe(false)
    expect(
      parse({
        pageId: 'p1',
        mode: 'big-number',
        bigNumber: { property: 'x', agg: 'sum', format: 'dollars' },
        assumption,
      }).success
    ).toBe(false)
  })
})

describe('configure_view input — the older modes are unchanged', () => {
  it('still requires a board to group its rows', () => {
    expect(parse({ pageId: 'p1', mode: 'board', assumption }).success).toBe(false)
    expect(parse({ pageId: 'p1', mode: 'board', groupBy: 'Status', assumption }).success).toBe(
      true
    )
  })

  it('does not demand a chart/bigNumber config for a table', () => {
    expect(parse({ pageId: 'p1', mode: 'table', assumption }).success).toBe(true)
  })

  it('carries no data of any kind — a points array is not part of the input', () => {
    const r = parse({
      pageId: 'p1',
      mode: 'chart',
      chart: { kind: 'line', series: [{ property: 'Hours', agg: 'sum' }] },
      points: [{ x: 'Jan', values: { Hours: 3 } }],
      assumption,
    })
    expect(r.success).toBe(true)
    expect(r.success && 'points' in r.data).toBe(false)
  })
})

describe('configure_view input — the assumption field (KAN-334)', () => {
  it('rejects a payload with no assumption', () => {
    expect(parse({ pageId: 'p1', mode: 'table' }).success).toBe(false)
  })

  it('rejects a blank assumption', () => {
    expect(parse({ pageId: 'p1', mode: 'table', assumption: '' }).success).toBe(false)
  })

  it('passes with an assumption', () => {
    expect(parse({ pageId: 'p1', mode: 'table', assumption }).success).toBe(true)
  })
})
