/**
 * #260 (child 228d of #228) — `gallery`, `gantt`, `number` and `props` mapped into
 * their `PondBlock` cards. Nothing new is persisted: three are `view` modes and the
 * fourth is `PropertyInspector`, so this pins the MAPPING and the board geometry each
 * body now draws (`PondTemplate.dc.html`'s `renderVals()`), on the class recipe —
 * jsdom has no layout; the computed values are the stories' job:
 *
 *   frame     gallery → `gallery` 580 · big-number → `number` 400 · gantt → `table` 500
 *             (confirmed, not changed); the inspector → `properties` 400
 *   gallery   grid repeat(3) · gap 10 · tile 64 / radius 12 / ink .07 · title 13.5/500 ·
 *             meta mono 10.5 / ink .68 · NO three-card cap (`slice(0, 3)` is the
 *             template preview's truncation)
 *   gantt     head border ink .09 and row border ink .055 — two values, neither
 *             `--mn-hair` · 120px label column · gap 10 · track 18 with 25% gridlines ·
 *             bars top/bottom 4, radius 4, done ink .22 / live full ink · mono-10 ticks
 *             at the range's quarters · empty as the shared voidBox through `PondBlockEmpty`
 *   number    52 / 700 / -.03em / line-height .95 / tabular-nums (ADR 0004 §5) ·
 *             mono-11 sub · `—` at ink .68 when there is nothing to read
 *   props     the inspector's rows ARE `PondMolecule kind="field-row"` (ADR 0004's
 *             ladder: `PondBlock.dc.html`'s properties frame dc-imports the molecule
 *             and it expresses every atom kind the templates need), the control riding
 *             in the molecule's value slot; it derives from `_schema` and holds no copy
 */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { PondMolecule } from '@/components/molecules/PondMolecule'
import { PropertyInspector } from '@/components/molecules/PropertyInspector'
import { pageEyebrowClass } from '@/components/atoms/kicker'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { CollectionView } from '@/lib/modules/view/view'
import { galleryCardMeta, galleryCardTag } from '@/lib/modules/view/apply'
import {
  blockEmptyBox,
  blockFrame,
  POND_BLOCK_WIDTHS,
  propertiesFrame,
} from '@/lib/modules/block-frame'
import { GANTT_EMPTY_LINE } from '@/lib/modules/view/kinds'
import { GANTT_BAR_INK, GANTT_TICK_COUNT, ganttRowDone } from '@/lib/modules/view/gantt-shared'
import { POND_BLOCK_FILTERED_EMPTY_LINE } from '@/components/organisms/PondBlock'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'
import type { ViewBlock } from '@/lib/modules/view/schema'

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
  schema: null as PropertySchema | null,
  rows: [] as CollectionRow[],
  addRow: jest.fn().mockResolvedValue('row-new'),
}
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: collection.schema,
    rows: collection.rows,
    isLoading: false,
    setValue: jest.fn(),
    addRow: collection.addRow,
    removeRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
  }),
}))

// ── Fixtures ────────────────────────────────────────────────────────────────────

/** The project template's `tasks — timeline`: a status to be done by, and two dates. */
const taskSchema: PropertySchema = [
  {
    id: 'p-status',
    name: 'Status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'To do' },
      { id: 'o-doing', label: 'Doing' },
      { id: 'o-done', label: 'Done' },
    ],
  },
  { id: 'p-start', name: 'Start', type: 'date' },
  { id: 'p-due', name: 'Due', type: 'date' },
]

const row = (id: string, title: string, values: Record<string, unknown>): CollectionRow => ({
  id,
  title,
  values,
})

/** The board's fixture: `['book the van', 0, 8, 1]` … over `20 oct … 10 nov`-shaped ticks. */
const taskRows: CollectionRow[] = [
  row('t1', 'book the van', {
    'p-status': 'o-done',
    'p-start': '2026-10-20',
    'p-due': '2026-10-22',
  }),
  row('t2', 'sort the loft', {
    'p-status': 'o-doing',
    'p-start': '2026-10-25',
    'p-due': '2026-11-03',
  }),
  row('t3', 'meter readings', {
    'p-status': 'o-todo',
    'p-start': '2026-11-14',
    'p-due': '2026-11-16',
  }),
]

const gantt: ViewBlock = { id: 'v-gantt', type: 'view', mode: 'gantt' }
const gallery: ViewBlock = { id: 'v-gallery', type: 'view', mode: 'gallery' }
const bigNumber: ViewBlock = { id: 'v-number', type: 'view', mode: 'big-number' }

/** The collection template's `records`: `[['monstera', 'water weekly'], …]`. */
const plantSchema: PropertySchema = [
  { id: 'p-care', name: 'Care', type: 'text' },
  { id: 'p-light', name: 'Light', type: 'select', options: [{ id: 'l-low', label: 'Low' }] },
]
const plants = (n: number): CollectionRow[] =>
  Array.from({ length: n }, (_, i) => row(`pl${i}`, `plant ${i}`, { 'p-care': `care ${i}` }))

function renderView(config: ViewBlock, schema: PropertySchema, rows: CollectionRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CollectionView config={config} schema={schema} rows={rows} />
    </QueryClientProvider>
  )
}

