import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { CollectionView } from './view'
import type { CollectionRow } from './apply'
import type { ViewBlock, ViewChartConfig } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * The eleven chart KINDS of the `chart` view mode (#94 on the #111 contract): each
 * story is the SAME fixture database drawn a different way. No story holds chart
 * data — every figure below is aggregated from `rows` at render time, so editing a
 * record in any other view of this database moves these charts with it.
 *
 * Colours are the Make Noise ink ramp only (`--chart-1…5` + the single-job fills);
 * check the dark theme too — ink flips to paper and nothing else moves.
 */
const meta = {
  title: 'Modules/View/Chart kinds',
  component: CollectionView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CollectionView>

export default meta
type Story = StoryObj<typeof meta>

// ── Fixture: a "Household ledger"-shaped collection ──────────────────────────
const schema: PropertySchema = [
  { id: 'p-month', name: 'Month', type: 'text' },
  {
    id: 'p-category',
    name: 'Category',
    type: 'select',
    options: [
      { id: 'c-rent', label: 'Rent', color: 'zinc' },
      { id: 'c-food', label: 'Food', color: 'green' },
      { id: 'c-saved', label: 'Saved', color: 'sky' },
      { id: 'c-transport', label: 'Transport', color: 'amber' },
      { id: 'c-subs', label: 'Subs', color: 'violet' },
    ],
  },
  { id: 'p-in', name: 'In', type: 'number' },
  { id: 'p-out', name: 'Out', type: 'number' },
  { id: 'p-hours', name: 'Sleep hours', type: 'number' },
  { id: 'p-energy', name: 'Energy', type: 'number' },
  { id: 'p-reviewed', name: 'Reviewed', type: 'checkbox' },
]

const r = (id: string, title: string, values: Record<string, unknown>): CollectionRow => ({ id, title, values })

const rows: CollectionRow[] = [
  r('t1', 'Flat', { 'p-month': 'may', 'p-category': 'c-rent', 'p-in': 3200, 'p-out': 1150, 'p-hours': 5.2, 'p-energy': 2, 'p-reviewed': true }),
  r('t2', 'Groceries', { 'p-month': 'may', 'p-category': 'c-food', 'p-out': 420, 'p-hours': 6.1, 'p-energy': 3, 'p-reviewed': true }),
  r('t3', 'ISA', { 'p-month': 'jun', 'p-category': 'c-saved', 'p-in': 3200, 'p-out': 700, 'p-hours': 7.4, 'p-energy': 5, 'p-reviewed': false }),
  r('t4', 'Rail card', { 'p-month': 'jun', 'p-category': 'c-transport', 'p-out': 180, 'p-hours': 7.9, 'p-energy': 6, 'p-reviewed': true }),
  r('t5', 'Streaming', { 'p-month': 'jul', 'p-category': 'c-subs', 'p-in': 2900, 'p-out': 96, 'p-hours': 8.6, 'p-energy': 8, 'p-reviewed': false }),
  r('t6', 'Market', { 'p-month': 'jul', 'p-category': 'c-food', 'p-out': 310, 'p-hours': 6.8, 'p-energy': 4, 'p-reviewed': true }),
  r('t7', 'Flat', { 'p-month': 'aug', 'p-category': 'c-rent', 'p-in': 3200, 'p-out': 1150, 'p-hours': 5.9, 'p-energy': 2, 'p-reviewed': false }),
  r('t8', 'Bike repair', { 'p-month': 'aug', 'p-category': 'c-transport', 'p-out': 2400, 'p-hours': 9.1, 'p-energy': 9, 'p-reviewed': true }),
]

const view = (id: string, chart: ViewChartConfig): ViewBlock => ({ id, type: 'view', mode: 'chart', chart })

/** Composed: monthly Out as bars, its running total as the line, the dashed projection one slot on, a 6,000 budget line. */
export const Composed: Story = {
  args: { config: view('v-composed', { kind: 'composed', xProperty: 'p-month', series: [{ property: 'p-out', agg: 'sum' }], target: 6000 }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /composed chart of Out by Month/ })).toBeInTheDocument()
    // Bars + the running-total line come from the SAME rows: four months → four bars.
    await expect(canvasElement.querySelectorAll('rect[rx="2"]')).toHaveLength(4)
    await expect(canvas.getByText('budget')).toBeInTheDocument()
    // The projection: last total 6,406 carried forward by August's 3,550.
    await expect(canvas.getByText('9,956 projected')).toBeInTheDocument()
    // Axis chrome belongs to cartesian kinds.
    await expect(canvas.getByText('Month')).toBeInTheDocument()
  },
}

