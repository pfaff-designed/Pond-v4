import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { CollectionChart } from './collection-chart-card'
import { CHART_EMPTY_LINE } from '../chart/card'
import { POND_BLOCK_FILTERED_EMPTY_LINE } from '../block-frame'
import type { CollectionRow } from './apply'
import type { ViewBlock } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * The chart CARD's HOST (#227) — which of the board's five head/foot strings has a
 * true source, and which empty sentence is true of the data. The card's own pixels
 * are measured in `chart/card.stories.tsx`; what this file pins is the host's
 * DECISIONS, each of which fails silently by stating something false:
 *
 *   no rows at all        `no rows in {source} yet` + `add a row` — the one honest offer
 *   the filter hides all  `nothing matches this filter`, NO action
 *   rows but no number    `no data yet`, NO action — never a false `no rows`
 *   unreadable            the error sentence, and NOTHING offered: neither `reconnect`
 *                         (the source is gone) nor `add a row` (there is nothing to add to)
 *   loading               the skeleton, with `reads` naming the source ALONE until the
 *                         fields arrive — incomplete, never false
 *   off a page host       no foot at all, and the board's `this table` fallback
 *
 * `sub` has no true source today and is therefore omitted everywhere, never invented.
 */
const schema: PropertySchema = [
  { id: 'p-date', name: 'date', type: 'date' },
  { id: 'p-kg', name: 'kg', type: 'number' },
  { id: 'p-note', name: 'note', type: 'text' },
]

const config: ViewBlock = {
  id: 'v1',
  type: 'view',
  mode: 'chart',
  label: 'weight',
  chart: { kind: 'line', xProperty: 'p-date', series: [{ property: 'p-kg', agg: 'sum' }] },
}

const weighIn = (id: string, date: string, kg?: number): CollectionRow => ({
  id,
  title: id,
  values: kg === undefined ? { 'p-date': date } : { 'p-date': date, 'p-kg': kg },
})

const weighIns = [weighIn('r1', '2026-09-01', 80.4), weighIn('r2', '2026-09-08', 80.1)]
const provenance = { on: 'life › health › weight', source: 'weigh-ins' }

/** The spy the one honest empty action lands on. */
const onAddRow = fn()

const meta = {
  title: 'Modules/View/Chart card host',
  component: CollectionChart,
  parameters: { layout: 'padded' },
  args: { config, schema, rows: weighIns, totalRows: weighIns.length, provenance },
} satisfies Meta<typeof CollectionChart>

export default meta
type Story = StoryObj<typeof meta>

const card = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-chart-kind]')!
const part = (root: HTMLElement, name: string) =>
  card(root).querySelector<HTMLElement>(`[data-part="${name}"]`)

/** rest — the five strings, each from its own source, and nothing invented for `sub`. */
export const Rest: Story = {
  play: async ({ canvasElement }) => {
    const c = card(canvasElement)
    await expect(c.dataset.chartKind).toBe('line')
    await expect(c.dataset.chartState).toBe('rest')
    // title ← the block's label; typeTag ← the resolved kind
    await expect(part(canvasElement, 'title')!.textContent).toBe('weight')
    await expect(part(canvasElement, 'type')!.textContent).toBe('line')
    // on ← the host page's path; reads ← the source + its RESOLVED fields
    await expect(part(canvasElement, 'on')!.textContent).toBe('onlife › health › weight')
    await expect(part(canvasElement, 'reads')!.textContent).toBe('readsweigh-ins · date, kg')
    // sub has no true source — omitted, never invented.
    await expect(part(canvasElement, 'sub')).toBeNull()
    await expect(part(canvasElement, 'empty')).toBeNull()
  },
}

/** No rows at all: the source is named, and `add a row` is the honest action. */
export const NoRows: Story = {
  args: { rows: [], totalRows: 0, onAddRow },
  play: async ({ canvasElement }) => {
    onAddRow.mockClear()
    const canvas = within(canvasElement)
    await expect(card(canvasElement).dataset.chartState).toBe('empty')
    await expect(canvas.getByText('no rows in weigh-ins yet')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'add a row' }))
    await expect(onAddRow).toHaveBeenCalledTimes(1)
  },
}

/** Rows exist but the filter hides them all: the filter's line, and NO action. */
export const FilterHidesEveryRow: Story = {
  args: { rows: [], totalRows: 3, onAddRow },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(card(canvasElement).dataset.chartState).toBe('empty')
    await expect(canvas.getByText(POND_BLOCK_FILTERED_EMPTY_LINE)).toBeInTheDocument()
    await expect(canvas.queryByText(/no rows/)).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

/** Rows exist, none carries a number: `no data yet` — a false `no rows` is the bug. */
export const RowsWithoutANumber: Story = {
  args: {
    rows: [weighIn('r1', '2026-09-01'), weighIn('r2', '2026-09-08')],
    totalRows: 2,
    onAddRow,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(card(canvasElement).dataset.chartState).toBe('empty')
    await expect(canvas.getByText(CHART_EMPTY_LINE)).toBeInTheDocument()
    await expect(canvas.queryByText(/no rows/)).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}

/**
 * A collection it could not read is NOT an empty one: reported as empty the card
 * states something false about the data (#239's ruling) and offers a live `add a row`
 * against a collection that is not there. `reconnect` is equally untrue of a source
 * that is gone, so a custom error line draws no action at all.
 */
export const Unreadable: Story = {
  args: {
    schema: null,
    rows: [],
    totalRows: 0,
    errorLine: 'That collection couldn’t be read.',
    onAddRow,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(card(canvasElement).dataset.chartState).toBe('error')
    await expect(canvas.getByText('That collection couldn’t be read.')).toBeInTheDocument()
    await expect(canvas.queryByText(/no rows/)).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'reconnect' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'add a row' })).not.toBeInTheDocument()
  },
}

/** loading — the skeleton, with `reads` naming the source alone until the schema lands. */
export const Loading: Story = {
  args: { schema: null, rows: [], totalRows: 0, isLoading: true },
  play: async ({ canvasElement }) => {
    await expect(card(canvasElement).dataset.chartState).toBe('loading')
    await expect(part(canvasElement, 'skeleton')).not.toBeNull()
    await expect(part(canvasElement, 'reads')!.textContent).toBe('readsweigh-ins')
  },
}

/** Off a page host: no `on`, no `reads`, no foot — and the board's `this table`. */
export const OffAPageHost: Story = {
  args: { rows: [], totalRows: 0, provenance: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(part(canvasElement, 'foot')).toBeNull()
    await expect(canvas.getByText('no rows in this table yet')).toBeInTheDocument()
  },
}