function renderCanvas(blocks: Block[], onChange: (next: Block[]) => void = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas
          blocks={blocks}
          pageId="page-1"
          onChange={onChange}
        />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const cardOf = (id: string) =>
  document.getElementById(`block-${id}`)!.querySelector<HTMLElement>('[data-block-kind]')!

const classesOf = (el: Element) => el.className.split(' ')

beforeEach(() => {
  collection.schema = taskSchema
  collection.rows = []
  collection.addRow.mockClear()
})

// ── The frame: each mapping confirmed against PondBlock.dc.html's `W` ────────────

describe('blockFrame — the four mappings (#260)', () => {
  it('gallery → the gallery card at 580 (confirmed, not changed)', () => {
    expect(blockFrame(gallery)).toEqual({ kind: 'gallery', heading: 'gallery', headNote: '' })
    expect(POND_BLOCK_WIDTHS.gallery).toBe(580)
  })

  it('big-number → the number card at 400 (confirmed, not changed)', () => {
    expect(blockFrame(bigNumber)).toEqual({ kind: 'number', heading: 'big number', headNote: '' })
    expect(POND_BLOCK_WIDTHS.number).toBe(400)
  })

  it('gantt → the table card at 500: PondBlock.dc.html has no gantt kind and the template gives it no width (confirmed)', () => {
    expect(blockFrame(gantt)).toEqual({ kind: 'table', heading: 'timeline', headNote: '' })
    expect(POND_BLOCK_WIDTHS.table).toBe(500)
    // The template's label is the eyebrow — `project › tasks — timeline`.
    expect(blockFrame({ ...gantt, label: 'tasks — timeline' })).toMatchObject({
      kind: 'table',
      heading: 'tasks — timeline',
    })
  })

  it('the inspector → the properties card at 400, eyebrow `record` · note the collection name, empty when the schema is (KAN-350)', () => {
    expect(propertiesFrame(taskSchema, 'Tasks')).toEqual({
      kind: 'properties',
      heading: 'record',
      headNote: 'Tasks',
      state: 'rest',
    })
    expect(propertiesFrame([taskSchema[0]], 'Tasks')).toMatchObject({ headNote: 'Tasks', state: 'rest' })
    expect(propertiesFrame([], 'Tasks')).toMatchObject({ headNote: 'Tasks', state: 'empty' })
    expect(POND_BLOCK_WIDTHS.properties).toBe(400)
  })
})

describe('blockEmptyBox — gantt is empty as the shared voidBox (#260), the others as the emptyBox', () => {
  it('void for a gantt view; box for gallery and big-number', () => {
    expect(blockEmptyBox(gantt)).toBe('void')
    expect(blockEmptyBox(gallery)).toBe('box')
    expect(blockEmptyBox(bigNumber)).toBe('box')
    expect(blockEmptyBox({ id: 'v', type: 'view', mode: 'table' })).toBe('box')
  })
})

// ── gantt — the pure half ───────────────────────────────────────────────────────

describe('ganttRowDone — the board’s `done` bar is a row whose status reads done', () => {
  it('true for the `Done` option of a status/select property, whatever its case', () => {
    expect(ganttRowDone(taskSchema, taskRows[0])).toBe(true)
    expect(ganttRowDone(taskSchema, taskRows[1])).toBe(false)
    expect(ganttRowDone(taskSchema, taskRows[2])).toBe(false)
    const lower: PropertySchema = [
      { id: 's', name: 'State', type: 'select', options: [{ id: 'x', label: 'done' }] },
    ]
    expect(ganttRowDone(lower, row('r', 'r', { s: 'x' }))).toBe(true)
  })

  it('false with no status/select property, or a value that resolves to nothing', () => {
    expect(ganttRowDone(taskSchema.slice(1), taskRows[0])).toBe(false)
    expect(ganttRowDone(taskSchema, row('r', 'r', { 'p-status': 'o-missing' }))).toBe(false)
    expect(ganttRowDone(taskSchema, row('r', 'r', {}))).toBe(false)
  })
})

// ── gantt — the drawing ─────────────────────────────────────────────────────────

describe('CollectionGantt — PondTemplate.dc.html’s gHead / gRow / gTrack / bar', () => {
  it('the head’s hairline is ink .09 and each row’s is ink .055 — two values, neither --mn-hair', () => {
    const { container } = renderView(gantt, taskSchema, taskRows)
    const head = container.querySelector<HTMLElement>('[data-part="gantt-head"]')!
    expect(classesOf(head)).toEqual(
      expect.arrayContaining([
        'grid',
        'grid-cols-[120px_minmax(0,1fr)]',
        'gap-[10px]',
        'pb-[6px]',
        'border-b',
        'border-mn-text/[0.09]',
      ])
    )
    const rows = container.querySelectorAll<HTMLElement>('[data-part="gantt-row"]')
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      const cls = classesOf(r)
      expect(cls).toEqual(
        expect.arrayContaining([
          'grid',
          'grid-cols-[120px_minmax(0,1fr)]',
          'gap-[10px]',
          'items-center',
          'py-[4px]',
          'border-b',
          'border-mn-text/[0.055]',
        ])
      )
      expect(cls).not.toContain('border-mn-text/[0.09]')
      expect(cls).not.toContain('border-mn-hair')
    }
    expect(classesOf(head)).not.toContain('border-mn-text/[0.055]')
    expect(classesOf(head)).not.toContain('border-mn-hair')
  })

  it('four mono-10 ticks at the range’s quarters, in the board’s `20 oct` form', () => {
    const { container } = renderView(gantt, taskSchema, taskRows)
    const ticks = container.querySelector<HTMLElement>('[data-part="gantt-ticks"]')!
    expect(classesOf(ticks)).toEqual(
      expect.arrayContaining(['grid', 'grid-cols-[repeat(4,minmax(0,1fr))]'])
    )
    const labels = Array.from(ticks.querySelectorAll<HTMLElement>('[data-part="gantt-tick"]'))
    expect(labels).toHaveLength(GANTT_TICK_COUNT)
    expect(labels).toHaveLength(4)
    // 20 oct → 16 nov is 28 days: the quarters fall on the board's own fixture ticks.
    expect(labels.map((l) => l.textContent)).toEqual(['20 oct', '27 oct', '3 nov', '10 nov'])
    for (const l of labels) {
      expect(classesOf(l)).toEqual(
        expect.arrayContaining(['font-mono', 'text-[10px]', 'text-mn-text-secondary'])
      )
    }
  })

  it('the track is 18 high with a 25% repeating gridline; bars sit at top/bottom 4, radius 4, %-positioned', () => {
    const { container } = renderView(gantt, taskSchema, taskRows)
    const tracks = container.querySelectorAll<HTMLElement>('[data-part="gantt-track"]')
    expect(tracks).toHaveLength(3)
    for (const t of tracks) {
      expect(classesOf(t)).toEqual(expect.arrayContaining(['relative', 'h-[18px]']))
      expect(t.style.backgroundSize).toBe('25% 100%')
      expect(t.style.backgroundImage).toContain('linear-gradient(90deg')
      // No per-tick gridline spans: the board draws the lines as a background.
      expect(t.querySelectorAll('[aria-hidden]')).toHaveLength(0)
    }
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-part="gantt-bar"]'))
    expect(bars).toHaveLength(3)
    for (const b of bars) {
      expect(classesOf(b)).toEqual(
        expect.arrayContaining(['absolute', 'top-[4px]', 'bottom-[4px]', 'rounded-[4px]'])
      )
      expect(b.style.left).toMatch(/%$/)
      expect(b.style.width).toMatch(/%$/)
    }
    // Sorted by start: the first bar starts at the range start.
    expect(bars[0].style.left).toBe('0%')
  })

  it('a done bar is ink .22, a live bar full ink; a done label is ink .68, a live one full ink', () => {
    const { container } = renderView(gantt, taskSchema, taskRows)
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-part="gantt-bar"]'))
    const labels = Array.from(container.querySelectorAll<HTMLElement>('[data-part="gantt-label"]'))
    expect(labels.map((l) => l.textContent)).toEqual([
      'book the van',
      'sort the loft',
      'meter readings',
    ])
    expect('done' in bars[0].dataset).toBe(true)
    expect(classesOf(bars[0])).toContain(GANTT_BAR_INK.done)
    expect(classesOf(bars[0])).toContain('bg-mn-text/[0.22]')
    expect(classesOf(labels[0])).toContain('text-mn-text-secondary')
    for (const i of [1, 2]) {
      expect('done' in bars[i].dataset).toBe(false)
      expect(classesOf(bars[i])).toContain(GANTT_BAR_INK.live)
      expect(classesOf(bars[i])).toContain('bg-mn-text')
      expect(classesOf(bars[i])).not.toContain('bg-mn-text/[0.22]')
      expect(classesOf(labels[i])).toContain('text-mn-text')
      expect(classesOf(labels[i])).not.toContain('text-mn-text-secondary')
    }
    for (const l of labels) {
      expect(classesOf(l)).toEqual(expect.arrayContaining(['text-[12px]', 'truncate']))
    }
  })

  it('rows with no dates draw the shared voidBox through PondBlockEmpty, with the gantt’s own line', () => {
    const { container } = renderView(gantt, taskSchema, [
      row('u1', 'undated', { 'p-status': 'o-todo' }),
    ])
    expect(container.querySelector('[data-part="gantt-row"]')).toBeNull()
    const box = container.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box).not.toBeNull()
    expect(box.dataset.emptyBox).toBe('void')
    expect(classesOf(box)).toEqual(expect.arrayContaining(['h-[72px]', 'rounded-[12px]']))
    expect(box.textContent).toBe(GANTT_EMPTY_LINE)
    expect(GANTT_EMPTY_LINE).toBe('tasks with a start and a due date draw here')
    expect(box.querySelector('button')).toBeNull()
  })

  it('a collection with no date property, read-only (no onAddDateField), keeps the bare voidBox (KAN-292)', () => {
    const { container } = renderView(gantt, taskSchema.slice(0, 1), taskRows)
    const box = container.querySelector<HTMLElement>('[data-part="empty"]')!
    // No `onAddDateField` wired at this level → the tinted box+button never draws;
    // the bare voidBox stands in, same as the "nothing dated" case below.
    expect(box.dataset.emptyBox).toBe('void')
    expect(box.textContent).toBe(GANTT_EMPTY_LINE)
    expect(box.querySelector('button')).toBeNull()
  })
})

