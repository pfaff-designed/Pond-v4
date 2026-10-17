/**
 * The compact chart presentation (#259, child 228c of #228) — everything around
 * the pure rules (`src/lib/modules/view/chart-compact.test.ts` has those):
 *
 *   schema      `chart.presentation` is optional and defaults to the card, so every
 *               persisted chart view still parses and nothing shipped changes; the
 *               schema carries NO data array (#111's law — the board's `f: [9, 12,
 *               …]` is a fixture, never a field)
 *   serialize   the flag reaches the model, or a compact strip comes back as a card
 *               on the next wholesale `edit` (#250's `serif` precedent)
 *   emit        `ai-composition`'s view entry accepts the flag and the catalog
 *               teaches it (ADR 0006: a shape absent from the emit union is one
 *               Pond cannot use)
 *   frame       `blockEmptyBox` picks the board's `voidBox` for a compact bar strip
 *               only; `PondBlockEmpty box="void"` is the voidBox class recipe (the
 *               computed values are in the stories); the canvas hands a compact
 *               bar strip the void line alone and never takes over a heat grid
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PondBlock, PondBlockEmpty } from '@/components/organisms/PondBlock'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { isoDay } from '@/lib/modules/view/heatmap-data'
import { blockEmptyBox } from '@/lib/modules/block-frame'
import { moduleCatalog, moduleDataSchema } from '@/lib/modules/ai-composition'
import { CHART_EMPTY_LINE } from '@/lib/modules/chart/card'
import {
  CHART_PRESENTATIONS,
  viewDescriptor,
  viewSchema,
  type ViewBlock,
  type ViewChartConfig,
} from '@/lib/modules/view/schema'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

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
    { id: 'p-week', name: 'Week', type: 'text' },
    { id: 'p-day', name: 'Day', type: 'date' },
    { id: 'p-km', name: 'Distance', type: 'number' },
  ] as PropertySchema | null,
  rows: [] as CollectionRow[],
  isLoading: false,
  addRow: jest.fn().mockResolvedValue('row-new'),
}
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: collection.schema,
    rows: collection.rows,
    isLoading: collection.isLoading,
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
  collection.addRow.mockClear()
})

const series: ViewChartConfig['series'] = [{ property: 'p-km', agg: 'sum' }]
const bars: ViewBlock = {
  id: 'v-bars',
  type: 'view',
  mode: 'chart',
  chart: { kind: 'bar', xProperty: 'p-week', series, presentation: 'compact' },
}
const heat: ViewBlock = {
  id: 'v-heat',
  type: 'view',
  mode: 'chart',
  chart: { kind: 'heatmap', xProperty: 'p-day', series, presentation: 'compact' },
}
const card: ViewBlock = {
  id: 'v-card',
  type: 'view',
  mode: 'chart',
  chart: { kind: 'bar', xProperty: 'p-week', series },
}

// ── schema ────────────────────────────────────────────────────────────────────────

describe('viewChartConfigSchema.presentation — optional, defaulting to the card', () => {
  it('a persisted chart view with no presentation still parses, unchanged', () => {
    const parsed = viewSchema.safeParse(card)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.chart?.presentation).toBeUndefined()
    expect(parsed.success && parsed.data).toEqual(card)
  })

  it.each(CHART_PRESENTATIONS)('round-trips presentation %s', (presentation) => {
    const block = { ...card, chart: { ...card.chart!, presentation } }
    const parsed = viewSchema.safeParse(block)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.chart?.presentation).toBe(presentation)
  })

  it('rejects a presentation the board does not draw', () => {
    expect(
      viewSchema.safeParse({ ...card, chart: { ...card.chart, presentation: 'strip' } }).success
    ).toBe(false)
  })

  it('carries NO data array — the board’s `f: [9, 12, …]` is a fixture, never a field (#111)', () => {
    const parsed = viewSchema.parse({
      ...bars,
      chart: { ...bars.chart, values: [9, 12, 10], points: [{ x: 'w1', values: {} }], cells: [] },
    } as unknown)
    expect(parsed.chart).toEqual(bars.chart)
    expect(Object.keys(parsed.chart!)).not.toEqual(expect.arrayContaining(['values']))
    expect('points' in parsed.chart!).toBe(false)
    expect('cells' in parsed.chart!).toBe(false)
  })
})

// ── serialize ─────────────────────────────────────────────────────────────────────

describe('viewDescriptor.serialize — the presentation reaches the model', () => {
  it('names a compact chart compact, so a re-emit keeps the strip a strip', () => {
    expect(viewDescriptor.serialize(bars)).toContain('chart bar, compact')
    expect(viewDescriptor.serialize(heat)).toContain('chart heatmap, compact')
  })

  it('says nothing extra for the default card', () => {
    const out = viewDescriptor.serialize(card)
    expect(out).toContain('chart bar')
    expect(out).not.toContain('compact')
  })
})

// ── emit vocabulary ───────────────────────────────────────────────────────────────

describe('ai-composition — Pond can compose a compact chart', () => {
  it('accepts a compact chart view in the emit union', () => {
    const { id: _id, ...data } = bars
    void _id
    expect(moduleDataSchema.safeParse(data).success).toBe(true)
  })

  it('teaches when compact is right, on the view line of the catalog', () => {
    const viewLine = moduleCatalog.split('\n').find((l) => l.startsWith('- view:'))!
    expect(viewLine).toContain('compact')
    expect(viewLine).toMatch(/bar strip/i)
    expect(viewLine).toMatch(/heatmap/i)
  })
})

// ── the frame's void box ──────────────────────────────────────────────────────────

describe('blockEmptyBox — the voidBox for a compact bar strip, the emptyBox for all else', () => {
  it('void only for mode chart · kind bar · presentation compact', () => {
    expect(blockEmptyBox(bars)).toBe('void')
    expect(blockEmptyBox(card)).toBe('box')
    // heat draws its own empty grid — the frame never takes it, so no box applies.
    expect(blockEmptyBox(heat)).toBe('box')
    expect(blockEmptyBox({ ...bars, chart: { ...bars.chart!, kind: 'line' } })).toBe('box')
    expect(blockEmptyBox({ id: 'v', type: 'view', mode: 'table' })).toBe('box')
    expect(blockEmptyBox({ id: 't', type: 'todo', items: [] })).toBe('box')
  })
})

const VOID_BOX_CLASSES = [
  'flex',
  'h-[72px]', // height 72
  'items-center',
  'justify-center', // the one line, centred — no action slot
  'rounded-[12px]', // radius 12
  'ring-[1.4px]', // inset 0 0 0 1.4px
  'ring-inset',
  'ring-mn-text/[0.14]', // a(.14)
]

describe('PondBlockEmpty box="void" — the board’s voidBox, in the one empty component', () => {
  it('draws the voidBox recipe with a mono 11 / ink .68 line and no ground', () => {
    const { container } = render(<PondBlockEmpty box="void" line={CHART_EMPTY_LINE} />)
    const box = container.firstElementChild as HTMLElement
    expect(box.dataset.part).toBe('empty')
    expect(box.dataset.emptyBox).toBe('void')
    const classes = box.className.split(' ')
    for (const cls of VOID_BOX_CLASSES) expect(classes).toContain(cls)
    expect(classes).not.toContain('bg-mn-text/[0.035]')
    expect(classes).not.toContain('p-[14px]')

    const text = screen.getByText(CHART_EMPTY_LINE)
    const textClasses = text.className.split(' ')
    expect(textClasses).toContain('font-mono')
    expect(textClasses).toContain('text-[11px]')
    expect(textClasses).toContain('text-mn-text-secondary')
  })

  it('has no action slot: an onAction is not drawn in it', () => {
    render(<PondBlockEmpty box="void" kind="table" line={CHART_EMPTY_LINE} onAction={jest.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('the default box is unchanged — the #239 recipe with the action', () => {
    render(<PondBlockEmpty kind="table" onAction={jest.fn()} />)
    const box = screen.getByText('no rows yet').parentElement!
    expect(box.dataset.emptyBox).toBe('box')
    expect(box.className.split(' ')).toContain('bg-mn-text/[0.035]')
    expect(screen.getByRole('button', { name: 'add a row' })).toBeInTheDocument()
  })

  it('PondBlock state="empty" passes emptyBox through', () => {
    const { container } = render(
      <PondBlock
        kind="table"
        heading="by week"
        state="empty"
        emptyBox="void"
        emptyLine={CHART_EMPTY_LINE}
      >
        <p>strip</p>
      </PondBlock>
    )
    const box = container.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box.dataset.emptyBox).toBe('void')
    expect(box.className.split(' ')).toContain('h-[72px]')
  })
})

// ── the canvas ────────────────────────────────────────────────────────────────────

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

const cardOf = (id: string) =>
  document.getElementById(`block-${id}`)!.querySelector<HTMLElement>('[data-block-kind]')!

const row = (id: string, values: Record<string, unknown>): CollectionRow => ({
  id,
  title: id,
  values,
})

describe('BlockCanvas — a compact chart’s empty state is the board’s, not the table kind’s', () => {
  it('a compact bar strip over an empty collection: the voidBox with the chart’s own line, alone', () => {
    renderCanvas([bars])
    const c = cardOf('v-bars')
    // Still the chart's `table` card (500) — the board gives bars no width of its own.
    expect(c.dataset.blockKind).toBe('table')
    expect(c.dataset.blockState).toBe('empty')
    const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box.dataset.emptyBox).toBe('void')
    // `no data yet` is true whether rows are missing or carry no number; the table
    // kind's `no rows yet` is not the chart's line, and the board draws no action.
    expect(box.textContent).toBe(CHART_EMPTY_LINE)
    expect(c.textContent).not.toContain('no rows yet')
    expect(c.querySelector('button')).toBeNull()
  })

  it('a compact bar strip whose filter hides every row: the filter line, in the voidBox', () => {
    collection.rows = [row('r1', { 'p-week': 'w1', 'p-km': 5 })]
    renderCanvas([{ ...bars, filter: { property: 'p-week', op: 'eq', value: 'nope' } }])
    const c = cardOf('v-bars')
    expect(c.dataset.blockState).toBe('empty')
    const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box.dataset.emptyBox).toBe('void')
    expect(box.textContent).toBe('nothing matches this filter')
  })

  it('a compact bar strip with rows: the strip, last bar current, heights off the max', () => {
    collection.rows = [
      row('r1', { 'p-week': 'w1', 'p-km': 6 }),
      row('r2', { 'p-week': 'w2', 'p-km': 9 }),
      row('r3', { 'p-week': 'w3', 'p-km': 7 }),
      row('r4', { 'p-week': 'w4', 'p-km': 11 }),
    ]
    renderCanvas([bars])
    const c = cardOf('v-bars')
    expect(c.dataset.blockState).toBe('rest')
    const strip = c.querySelector<HTMLElement>('[data-part="bars"]')!
    expect(strip).not.toBeNull()
    const barEls = Array.from(strip.querySelectorAll<HTMLElement>('[data-part="bar"]'))
    expect(barEls.map((b) => b.style.height)).toEqual(['55%', '82%', '64%', '100%'])
    expect(barEls.map((b) => 'current' in b.dataset)).toEqual([false, false, false, true])
    expect(barEls[3].className.split(' ')).toContain('bg-mn-text')
    expect(barEls[0].className.split(' ')).toContain('bg-mn-text/[0.28]')
    // No chart-card chrome around the mark.
    expect(c.querySelector('svg')).toBeNull()
  })

  it('a compact heat grid over an empty collection is NOT an empty frame — it draws 84 cells at ink .07', () => {
    renderCanvas([heat])
    const c = cardOf('v-heat')
    expect(c.dataset.blockState).toBe('rest')
    expect(c.querySelector('[data-part="empty"]')).toBeNull()
    const cells = c.querySelectorAll<HTMLElement>('[data-part="cell"]')
    expect(cells).toHaveLength(84)
    for (const cell of cells) {
      expect(cell.dataset.level).toBe('off')
      expect(cell.className.split(' ')).toContain('bg-mn-text/[0.07]')
    }
  })

  it('a compact heat grid with a record today lights today at full ink and nothing else', () => {
    const iso = isoDay(new Date())
    collection.rows = [row('r1', { 'p-day': iso, 'p-km': 3 })]
    renderCanvas([heat])
    const c = cardOf('v-heat')
    const cells = Array.from(c.querySelectorAll<HTMLElement>('[data-part="cell"]'))
    expect(cells).toHaveLength(84)
    const lit = cells.filter((cell) => cell.dataset.level !== 'off')
    expect(lit).toHaveLength(1)
    expect(lit[0].dataset.level).toBe('recent')
    expect(lit[0].className.split(' ')).toContain('bg-mn-text')
    // The lit cell is TODAY's, so in column-major order it falls in the LAST column
    // (cells 77-83). Its exact index inside that column is today's weekday, since the
    // columns are Sunday-start weeks — so assert the column, not a fixed index, or the
    // test passes only on a Saturday.
    const index = cells.indexOf(lit[0])
    expect(index).toBeGreaterThanOrEqual(77)
    expect(index).toBeLessThanOrEqual(83)
    expect(index - 77).toBe(new Date().getDay())
    // No `title` tooltip: a hover tooltip is an affordance and no board draws one on
    // these marks (#259 review). The grid carries its reading as an accessible name.
    expect(lit[0].title).toBe('')
    expect(c.querySelector('[data-part="heat"]')?.getAttribute('aria-label')).toContain(
      'the last twelve weeks'
    )
  })

  it('the default card presentation draws the chart CARD — PondChart, its own card, no block card and no strip (#227)', () => {
    collection.rows = [row('r1', { 'p-week': 'w1', 'p-km': 6 })]
    renderCanvas([card])
    const host = document.getElementById('block-v-card')!
    expect(host.querySelector('[data-block-kind]')).toBeNull()
    const c = host.querySelector<HTMLElement>('[data-chart-kind]')!
    expect(c.dataset.chartKind).toBe('bar')
    expect(c.dataset.chartState).toBe('rest')
    expect(c.querySelector('[data-part="bars"]')).toBeNull()
  })
})
