/**
 * PondChart — the chart card's chrome (#227): its pure half (`chart/chrome.ts`),
 * the card's state contract (`chart/card.tsx`), the host's empty-state decisions
 * (`collection-chart-card.tsx`) and the frame rule (a card chart takes no block
 * card). The measured pixels are the story's (`card.stories.tsx`, computed styles,
 * both themes); this file pins the words and the behaviour.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ChartCard,
  CHART_CARD_STATES,
  CHART_EMPTY_LINE,
  CHART_TYPE_TAG,
  chartEmptyLine,
  chartErrorLine,
} from '@/lib/modules/chart/card'
import { POND_BLOCK_SELECTED_RING } from '@/components/organisms/PondBlock'
import {
  CHART_SKELETON,
  chartOnPath,
  chartProvenance,
  chartReads,
  chartSourceTitle,
} from '@/lib/modules/chart/chrome'
import { CHART_LABEL } from '@/components/molecules/source-entries'
import { CHART_KINDS } from '@/lib/modules/view/aggregate'
import { POND_BLOCK_STATES } from '@/lib/modules/block-frame'
import { POND_BLOCK_FILTERED_EMPTY_LINE } from '@/lib/modules/block-frame'
import { CollectionChart } from '@/lib/modules/view/collection-chart-card'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { ModuleView } from '@/lib/modules/renderers'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { PageRow } from '@/lib/pages/tree'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import { boardChartTypeTags } from './helpers/handoff'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

// The collection seam a view reads through — the test owns the rows.
const collection = {
  schema: [
    { id: 'p-date', name: 'date', type: 'date' },
    { id: 'p-kg', name: 'kg', type: 'number' },
    { id: 'p-note', name: 'note', type: 'text' },
  ] as PropertySchema | null,
  rows: [] as CollectionRow[],
  isLoading: false,
  isError: false,
  addRow: jest.fn().mockResolvedValue('row-new'),
}
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: collection.schema,
    rows: collection.rows,
    isLoading: collection.isLoading,
    isError: collection.isError,
    setValue: jest.fn(),
    addRow: collection.addRow,
    removeRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
  }),
}))

beforeEach(() => {
  collection.rows = []
  collection.isLoading = false
  collection.isError = false
  collection.addRow.mockClear()
})

// ── The pure half ────────────────────────────────────────────────────────────────

describe('chart/chrome — the board’s words, with one owner', () => {
  it('CHART_TYPE_TAG is pond-charts.js’s `type` for every one of PondChart’s thirteen kinds', () => {
    expect(CHART_TYPE_TAG).toEqual(boardChartTypeTags())
    expect(Object.keys(CHART_TYPE_TAG)).toEqual([...CHART_KINDS])
  })

  it('the picker’s CHART_LABEL is derived from it — one table, one documented exception (`area`)', () => {
    expect(CHART_LABEL).toEqual({ ...CHART_TYPE_TAG, area: 'area + target' })
    expect(CHART_TYPE_TAG.area).toBe('area + reference area')
  })

  it('seven states, the board’s order; no `deleted` — a chart card is not a block shell', () => {
    expect(CHART_CARD_STATES).toEqual([
      'rest',
      'hover',
      'selected',
      'empty',
      'loading',
      'error',
      'disabled',
    ])
    expect(POND_BLOCK_STATES).toContain('deleted')
    expect(CHART_CARD_STATES as readonly string[]).not.toContain('deleted')
  })

  it('the skeleton is the board’s four bars: 70%×10 · 100%×90 · 85%×10 · 60%×10', () => {
    expect(CHART_SKELETON).toEqual([
      ['w-[70%]', 'h-[10px]'],
      ['w-full', 'h-[90px]'],
      ['w-[85%]', 'h-[10px]'],
      ['w-[60%]', 'h-[10px]'],
    ])
  })

  it('the empty and error lines name the source, and fall back to the board’s `this table`', () => {
    expect(chartEmptyLine('weigh-ins')).toBe('no rows in weigh-ins yet')
    expect(chartEmptyLine()).toBe('no rows in this table yet')
    expect(chartErrorLine('weigh-ins')).toBe('can’t reach weigh-ins · showing the last copy')
    expect(chartErrorLine()).toBe('can’t reach this table · showing the last copy')
  })

  it('`reads` is the source, then the x field and each series field, deduplicated — or the source alone', () => {
    expect(chartReads('weigh-ins', [{ name: 'date' }, { name: 'kg' }])).toBe('weigh-ins · date, kg')
    expect(chartReads('sessions', [{ name: 'date' }, { name: 'date' }, undefined])).toBe(
      'sessions · date'
    )
    expect(chartReads('nested pages', [undefined, undefined])).toBe('nested pages')
  })

  const row = (id: string, title: string, parent_id: string | null): PageRow => ({
    id,
    title,
    parent_id,
    type: 'page',
    order: 0,
    updated_at: '',
  })
  const rows: PageRow[] = [
    row('health', 'health', null),
    row('weight', 'weight', 'health'),
    row('weigh-ins', 'weigh-ins', 'dbs'),
    row('dbs', 'databases', null),
    row('nameless', '', 'dbs'),
  ]

  it('`on` is the host page’s path, root first, through the breadcrumb’s own rule', () => {
    expect(chartOnPath(rows, 'weight')).toBe('life › health › weight')
    expect(chartOnPath(rows, 'weight', 'my pond')).toBe('my pond › health › weight')
    // 3c's second root: a page under databases is never placed inside life.
    expect(chartOnPath(rows, 'weigh-ins')).toBe('databases › weigh-ins')
    expect(chartOnPath(rows, 'dbs')).toBe('databases')
    // The home row is never among the rows: the root page reads as its label alone.
    expect(chartOnPath(rows, 'home-row')).toBe('life')
  })

  it('the source is the collection page’s title — `untitled` when nameless, absent when unknown', () => {
    expect(chartSourceTitle(rows, 'weigh-ins')).toBe('weigh-ins')
    expect(chartSourceTitle(rows, 'nameless')).toBe('untitled')
    expect(chartSourceTitle(rows, 'nope')).toBeUndefined()
  })

  it('chartProvenance answers both, and neither off a page host', () => {
    expect(chartProvenance(rows, 'weight', 'weigh-ins')).toEqual({
      on: 'life › health › weight',
      source: 'weigh-ins',
    })
    // An inline view reads its HOST page's rows: the source is the page itself.
    expect(chartProvenance(rows, 'weight', 'weight')).toEqual({
      on: 'life › health › weight',
      source: 'weight',
    })
    expect(chartProvenance(rows, undefined, undefined)).toEqual({
      on: undefined,
      source: undefined,
    })
  })
})

// ── The card ─────────────────────────────────────────────────────────────────────

const plot = <svg data-testid="plot" />

describe('ChartCard — the state contract', () => {
  it('rest: the head carries the title and the kind’s tag; the plot draws; no foot without a source', () => {
    const { container } = render(
      <ChartCard kind="net" title="net">
        {plot}
      </ChartCard>
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.dataset.chartKind).toBe('net')
    expect(card.dataset.chartState).toBe('rest')
    expect(card.querySelector('[data-part="title"]')!.textContent).toBe('net')
    expect(card.querySelector('[data-part="type"]')!.textContent).toBe('profit / loss line')
    expect(screen.getByTestId('plot')).toBeInTheDocument()
    expect(card.querySelector('[data-part="foot"]')).toBeNull()
    expect(card.querySelector('[data-part="sub"]')).toBeNull()
    expect(card.hasAttribute('inert')).toBe(false)
    expect(card.getAttribute('aria-busy')).toBeNull()
  })

  it('no title: the head keeps only the tag — nothing is invented to fill the slot', () => {
    const { container } = render(<ChartCard kind="ring">{plot}</ChartCard>)
    expect(container.querySelector('[data-part="title"]')).toBeNull()
    expect(container.querySelector('[data-part="type"]')!.textContent).toBe('ring')
  })

  it('the foot draws each of `on` / `reads` only when given, with the board’s label words', () => {
    const { container, rerender } = render(
      <ChartCard kind="line" on="life › health › weight" reads="weigh-ins · date, kg">
        {plot}
      </ChartCard>
    )
    const foot = container.querySelector<HTMLElement>('[data-part="foot"]')!
    expect(foot.querySelector('[data-part="on"]')!.textContent).toBe('onlife › health › weight')
    expect(foot.querySelector('[data-part="reads"]')!.textContent).toBe('readsweigh-ins · date, kg')
    rerender(
      <ChartCard kind="line" reads="weigh-ins">
        {plot}
      </ChartCard>
    )
    expect(container.querySelector('[data-part="on"]')).toBeNull()
    expect(container.querySelector('[data-part="reads"]')!.textContent).toBe('readsweigh-ins')
  })

  it('loading: aria-busy, the four-bar skeleton, no plot', () => {
    const { container } = render(
      <ChartCard kind="line" state="loading">
        {plot}
      </ChartCard>
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByTestId('plot')).toBeNull()
    const bars = card.querySelectorAll('[data-part="skeleton"] > span')
    expect(bars).toHaveLength(4)
    expect(Array.from(bars).map((b) => b.className)).toEqual(
      CHART_SKELETON.map(([w, h]) => `block rounded-[6px] bg-mn-text/[0.08] ${w} ${h}`)
    )
  })

  it('error: the plot stays, faded; the notice names the source and offers `reconnect`', () => {
    const { container } = render(
      <ChartCard kind="line" state="error" source="weigh-ins">
        {plot}
      </ChartCard>
    )
    const plotEl = screen.getByTestId('plot')
    expect(plotEl.parentElement!.className).toContain('opacity-[0.45]')
    const notice = container.querySelector<HTMLElement>('[data-kind="notice"]')!
    expect(notice.querySelector('[data-part="title"]')!.textContent).toBe(
      'can’t reach weigh-ins · showing the last copy'
    )
    expect(notice.querySelector('[data-part="action"]')!.textContent).toBe('reconnect')
  })

  it('disabled: `inert`, no `aria-disabled` — AT ignores it on a generic div (#238)', () => {
    const { container } = render(
      <ChartCard kind="line" state="disabled">
        {plot}
      </ChartCard>
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.hasAttribute('inert')).toBe(true)
    expect(card.getAttribute('aria-disabled')).toBeNull()
    expect(card.className).toContain('opacity-40')
  })

  it('selected consumes the block shell’s ring recipe beside the card shadow', () => {
    const { container } = render(
      <ChartCard kind="line" state="selected">
        {plot}
      </ChartCard>
    )
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('ring-2 ring-mn-text')
    expect(cls).toContain('shadow-mn-card')
  })

  it('the tip draws only when given; it is the plot box’s own child, never a hit target', () => {
    const { container, rerender } = render(<ChartCard kind="line">{plot}</ChartCard>)
    expect(container.querySelector('[data-part="tip"]')).toBeNull()
    rerender(
      <ChartCard kind="line" state="hover" tip={{ a: '12 sep', b: '80.4 kg' }}>
        {plot}
      </ChartCard>
    )
    const tip = container.querySelector<HTMLElement>('[data-part="tip"]')!
    expect(tip.parentElement!.dataset.part).toBe('plot')
    expect(tip.textContent).toBe('12 sep80.4 kg')
    expect(tip.className).toContain('pointer-events-none')
  })

  it('rest is live to the pointer: the same lift and shadow swap ride `hover:` on the rest card', () => {
    // A synthetic `userEvent.hover` cannot set the browser's `:hover` pseudo-state, so
    // the live recipe is pinned by its literals here and measured forced in the story.
    const { container } = render(<ChartCard kind="line">{plot}</ChartCard>)
    const cls = (container.firstElementChild as HTMLElement).className
    expect(cls).toContain('shadow-mn-card')
    expect(cls).toContain('hover:transform-[translateY(-1px)]')
    expect(cls).toContain(
      'hover:shadow-[0_2px_4px_rgba(40,34,24,.06),0_14px_32px_rgba(40,34,24,.1)]'
    )
    expect(cls).toContain(
      'dark:hover:shadow-[0_2px_4px_rgba(0,0,0,.34),0_14px_32px_rgba(0,0,0,.4)]'
    )
    expect(cls).not.toContain('ring-2')
  })

  it('no `cn()` size+colour collision: the type tag keeps both its size and its tier', () => {
    const { container } = render(<ChartCard kind="line">{plot}</ChartCard>)
    const tag = container.querySelector<HTMLElement>('[data-part="type"]')!
    expect(tag.className).toContain('text-[10.5px]')
    expect(tag.className).toContain('text-mn-text-meta')
  })
})

// ── The host’s decisions ─────────────────────────────────────────────────────────

const schema: PropertySchema = collection.schema!
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
const provenance = { on: 'life › health › weight', source: 'weigh-ins' }

describe('CollectionChart — which empty line is true, and when `add a row` is the action', () => {
  it('no rows at all: `no rows in weigh-ins yet` + `add a row`, wired to the collection', () => {
    const onAddRow = jest.fn()
    render(
      <CollectionChart
        config={config}
        schema={schema}
        rows={[]}
        totalRows={0}
        provenance={provenance}
        onAddRow={onAddRow}
      />
    )
    expect(screen.getByText('no rows in weigh-ins yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'add a row' }))
    expect(onAddRow).toHaveBeenCalledTimes(1)
  })

  it('rows exist, the filter hides them all: the filter line and NO action', () => {
    render(
      <CollectionChart
        config={config}
        schema={schema}
        rows={[]}
        totalRows={3}
        provenance={provenance}
        onAddRow={jest.fn()}
      />
    )
    expect(screen.getByText(POND_BLOCK_FILTERED_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('rows exist but none carries a number: `no data yet` and NO action — never a false `no rows`', () => {
    const rows = [weighIn('r1', '2026-09-01'), weighIn('r2', '2026-09-08')]
    render(
      <CollectionChart
        config={config}
        schema={schema}
        rows={rows}
        totalRows={2}
        provenance={provenance}
        onAddRow={jest.fn()}
      />
    )
    expect(screen.getByText(CHART_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.queryByText(/no rows/)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  // A collection that cannot be read is NOT an empty one. Reported as empty, the
  // card states something false about the data (#239's ruling) and — worse — offers
  // a live `add a row` against a collection that is not there.
  it('a collection it could not read draws the error state, not `no rows`, and offers nothing', () => {
    render(
      <CollectionChart
        config={config}
        schema={null}
        rows={[]}
        totalRows={0}
        errorLine="That collection couldn’t be read."
        provenance={provenance}
        onAddRow={jest.fn()}
      />
    )
    expect(screen.getByText('That collection couldn’t be read.')).toBeInTheDocument()
    expect(screen.queryByText(/no rows/)).toBeNull()
    // `reconnect` is the board's action for a source that is still there; it is not
    // an offer this error can make good on.
    expect(screen.queryByRole('button', { name: 'reconnect' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'add a row' })).toBeNull()
  })

  it('rest: the head and foot strings come from the block, the config and the provenance', () => {
    const rows = [weighIn('r1', '2026-09-01', 80.4), weighIn('r2', '2026-09-08', 80.1)]
    const { container } = render(
      <CollectionChart
        config={config}
        schema={schema}
        rows={rows}
        totalRows={2}
        provenance={provenance}
      />
    )
    const card = container.querySelector<HTMLElement>('[data-chart-kind="line"]')!
    expect(card.dataset.chartState).toBe('rest')
    expect(card.querySelector('[data-part="title"]')!.textContent).toBe('weight')
    expect(card.querySelector('[data-part="type"]')!.textContent).toBe('line')
    expect(card.querySelector('[data-part="on"]')!.textContent).toBe('onlife › health › weight')
    expect(card.querySelector('[data-part="reads"]')!.textContent).toBe('readsweigh-ins · date, kg')
    // `sub` has no source — it is omitted, never invented.
    expect(card.querySelector('[data-part="sub"]')).toBeNull()
  })

  it('loading: the skeleton, with `reads` naming the source alone until the schema arrives', () => {
    const { container } = render(
      <CollectionChart
        config={config}
        schema={null}
        rows={[]}
        totalRows={0}
        isLoading
        provenance={provenance}
      />
    )
    const card = container.querySelector<HTMLElement>('[data-chart-kind="line"]')!
    expect(card.dataset.chartState).toBe('loading')
    expect(card.querySelector('[data-part="skeleton"]')).not.toBeNull()
    expect(card.querySelector('[data-part="reads"]')!.textContent).toBe('readsweigh-ins')
  })

  it('off a page host: no `on`, no `reads`, and the empty line falls back to the board’s word', () => {
    const { container } = render(
      <CollectionChart config={config} schema={schema} rows={[]} totalRows={0} />
    )
    expect(container.querySelector('[data-part="foot"]')).toBeNull()
    expect(screen.getByText('no rows in this table yet')).toBeInTheDocument()
  })
})

// ── The frame rule, in the canvas ────────────────────────────────────────────────

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          onChange={jest.fn()}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

describe('BlockCanvas — a card chart is its own card; it is not wrapped in a block card', () => {
  it('renders PondChart with no PondBlock around it, and its own empty state with `add a row`', () => {
    renderCanvas([config])
    const host = document.getElementById('block-v1')!
    expect(host.querySelector('[data-block-kind]')).toBeNull()
    const card = host.querySelector<HTMLElement>('[data-chart-kind]')!
    expect(card.dataset.chartKind).toBe('line')
    expect(card.dataset.chartState).toBe('empty')
    // Not the bare-prose wrapper either: the card sits on the page as it is.
    expect(card.parentElement!.className).not.toContain('px-1')
    fireEvent.click(screen.getByRole('button', { name: 'add a row' }))
    expect(collection.addRow).toHaveBeenCalledTimes(1)
  })

  // `add a row` writes to the collection. A diff card and the create-page proposal
  // both render this view with NO `editable` — a working insert
  // there would change a page from a surface whose whole job is to be reviewed.
  // `PROJECT_RULES.md`: pages change only through the person's own edits or an
  // accepted diff.
  it('a read-only host offers no `add a row`, though the empty line still reads true', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ModuleView type="view" data={config} />
      </QueryClientProvider>
    )
    expect(screen.getByText(/no rows in/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'add a row' })).toBeNull()
    expect(collection.addRow).not.toHaveBeenCalled()
  })

  // A collection the view could not read is not an empty one, on any host.
  it('a failed read draws the error line rather than `no rows`, and offers nothing', () => {
    collection.isError = true
    renderCanvas([config])
    const card = document
      .getElementById('block-v1')!
      .querySelector<HTMLElement>('[data-chart-kind]')!
    expect(card.dataset.chartState).toBe('error')
    expect(screen.getByText('That collection couldn’t be read.')).toBeInTheDocument()
    expect(screen.queryByText(/no rows/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'add a row' })).toBeNull()
  })

  it('a compact mark keeps the block card (#259) — the two presentations do not converge', () => {
    const compact: ViewBlock = {
      ...config,
      id: 'v2',
      chart: { ...config.chart!, kind: 'bar', presentation: 'compact' },
    }
    renderCanvas([compact])
    const host = document.getElementById('block-v2')!
    expect(host.querySelector<HTMLElement>('[data-block-kind]')!.dataset.blockKind).toBe('table')
    expect(host.querySelector('[data-chart-kind]')).toBeNull()
  })
})

// `ChartCard` bypasses `PondBlock` (#227), so pointer selection (07.05) reaches it
// through `BlockRowContext` rather than the `state` prop `PondBlock` threads for
// every other kind — pinned separately from KAN-106's own row suite.
describe('BlockCanvas — a click on the chart card’s own padding selects it, same ring as PondBlock (KAN-344)', () => {
  it('draws PondBlock’s own `selected` ring on the chart card itself, not the row', async () => {
    collection.rows = [weighIn('r1', '2026-09-01', 80.4), weighIn('r2', '2026-09-08', 80.1)]
    const user = userEvent.setup()
    renderCanvas([config])
    const group = document.getElementById('block-v1')!
    const card = group.querySelector<HTMLElement>('[data-chart-kind]')!
    expect(card.dataset.chartState).toBe('rest')

    await user.click(group)
    expect(card.dataset.chartState).toBe('selected')
    expect(card.className).toContain(POND_BLOCK_SELECTED_RING)
    expect(group.className).not.toContain('ring-2')
  })
})