describe('BlockCanvas — a gantt’s empty state is the board’s voidBox, not the table kind’s box', () => {
  it('over an empty collection: the frame steps aside (rest, KAN-352) so the view draws its own void box, gantt line, and "add a task"', () => {
    renderCanvas([gantt])
    const c = cardOf('v-gantt')
    expect(c.dataset.blockKind).toBe('table')
    expect(c.dataset.blockState).toBe('rest')
    const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box.dataset.emptyBox).toBe('void')
    expect(box.textContent).toBe(GANTT_EMPTY_LINE)
    expect(c.textContent).not.toContain('no rows yet')
    // The layout chip is the first button in the view (timeline). The empty action is named.
    expect(within(c).getByRole('button', { name: 'add a task' })).toBeInTheDocument()
  })

  it('whose filter hides every row: the filter line, in the void box', () => {
    collection.rows = taskRows
    renderCanvas([{ ...gantt, filter: { property: 'p-status', op: 'eq', value: 'o-nope' } }])
    const c = cardOf('v-gantt')
    expect(c.dataset.blockState).toBe('empty')
    const box = c.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box.dataset.emptyBox).toBe('void')
    expect(box.textContent).toBe(POND_BLOCK_FILTERED_EMPTY_LINE)
  })

  it('with dated rows: the rows, in the table card', () => {
    collection.rows = taskRows
    renderCanvas([gantt])
    const c = cardOf('v-gantt')
    expect(c.dataset.blockState).toBe('rest')
    expect(c.querySelectorAll('[data-part="gantt-row"]')).toHaveLength(3)
  })
})

