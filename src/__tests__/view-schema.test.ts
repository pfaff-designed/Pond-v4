/**
 * The `view` block (#19) — config-only inline view of a collection's rows.
 *
 * Guards two things: (1) the persisted schema is config only and round-trips its
 * optional clauses (mode/groupBy/sort/filter/collectionId), and (2) `serialize`
 * renders every config clause (the AI re-emits it) plus the transiently-injected
 * row titles, and degrades honestly when a linked view isn't hydrated.
 */
import {
  viewSchema,
  viewDescriptor,
  type ViewBlock,
  type HydratedViewBlock,
} from '@/lib/modules/view/schema'
import { CHART_KINDS } from '@/lib/modules/view/aggregate'
import type { PropertySchema } from '@/lib/properties/schema'

const base: ViewBlock = { id: 'v1', type: 'view', mode: 'table' }

describe('viewSchema (persisted, config-only)', () => {
  it('accepts a bare view (mode only)', () => {
    expect(viewSchema.safeParse(base).success).toBe(true)
  })

  it('round-trips every optional clause', () => {
    const full: ViewBlock = {
      id: 'v1',
      type: 'view',
      mode: 'board',
      groupBy: 'p-status',
      sort: { key: 'p-due', dir: 'asc' },
      filter: { property: 'p-status', op: 'eq', value: 'o-doing' },
      collectionId: 'coll-9',
    }
    const parsed = viewSchema.safeParse(full)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual(full)
  })

  it('rejects an unknown mode and an unknown filter op', () => {
    expect(viewSchema.safeParse({ ...base, mode: 'timeline' }).success).toBe(false)
    expect(
      viewSchema.safeParse({ ...base, filter: { property: 'p', op: 'between', value: 'x' } })
        .success
    ).toBe(false)
  })

  it('does not carry rows (config only — rows are child pages)', () => {
    const parsed = viewSchema.parse({ ...base, rows: [{ id: 'r1', title: 'x' }] } as unknown)
    expect('rows' in parsed).toBe(false)
  })
})

describe('viewDescriptor.serialize', () => {
  const withRows = (b: ViewBlock, titles: string[]): HydratedViewBlock => ({
    ...b,
    rows: titles.map((t, i) => ({ id: `r${i}`, title: t })),
  })

  it('renders mode + injected row titles', () => {
    const out = viewDescriptor.serialize(withRows(base, ['Dune', 'Hyperion']) as ViewBlock)
    expect(out).toContain('table')
    expect(out).toContain('2 rows')
    expect(out).toContain('Dune')
    expect(out).toContain('Hyperion')
  })

  it('renders each config clause so a re-emit preserves it', () => {
    const out = viewDescriptor.serialize({
      ...base,
      mode: 'board',
      groupBy: 'p-status',
      sort: { key: 'p-due', dir: 'desc' },
      filter: { property: 'p-status', op: 'neq', value: 'o-done' },
    })
    expect(out).toContain('board')
    expect(out).toContain('grouped by p-status')
    expect(out).toContain('sorted by p-due desc')
    expect(out).toContain('filtered p-status neq o-done')
  })

  it('hydrates a linked view over another collection (#41 — was stubbed)', () => {
    // The linked target's rows are injected by the assemble seam before serialize,
    // exactly like an inline view. The config still names the linked collection so a
    // re-emit preserves it — but the "(not yet hydrated)" stub is gone.
    const out = viewDescriptor.serialize(
      withRows({ ...base, collectionId: 'coll-9' }, ['Dune', 'Hyperion']) as ViewBlock
    )
    expect(out).toContain('coll-9')
    expect(out).toContain('2 rows')
    expect(out).toContain('Dune')
    expect(out).not.toContain('not yet hydrated')
  })

  it('says "no rows" when nothing is injected', () => {
    expect(viewDescriptor.serialize(base)).toContain('no rows')
  })

  it('uses singular "row" for exactly one', () => {
    const out = viewDescriptor.serialize(withRows(base, ['Solo']) as ViewBlock)
    expect(out).toMatch(/\b1 row\b/)
    expect(out).not.toContain('1 rows')
  })
})

// ── chart + big-number modes (#111) ──────────────────────────────────────────
// A chart and a headline figure are MODES of the database, so the block stays
// config-only: the schema must accept the mode config and reject a malformed one,
// and serialize must report the AGGREGATED figure (not a promise that a chart
// exists), because that string is what the model reads.