/** Net: In minus Out by month — August's bike repair pushes the month below zero (dashed, hollow). */
export const Net: Story = {
  args: { config: view('v-net', { kind: 'net', xProperty: 'p-month', series: [{ property: 'p-in', agg: 'sum' }, { property: 'p-out', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /net chart/ })).toBeInTheDocument()
    await expect(canvas.getByText('below zero — dashed')).toBeInTheDocument()
    // aug: 3200 − 3550 = −350 → the one dashed segment pair and the hollow marker.
    await expect(canvasElement.querySelectorAll('line[stroke-dasharray="3 3"]')).toHaveLength(1)
  },
}

/** Gauge: how many records are reviewed, against the record count (no target set). */
export const Gauge: Story = {
  args: { config: view('v-gauge', { kind: 'gauge', series: [{ property: 'p-reviewed', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /gauge chart/ })).toBeInTheDocument()
    // 5 of 8 reviewed — the figure and the "of N records" line are both read from the rows.
    await expect(canvas.getByText('5')).toBeInTheDocument()
    await expect(canvas.getByText('of 8 records')).toBeInTheDocument()
    // A gauge has no axes, so no ↕/↔ footer (B6).
    await expect(canvas.queryByText('Record')).not.toBeInTheDocument()
  },
}

/** Gauge with a stated goal: total In against a 20,000 target. */
export const GaugeWithTarget: Story = {
  args: { config: view('v-gauge-target', { kind: 'gauge', series: [{ property: 'p-in', agg: 'sum' }], target: 20000 }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('12,500')).toBeInTheDocument()
    await expect(canvas.getByText('of 20,000')).toBeInTheDocument()
  },
}

/** Radar: Out by category — five spokes, one ink polygon. */
export const Radar: Story = {
  args: { config: view('v-radar', { kind: 'radar', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /radar chart/ })).toBeInTheDocument()
    for (const label of ['Rent', 'Food', 'Saved', 'Transport', 'Subs']) {
      await expect(canvas.getByText(label)).toBeInTheDocument()
    }
  },
}

/** Scatter: each record a dot — Energy against Sleep hours (a NUMBER x property → a true two-variable scatter). */
export const Scatter: Story = {
  args: { config: view('v-scatter', { kind: 'scatter', xProperty: 'p-hours', series: [{ property: 'p-energy', agg: 'latest' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /scatter chart/ })).toBeInTheDocument()
    // One dot PER RECORD, never merged — eight rows, eight dots; plus the dashed trend.
    await expect(canvasElement.querySelectorAll('circle[r="3.2"]')).toHaveLength(8)
    await expect(canvasElement.querySelector('line[stroke-dasharray="2 4"]')).not.toBeNull()
  },
}

/** Sankey: the Out total flowing into categories, largest first. */
export const Sankey: Story = {
  args: { config: view('v-sankey', { kind: 'sankey', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /sankey chart/ })).toBeInTheDocument()
    await expect(canvas.getByText('Transport 2,580')).toBeInTheDocument()
    await expect(canvas.getByText('Out 6,406')).toBeInTheDocument()
  },
}

/** Sunburst: categories in the inner ring, each category's records in the outer ring. */
export const Sunburst: Story = {
  args: { config: view('v-sunburst', { kind: 'sunburst', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /sunburst chart/ })).toBeInTheDocument()
    // Legend shares are read from the rows: Transport 2,580 of 6,406 ≈ 40%.
    await expect(canvas.getByText('40%')).toBeInTheDocument()
    await expect(canvas.getByText('outer ring: records')).toBeInTheDocument()
    // Five categories inside, eight records outside (the chart SVG only — the card's
    // axis-label icons are SVGs too).
    await expect(canvasElement.querySelectorAll('svg[role="img"] path')).toHaveLength(13)
  },
}