// ── KAN-321 path test — the bar's active saved view drives the frame, not the block's top-level mode ──

describe('BlockCanvas — switching the bar to timeline moves the frame to timeline’s, not the board’s (KAN-321)', () => {
  it('stays bare across every saved view (the card is chosen off the block, not the active view), with the gantt’s own missing-date remedy rendered inline', async () => {
    const user = userEvent.setup()
    const noDateSchema = taskSchema.filter((def) => def.type !== 'date')
    collection.schema = noDateSchema
    collection.rows = []
    const mixed: ViewBlock = {
      id: 'v-mixed',
      type: 'view',
      mode: 'board',
      views: [
        { id: 'view-board', label: 'board', kind: 'board' },
        { id: 'view-gantt', label: 'timeline', kind: 'gantt' },
      ],
      activeViewId: 'view-board',
    }
    renderCanvas([mixed])

    // board draws bare (its frame is null — lanes on the page, no card), so
    // neither a card nor the gantt's own remedy exists yet.
    expect(document.getElementById('block-v-mixed')!.querySelector('[data-block-kind]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'add a date field' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'timeline' }))

    // The block's own frame (`board`, persisted) stays bare — no card appears
    // for timeline either — and the gantt itself draws its remedy inline,
    // under the SAME head row and bar the board drew it under.
    expect(document.getElementById('block-v-mixed')!.querySelector('[data-block-kind]')).toBeNull()
    expect(screen.getByRole('button', { name: 'add a date field' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'board' }))

    expect(document.getElementById('block-v-mixed')!.querySelector('[data-block-kind]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'add a date field' })).toBeNull()
  })

  it('keeps the SAME tablist node mounted across board → timeline → board, with ＋ view present in every state', async () => {
    const user = userEvent.setup()
    collection.schema = taskSchema
    collection.rows = taskRows
    const mixed: ViewBlock = {
      id: 'v-stable',
      type: 'view',
      mode: 'board',
      views: [
        { id: 'view-board', label: 'board', kind: 'board' },
        { id: 'view-gantt', label: 'timeline', kind: 'gantt' },
      ],
      activeViewId: 'view-board',
    }
    renderCanvas([mixed])

    const tablist = screen.getByRole('tablist')
    expect(screen.getByText('＋ view')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'timeline' }))
    expect(screen.getByRole('tablist')).toBe(tablist)
    expect(screen.getByText('＋ view')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'board' }))
    expect(screen.getByRole('tablist')).toBe(tablist)
    expect(screen.getByText('＋ view')).toBeInTheDocument()
  })

  it('ArrowRight/ArrowLeft move focus between segments and the frame with it, without a remount dropping focus to <body>', async () => {
    const user = userEvent.setup()
    const noDateSchema = taskSchema.filter((def) => def.type !== 'date')
    collection.schema = noDateSchema
    collection.rows = []
    const mixed: ViewBlock = {
      id: 'v-kbd',
      type: 'view',
      mode: 'board',
      views: [
        { id: 'view-board', label: 'board', kind: 'board' },
        { id: 'view-gantt', label: 'timeline', kind: 'gantt' },
      ],
      activeViewId: 'view-board',
    }
    renderCanvas([mixed])

    const boardTab = screen.getByRole('tab', { name: 'board' })
    act(() => boardTab.focus())
    expect(document.activeElement).toBe(boardTab)

    await user.keyboard('{ArrowRight}')

    const timelineTab = screen.getByRole('tab', { name: 'timeline' })
    expect(document.activeElement).toBe(timelineTab)
    expect(screen.getByRole('button', { name: 'add a date field' })).toBeInTheDocument()

    await user.keyboard('{ArrowLeft}')

    expect(document.activeElement).toBe(boardTab)
    expect(screen.queryByRole('button', { name: 'add a date field' })).toBeNull()
  })

  it('(filter) a saved view whose filter matches nothing shows the filtered-empty line; an unfiltered saved view over the SAME rows shows them', async () => {
    const user = userEvent.setup()
    collection.schema = taskSchema
    collection.rows = taskRows
    const filterable: ViewBlock = {
      id: 'v-filter',
      type: 'view',
      mode: 'table',
      views: [
        { id: 'view-all', label: 'all', kind: 'table' },
        {
          id: 'view-blocked',
          label: 'blocked',
          kind: 'table',
          config: { filter: { property: 'p-status', op: 'eq', value: 'o-nope' } },
        },
      ],
      activeViewId: 'view-all',
    }
    renderCanvas([filterable])

    // Clicking into the filtered view: the card steps to `empty` and draws the
    // filtered-empty line in its own empty box.
    await user.click(screen.getByRole('tab', { name: 'blocked' }))

    const filtered = cardOf('v-filter')
    expect(filtered.dataset.blockState).toBe('empty')
    const box = filtered.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box.textContent).toBe(POND_BLOCK_FILTERED_EMPTY_LINE)

    // The bar stays reachable while the card is empty (KAN-321 fix): clicking
    // back to the unfiltered view returns the rows, in the block's `rest` state.
    await user.click(screen.getByRole('tab', { name: 'all' }))

    expect(cardOf('v-filter').dataset.blockState).toBe('rest')
    expect(cardOf('v-filter').querySelectorAll('tbody tr')).toHaveLength(3)
  })

  it('draws the gantt’s own voidBox inline — still no outer card — when timeline is the active saved view on a board-mode block', async () => {
    const user = userEvent.setup()
    collection.schema = taskSchema
    collection.rows = []
    const mixedDated: ViewBlock = {
      id: 'v-mixed-dated',
      type: 'view',
      mode: 'board',
      views: [
        { id: 'view-board', label: 'board', kind: 'board' },
        { id: 'view-gantt', label: 'timeline', kind: 'gantt' },
      ],
      activeViewId: 'view-board',
    }
    renderCanvas([mixedDated])

    await user.click(screen.getByRole('tab', { name: 'timeline' }))

    // The block's frame stays bare (persisted mode is `board`) — the gantt body
    // draws its own voidBox directly, with no outer PondBlock card around it.
    expect(
      document.getElementById('block-v-mixed-dated')!.querySelector('[data-block-kind]')
    ).toBeNull()
    const box = screen.getByText(GANTT_EMPTY_LINE).closest<HTMLElement>('[data-part="empty"]')!
    expect(box.dataset.emptyBox).toBe('void')
  })

  it('a config edit made after switching the bar keeps the block’s own persisted activeViewId (#421)', async () => {
    const user = userEvent.setup()
    collection.schema = taskSchema
    collection.rows = taskRows
    const onChange = jest.fn()
    const configEdit: ViewBlock = {
      id: 'v-config',
      type: 'view',
      mode: 'board',
      views: [
        { id: 'view-board', label: 'board', kind: 'board' },
        { id: 'view-number', label: 'number', kind: 'big-number' },
      ],
      activeViewId: 'view-board',
    }
    renderCanvas([configEdit], onChange)

    await user.click(screen.getByRole('tab', { name: 'number' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Figure' }), 'p-status')

    expect(onChange).toHaveBeenCalled()
    const committed = onChange.mock.calls[onChange.mock.calls.length - 1][0][0] as ViewBlock
    expect(committed.activeViewId).toBe('view-board')
    expect(committed.views?.find((v) => v.id === 'view-number')?.config?.bigNumber?.property).toBe(
      'p-status'
    )
  })
})

// ── gallery ─────────────────────────────────────────────────────────────────────

describe('galleryCardMeta — the card’s one mono line, until a card layout (#253) names it', () => {
  it('the first field, in schema order, with a value to show', () => {
    expect(galleryCardMeta(plantSchema, row('r', 'r', { 'p-care': 'water weekly' }))).toBe(
      'water weekly'
    )
    expect(galleryCardMeta(plantSchema, row('r', 'r', { 'p-light': 'l-low' }))).toBe('Low')
    expect(
      galleryCardMeta(plantSchema, row('r', 'r', { 'p-care': 'weekly', 'p-light': 'l-low' }))
    ).toBe('weekly')
  })

  it('empty when no field has a value', () => {
    expect(galleryCardMeta(plantSchema, row('r', 'r', {}))).toBe('')
    expect(galleryCardMeta([], row('r', 'r', { x: 1 }))).toBe('')
  })
})

describe('galleryCardTag — the card’s one tag chip: the row’s first status/select option', () => {
  it('the first status/select field’s option label', () => {
    expect(galleryCardTag(plantSchema, row('r', 'r', { 'p-light': 'l-low' }))).toBe('Low')
  })

  it('empty when the row has no status/select field, or no value set on it', () => {
    expect(galleryCardTag([{ id: 'p-care', name: 'Care', type: 'text' }], row('r', 'r', {}))).toBe(
      ''
    )
    expect(galleryCardTag(plantSchema, row('r', 'r', {}))).toBe('')
  })
})

describe('CollectionGallery — PondBlock.dc.html’s gallery frame, each card a PondMolecule record-card', () => {
  it('the row lays cards out flex/wrap at gap 12; every record is a card — no three-card cap', () => {
    const { container } = renderView(gallery, plantSchema, plants(7))
    const grid = container.querySelector<HTMLElement>('[data-part="gallery"]')!
    expect(classesOf(grid)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-[12px]']))
    expect(grid.querySelectorAll('[data-kind="record-card"]')).toHaveLength(7)
  })

  it('a card: rest state, the right title / meta / tag text', () => {
    const { container } = renderView(gallery, plantSchema, [
      row('m', 'monstera', { 'p-care': 'water weekly', 'p-light': 'l-low' }),
    ])
    const card = container.querySelector<HTMLElement>('[data-kind="record-card"]')!
    expect(card.dataset.state).toBe('rest')
    expect(card.querySelector('[data-part="title"]')!.textContent).toBe('monstera')
    expect(card.querySelector('[data-part="meta"]')!.textContent).toBe('water weekly')
    expect(card.querySelector('[data-kind="tag"]')!.textContent).toBe('Low')
  })

  it('a row with no status/select field (or no value on it) draws no tag chip', () => {
    const { container } = renderView(gallery, plantSchema, [
      row('m', 'monstera', { 'p-care': 'water weekly' }),
    ])
    const card = container.querySelector<HTMLElement>('[data-kind="record-card"]')!
    expect(card.querySelector('[data-kind="tag"]')).toBeNull()
  })

  it('an untitled record reads `untitled`, a record with nothing to show `—` — the molecule’s fallbacks', () => {
    const { container } = renderView(gallery, plantSchema, [row('e', '', {})])
    const card = container.querySelector<HTMLElement>('[data-kind="record-card"]')!
    expect(card.querySelector('[data-part="title"]')!.textContent).toBe('untitled')
    expect(card.querySelector('[data-part="meta"]')!.textContent).toBe('—')
  })

  it('the old gallery-card / gallery-image parts are gone', () => {
    const { container } = renderView(gallery, plantSchema, plants(1))
    expect(container.querySelector('[data-part="gallery-card"]')).toBeNull()
    expect(container.querySelector('[data-part="gallery-image"]')).toBeNull()
    expect(container.querySelector('[data-part="gallery-title"]')).toBeNull()
    expect(container.querySelector('[data-part="gallery-meta"]')).toBeNull()
  })
})

describe('CollectionGallery — hover, selection and the peek (KAN-358)', () => {
  function renderEditableGallery(
    rows: CollectionRow[] = plants(2),
    onOpenRow = jest.fn(),
    onAddRow?: () => Promise<string | null>
  ) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const result = render(
      <QueryClientProvider client={client}>
        <CollectionView
          config={gallery}
          schema={plantSchema}
          rows={rows}
          editable
          onEdit={jest.fn()}
          onAddRow={onAddRow}
          onRenameRow={jest.fn()}
          onOpenRow={onOpenRow}
        />
      </QueryClientProvider>
    )
    return { ...result, onOpenRow }
  }

  it('hovering a card’s wrapper sets data-state="hover", leaving the other card rest', () => {
    const { container } = renderEditableGallery()
    const [a, b] = container.querySelectorAll<HTMLElement>('[data-kind="record-card"]')
    expect(a.dataset.state).toBe('rest')

    fireEvent.mouseEnter(b)
    expect(b.dataset.state).toBe('hover')
    expect(a.dataset.state).toBe('rest')

    fireEvent.mouseLeave(b)
    expect(b.dataset.state).toBe('rest')
  })

  it('clicking a card selects it and renders the record peek for that row', async () => {
    const { container } = renderEditableGallery()
    const [a] = container.querySelectorAll<HTMLElement>('[data-kind="record-card"]')
    expect(document.querySelector('[data-part="record-peek"]')).toBeNull()

    await userEvent.click(a)
    expect(a.dataset.state).toBe('selected')
    expect(screen.getByLabelText('Record: plant 0')).toBeInTheDocument()
  })

  it('the card’s tab stop is a real box (not display: contents), so a click on the card reaches focus on it (KAN-358)', async () => {
    const { container } = renderEditableGallery()
    const wrapper = container.querySelector<HTMLElement>('[data-row-focus="pl0"]')!
    const card = wrapper.querySelector<HTMLElement>('[data-kind="record-card"]')!
    expect(wrapper.className).not.toMatch(/\bcontents\b/)
    expect(getComputedStyle(wrapper).display).not.toBe('contents')

    await userEvent.click(card)
    expect(document.activeElement).toBe(wrapper)
  })

  it('↵ on an unselected card selects it; ↵ again opens its page', async () => {
    const { container, onOpenRow } = renderEditableGallery()
    const wrapper = container.querySelector<HTMLElement>('[data-row-focus="pl0"]')!

    wrapper.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByLabelText('Record: plant 0')).toBeInTheDocument()
    expect(onOpenRow).not.toHaveBeenCalled()

    await userEvent.keyboard('{Enter}')
    expect(onOpenRow).toHaveBeenCalledWith('pl0')
  })

  it('clicking ＋ add a record calls onAddRow once and selects the returned id', async () => {
    const mint = jest.fn().mockResolvedValue('pl-new')
    function Harness() {
      const [rows, setRows] = React.useState(plants(2))
      const onAddRow = async () => {
        const id = await mint()
        setRows((prev) => [...prev, row(id, '', {})])
        return id as string
      }
      return (
        <CollectionView
          config={gallery}
          schema={plantSchema}
          rows={rows}
          editable
          onEdit={jest.fn()}
          onAddRow={onAddRow}
          onRenameRow={jest.fn()}
          onOpenRow={jest.fn()}
        />
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
    const tile = screen.getByRole('button', { name: '＋ add a record' })

    await userEvent.click(tile)

    expect(mint).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Record: Untitled')).toBeInTheDocument()
  })

  it('two rapid clicks before the mint resolves call onAddRow only once', async () => {
    let resolveAdd: (id: string) => void = () => {}
    const onAddRow = jest.fn(() => new Promise<string | null>((resolve) => (resolveAdd = resolve)))
    renderEditableGallery(plants(2), jest.fn(), onAddRow)
    const tile = screen.getByRole('button', { name: '＋ add a record' })

    fireEvent.click(tile)
    fireEvent.click(tile)
    expect(onAddRow).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveAdd('pl-new')
    })
    expect(onAddRow).toHaveBeenCalledTimes(1)
  })
})

describe('CollectionView — the gallery and calendar path, end to end (KAN-358)', () => {
  it('gallery: hover a card, click opens the peek, ↵ opens the page, then ＋ add a record mints and selects a new card', async () => {
    const user = userEvent.setup()
    const onOpenRow = jest.fn()
    const mint = jest.fn().mockResolvedValue('pl-new')
    function Harness() {
      const [rows, setRows] = React.useState(plants(2))
      const onAddRow = async () => {
        const id = await mint()
        setRows((prev) => [...prev, row(id, '', {})])
        return id as string
      }
      return (
        <CollectionView
          config={gallery}
          schema={plantSchema}
          rows={rows}
          editable
          onEdit={jest.fn()}
          onAddRow={onAddRow}
          onRenameRow={jest.fn()}
          onOpenRow={onOpenRow}
        />
      )
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
    const [a] = container.querySelectorAll<HTMLElement>('[data-kind="record-card"]')

    fireEvent.mouseEnter(a)
    expect(a.dataset.state).toBe('hover')

    await user.click(a)
    expect(a.dataset.state).toBe('selected')
    expect(screen.getByLabelText('Record: plant 0')).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(onOpenRow).toHaveBeenCalledWith('pl0')

    const tile = screen.getByRole('button', { name: '＋ add a record' })
    await user.click(tile)
    expect(mint).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Record: Untitled')).toBeInTheDocument()
  })

  it('calendar: clicking a dated event draws the selected ring and opens the peek; ↵ opens the page', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const onOpenRow = jest.fn()
    const calendar: ViewBlock = { id: 'v-calendar', type: 'view', mode: 'calendar' }
    const calendarSchema: PropertySchema = [{ id: 'p-due', name: 'Due', type: 'date' }]
    const calendarRows: CollectionRow[] = [row('r1', 'Trim the rim', { 'p-due': '2026-09-10' })]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={client}>
        <CollectionView
          config={calendar}
          schema={calendarSchema}
          rows={calendarRows}
          editable
          onEdit={jest.fn()}
          onAddRow={jest.fn()}
          onRenameRow={jest.fn()}
          onOpenRow={onOpenRow}
        />
      </QueryClientProvider>
    )
    const desktopWrap = [...container.querySelectorAll('div')].find((d) =>
      d.classList.contains('md:flex')
    )!
    const item = within(desktopWrap).getByText('Trim the rim').closest('div')!
    expect(item).not.toHaveClass('ring-[1.5px]')

    await user.click(item)
    expect(item).toHaveClass('ring-[1.5px]', 'ring-inset', 'ring-mn-text')
    expect(screen.getByLabelText('Record: Trim the rim')).toBeInTheDocument()
    expect(onOpenRow).not.toHaveBeenCalled()

    item.focus()
    await user.keyboard('{Enter}')
    expect(onOpenRow).toHaveBeenCalledWith('r1')

    jest.useRealTimers()
  })
})