describe('viewSchema — chart + big-number config (#111)', () => {
  it('accepts mode:"chart" with a valid chart config', () => {
    const block: ViewBlock = {
      ...base,
      mode: 'chart',
      chart: {
        kind: 'bar',
        xProperty: 'p-month',
        series: [{ property: 'p-hours', agg: 'sum' }],
        stacked: true,
      },
    }
    const parsed = viewSchema.safeParse(block)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual(block)
  })

  it('accepts an optional numeric target (#94 gauge goal / composed budget) and rejects a non-number', () => {
    const withTarget = { ...base, mode: 'chart', chart: { kind: 'gauge', series: [{ property: 'p-hours', agg: 'sum' }], target: 30 } }
    expect(viewSchema.safeParse(withTarget).success).toBe(true)
    expect(
      viewSchema.safeParse({ ...withTarget, chart: { ...withTarget.chart, target: '30' } }).success
    ).toBe(false)
  })

  it('accepts every #94 chart KIND as a config value (no new block types)', () => {
    for (const kind of CHART_KINDS) {
      expect(
        viewSchema.safeParse({
          ...base,
          mode: 'chart',
          chart: { kind, series: [{ property: 'p-hours', agg: 'sum' }] },
        }).success
      ).toBe(true)
    }
  })

  it('rejects a malformed chart config (unknown kind, empty series, bogus verb)', () => {
    const bad = [
      { kind: 'donut', series: [{ property: 'p-hours', agg: 'sum' }] },
      { kind: 'bar', series: [] },
      { kind: 'bar', series: [{ property: 'p-hours', agg: 'median' }] },
      { kind: 'bar', series: [{ property: 'p-hours', agg: 'sum' }], stacked: 'yes' },
    ]
    for (const chart of bad) {
      expect(viewSchema.safeParse({ ...base, mode: 'chart', chart }).success).toBe(false)
    }
  })

  it('accepts mode:"big-number" with a valid bigNumber config', () => {
    const block: ViewBlock = {
      ...base,
      mode: 'big-number',
      bigNumber: {
        property: 'p-hours',
        agg: 'avg',
        format: 'currency',
        delta: { property: 'p-status', value: 'o-done' },
      },
    }
    const parsed = viewSchema.safeParse(block)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toEqual(block)
  })

  it('rejects a malformed bigNumber config (missing verb, bogus verb/format)', () => {
    const bad = [
      { property: 'p-hours' },
      { property: 'p-hours', agg: 'median' },
      { property: 'p-hours', agg: 'sum', format: 'dollars' },
      { property: 'p-hours', agg: 'sum', delta: { property: 'p-status' } },
    ]
    for (const bigNumber of bad) {
      expect(viewSchema.safeParse({ ...base, mode: 'big-number', bigNumber }).success).toBe(false)
    }
  })

  it('still carries NO data of its own — a chart view holds config only', () => {
    const parsed = viewSchema.parse({
      ...base,
      mode: 'chart',
      chart: { kind: 'line', series: [{ property: 'p-hours', agg: 'sum' }] },
      points: [{ x: 'Jan', values: { Hours: 3 } }],
    } as unknown)
    expect('points' in parsed).toBe(false)
  })
})

describe('viewDescriptor.serialize — aggregated figures (#111 AC 8)', () => {
  const figureSchema: PropertySchema = [
    { id: 'p-hours', name: 'Hours', type: 'number' },
    { id: 'p-month', name: 'Month', type: 'text' },
  ]
  const hydrated = (block: ViewBlock): HydratedViewBlock => ({
    ...block,
    schema: figureSchema,
    rows: [
      { id: 'r1', title: 'Mill', values: { 'p-hours': 3, 'p-month': 'Jan' } },
      { id: 'r2', title: 'Glue', values: { 'p-hours': 5, 'p-month': 'Jan' } },
      { id: 'r3', title: 'Finish', values: { 'p-hours': 2, 'p-month': 'Feb' } },
    ],
  })

  it('reports a chart view as its aggregated points, not its row titles', () => {
    const out = viewDescriptor.serialize(
      hydrated({
        ...base,
        mode: 'chart',
        chart: { kind: 'bar', xProperty: 'p-month', series: [{ property: 'p-hours', agg: 'sum' }] },
      }) as ViewBlock
    )
    expect(out).toContain('chart bar')
    expect(out).toContain('by Month')
    expect(out).toContain('Jan 8')
    expect(out).toContain('Feb 2')
  })

  it('reports a big-number view as the formatted figure over its records', () => {
    const out = viewDescriptor.serialize(
      hydrated({
        ...base,
        mode: 'big-number',
        bigNumber: { property: 'p-hours', agg: 'sum', format: 'currency' },
      }) as ViewBlock
    )
    expect(out).toContain('Hours: $10')
    expect(out).toContain('over 3 records')
  })

  it('never invents a figure when the seam injected no schema', () => {
    const out = viewDescriptor.serialize({
      ...base,
      mode: 'big-number',
      bigNumber: { property: 'p-hours', agg: 'sum' },
    })
    expect(out).toContain('no rows')
    expect(out).not.toContain('$')
  })
})