/** Funnel: Out by category, the view sorted by Out descending so the steps roughly narrow — the first step is the mouth. */
export const Funnel: Story = {
  args: {
    config: {
      ...view('v-funnel', { kind: 'funnel', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }),
      sort: { key: 'p-out', dir: 'desc' },
    },
    schema,
    rows,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('list', { name: /funnel chart/ })).toBeInTheDocument()
    // Steps follow the view's own row order (first-seen bucket under the sort), so a
    // funnel's order is the person's, not the chart's: Transport (2,580) is the mouth.
    const labels = Array.from(canvasElement.querySelectorAll('ol li span[title]')).map((el) => el.textContent)
    await expect(labels).toEqual(['Transport', 'Rent', 'Saved', 'Food', 'Subs'])
    await expect(canvas.getByText('2,580')).toBeInTheDocument()
  },
}

// ── The three Bklit kinds through the same seam, so all eleven sit in one place ──
export const Line: Story = {
  args: { config: view('v-line', { kind: 'line', xProperty: 'p-month', series: [{ property: 'p-in', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Month')).toBeInTheDocument()
    await expect(canvas.getByText('In')).toBeInTheDocument()
  },
}
export const Area: Story = {
  args: { config: view('v-area', { kind: 'area', xProperty: 'p-month', series: [{ property: 'p-out', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Month')).toBeInTheDocument()
    await expect(canvas.getByText('Out')).toBeInTheDocument()
  },
}
export const Bar: Story = {
  args: { config: view('v-bar', { kind: 'bar', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Category')).toBeInTheDocument()
  },
}

// ── Degenerate datasets — where hand-rolled geometry is thinnest ──────────────

/** One record: the net chart centres its single marker and draws no segment. */
export const NetSingleRecord: Story = {
  args: { config: view('v-net-1', { kind: 'net', xProperty: 'p-month', series: [{ property: 'p-in', agg: 'sum' }] }), schema, rows: rows.slice(0, 1) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /net chart/ })).toBeInTheDocument()
    await expect(canvasElement.querySelectorAll('circle')).toHaveLength(1)
    await expect(canvasElement.querySelectorAll('line[stroke-width="1.6"]')).toHaveLength(0)
  },
}

/** Nothing positive to flow: a notice, not card chrome around a blank. */
export const SankeyNothingPositive: Story = {
  args: {
    config: view('v-sankey-neg', { kind: 'sankey', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }),
    schema,
    rows: rows.map((row) => ({ ...row, values: { ...row.values, 'p-out': -Math.abs(Number(row.values['p-out'] ?? 0)) } })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/a sankey needs positive values/)).toBeInTheDocument()
  },
}

/** All-equal values: the funnel is a column of full-width steps, every count equal. */
export const FunnelAllEqual: Story = {
  args: { config: view('v-funnel-eq', { kind: 'funnel', xProperty: 'p-month', series: [{ property: 'p-month', agg: 'count' }] }), schema, rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('list', { name: /funnel chart/ })).toBeInTheDocument()
    await expect(canvas.getAllByText('2')).toHaveLength(4)
  },
}

/** A sliver far thinner than the slice gap still sweeps forward (B1) — two inner slices, no inverted arc. */
export const SunburstTinySlice: Story = {
  args: {
    config: view('v-sunburst-tiny', { kind: 'sunburst', xProperty: 'p-category', series: [{ property: 'p-out', agg: 'sum' }] }),
    schema,
    rows: [
      { id: 'big', title: 'Flat', values: { 'p-category': 'c-rent', 'p-out': 10000 } },
      { id: 'tiny', title: 'Gum', values: { 'p-category': 'c-food', 'p-out': 10 } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', { name: /sunburst chart/ })).toBeInTheDocument()
    const paths = Array.from(canvasElement.querySelectorAll('svg[role="img"] path'))
    await expect(paths).toHaveLength(4)
    // Every arc is drawn with the small-arc flag except the one that genuinely spans > 180°.
    await expect(paths.filter((p) => /A44,44 0 1 1/.test(p.getAttribute('d') ?? ''))).toHaveLength(1)
  },
}

/**
 * The record is the source of truth: the same gauge over rows where one more record
 * has been reviewed reads one higher. Nothing was stored in the view block.
 */
export const GaugeMovesWithTheRecords: Story = {
  args: {
    config: view('v-gauge-moved', { kind: 'gauge', series: [{ property: 'p-reviewed', agg: 'sum' }] }),
    schema,
    rows: rows.map((row) => (row.id === 't3' ? { ...row, values: { ...row.values, 'p-reviewed': true } } : row)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('6')).toBeInTheDocument()
    await expect(canvas.getByText('of 8 records')).toBeInTheDocument()
  },
}