// ── number ──────────────────────────────────────────────────────────────────────

describe('CollectionBigNumber — 52 / 700 / -.03em / .95 / tabular-nums, a mono-11 sub (ADR 0004 §5)', () => {
  const kmSchema: PropertySchema = [{ id: 'p-km', name: 'Distance', type: 'number' }]
  const runs = [
    row('a', 'a', { 'p-km': 5.2 }),
    row('b', 'b', { 'p-km': 6 }),
    row('c', 'c', { 'p-km': 7.2 }),
  ]

  it('the figure wears the board’s bigStyle at full ink, the sub is mono 11 at ink .68, stacked at gap 6', () => {
    const { container } = renderView(
      { ...bigNumber, bigNumber: { property: 'p-km', agg: 'sum' } },
      kmSchema,
      runs
    )
    const wrap = container.querySelector<HTMLElement>('[data-part="number"]')!
    expect(classesOf(wrap)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'gap-[6px]']))
    const figure = screen.getByRole('status', { name: 'Distance: 18.4' })
    expect(classesOf(figure)).toEqual(
      expect.arrayContaining([
        'text-[52px]',
        'font-bold',
        'leading-[0.95]',
        'tracking-[-0.03em]',
        'tabular-nums',
        'text-mn-text',
      ])
    )
    expect(classesOf(figure)).not.toContain('text-4xl')
    expect(figure.textContent).toBe('18.4')
    const sub = wrap.querySelector<HTMLElement>('[data-part="sub"]')!
    expect(classesOf(sub)).toEqual(
      expect.arrayContaining(['font-mono', 'text-[11px]', 'text-mn-text-secondary'])
    )
    expect(sub.textContent).toBe('Distance · over 3 records')
    // One sub line, not the old kicker + records stack.
    expect(wrap.children).toHaveLength(2)
  })

  it('nothing to read: an em dash at ink .68, never a lying zero', () => {
    const { container } = renderView(
      { ...bigNumber, bigNumber: { property: 'p-km', agg: 'avg' } },
      kmSchema,
      [row('x', 'x', {})]
    )
    const figure = screen.getByRole('status', { name: 'Distance (avg): —' })
    expect(figure.textContent).toBe('—')
    expect(classesOf(figure)).toContain('text-mn-text-secondary')
    expect(classesOf(figure)).not.toContain('text-mn-text')
    expect(container.querySelector('[data-part="sub"]')!.textContent).toBe(
      'Distance (avg) · over 1 record'
    )
  })

  it('a delta rides the sub line between the label and the record count', () => {
    const splitSchema: PropertySchema = [
      ...kmSchema,
      { id: 'p-when', name: 'When', type: 'select', options: [{ id: 'now', label: 'now' }] },
    ]
    const { container } = renderView(
      {
        ...bigNumber,
        bigNumber: { property: 'p-km', agg: 'sum', delta: { property: 'p-when', value: 'now' } },
      },
      splitSchema,
      [row('a', 'a', { 'p-km': 12, 'p-when': 'now' }), row('b', 'b', { 'p-km': 10 })]
    )
    expect(container.querySelector('[data-part="sub"]')!.textContent).toBe(
      'Distance · +20% · over 2 records'
    )
  })
})

// ── props ───────────────────────────────────────────────────────────────────────

describe('PondMolecule field-row — a live control may ride in the value slot (#260)', () => {
  it('renders children in place of the value atom, keeping the row’s geometry', () => {
    const { container } = render(
      <PondMolecule kind="field-row" label="kcal per serving">
        <input aria-label="kcal per serving value" defaultValue="520" />
      </PondMolecule>
    )
    const rowEl = container.querySelector<HTMLElement>('[data-kind="field-row"]')!
    expect(classesOf(rowEl)).toEqual(
      expect.arrayContaining([
        'grid',
        'min-h-[34px]',
        '[grid-template-columns:140px_minmax(0,1fr)]',
        'gap-3',
      ])
    )
    // KAN-350: no fixed-width clamp — the row fills the card's value column.
    expect(classesOf(rowEl)).not.toContain('w-[360px]')
    expect(screen.getByLabelText('kcal per serving value')).toBeInTheDocument()
    expect(rowEl.querySelector('[data-kind="number"]')).toBeNull()
  })

  it('without children the value atom still draws, exactly as before', () => {
    const { container } = render(<PondMolecule kind="field-row" label="time" value="25m" />)
    expect(container.querySelector('[data-kind="field-row"] [data-kind]')).not.toBeNull()
  })
})

describe('PropertyInspector — rows are field-row molecules; the frame owns the empty state', () => {
  const schema: PropertySchema = [
    { id: 'kcal', name: 'kcal per serving', type: 'number' },
    { id: 'cooked', name: 'cooked', type: 'date' },
  ]

  it('one field-row per schema entry, a formatted PondAtom value at rest, the label as the eyebrow', () => {
    const { container } = render(
      <PropertyInspector schema={schema} values={{ kcal: 520 }} onChange={() => {}} />
    )
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-kind="field-row"]'))
    expect(rows).toHaveLength(2)
    // kcal has a value: the number atom at rest, never a native control.
    expect(rows[0].querySelector('[data-kind="number"][data-state="rest"]')!.textContent).toBe(
      '520'
    )
    // cooked has none: the date atom reads `empty`.
    expect(rows[1].querySelector('[data-kind="date"][data-state="empty"]')!.textContent).toBe(
      'empty'
    )
    expect(container.querySelector('input, select')).toBeNull()
    const label = rows[0].querySelector<HTMLElement>('[data-part="label"]')!
    expect(label.textContent).toBe('kcal per serving')
    expect(label.className).toBe(pageEyebrowClass)
    // The rows stack at the board's row gap; no fixed-width clamp (KAN-350).
    expect(classesOf(rows[0])).toContain('max-w-full')
    expect(classesOf(rows[0])).not.toContain('w-[360px]')
    expect(container.querySelector('dl')).toBeNull()
  })

  it('an empty schema renders nothing of its own — PondBlock draws `no fields yet`', () => {
    const { container } = render(<PropertyInspector schema={[]} values={{}} onChange={() => {}} />)
    expect(container.textContent).toBe('')
    expect(screen.queryByText(/no properties/i)).toBeNull()
  })

  it('holds no copy: a checkbox value comes straight from props, and its own edit still goes back out as (key, value)', () => {
    const onChange = jest.fn()
    const checkboxSchema: PropertySchema = [{ id: 'done', name: 'done', type: 'checkbox' }]
    render(<PropertyInspector schema={checkboxSchema} values={{ done: false }} onChange={onChange} />)
    const box = screen.getByLabelText('done value')
    expect(box).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledWith('done', true)
  })
})
