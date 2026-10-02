/**
 * PondBlock 3/4 (#239) — ONE empty state, owned by the frame and keyed off `kind`,
 * in the board's lowercase voice, offering the next step. Measured off
 * `PondBlock.dc.html`'s `renderVals()`:
 *
 *   emptyBox  { display: flex, alignItems: center, justifyContent: space-between,
 *               gap: 12, padding: '14px 14px', borderRadius: 14, background: a(.035) }
 *   emptyText { fontSize: 13.5, color: a(.68) }           — sans inherited
 *   action    PondControl button · secondary · auto,32px
 *   EL        the per-kind [line, action] table, lowercase as authored
 *   showRows  !empty && !load && !err && !special          — rows / gallery / big
 *             number all suppressed; the head keeps its NORMAL headNote
 *
 * The class recipe is asserted here (jsdom has no layout); the computed values are
 * asserted in `PondBlock.stories.tsx`. The wiring half renders BlockCanvas with
 * empty blocks and clicks the offered action: it must do the thing it offers,
 * through the module's existing `onChange(nextBlock)` contract (todo / table) or
 * the collection hook's `addRow` (view) — never a new persistence path.
 */

import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  PondBlock,
  PondBlockEmpty,
  POND_BLOCK_KINDS,
  POND_BLOCK_EMPTY,
  blockEmptyCopy,
} from '@/components/organisms/PondBlock'
import { blockIsEmpty } from '@/lib/modules/block-frame'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { ChartCard } from '@/lib/modules/chart/card'
import { addTodoItem } from '@/lib/modules/todo/view'
import { addTableRow } from '@/lib/modules/table/view'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
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

// The collection seam a view block reads its rows through. The canvas reads
// emptiness off THIS (the rows live with the hook, not the block config), and the
// offered action calls its `addRow` — so the test owns what it returns.
const collection = {
  schema: [{ id: 'p-name', name: 'Name', type: 'text' }] as PropertySchema | null,
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
  collection.schema = [{ id: 'p-name', name: 'Name', type: 'text' }]
  collection.rows = []
  collection.isLoading = false
  collection.addRow.mockClear()
})

// ── The copy table ────────────────────────────────────────────────────────────────

describe('POND_BLOCK_EMPTY — the board’s EL table, lowercase as authored', () => {
  it('matches the board row for row; gallery generalised from its recipes fixture', () => {
    expect(POND_BLOCK_EMPTY).toEqual({
      list: { line: 'nothing due', action: 'add an item' },
      checklist: { line: 'no steps yet', action: 'add a step' },
      table: { line: 'no rows yet', action: 'add a row' },
      // The board reads `no recipes yet` — fixture copy for its example
      // collection. The board's own shape is `records`.
      gallery: { line: 'no records yet', action: 'add a record' },
      number: { line: 'no values this week', action: 'pick a field' },
      log: { line: 'no entries yet', action: 'write one' },
      properties: { line: 'no fields yet', action: 'add a field' },
    })
  })

  it.each(POND_BLOCK_KINDS)('%s copy is lowercase, with no sentence case or “+” prefix', (kind) => {
    const { line, action } = blockEmptyCopy(kind)
    expect(line).toBe(line.toLowerCase())
    expect(action).toBe(action.toLowerCase())
    expect(action.startsWith('+')).toBe(false)
  })
})

// ── Which blocks are empty ────────────────────────────────────────────────────────

describe('blockIsEmpty — pure read off the persisted block', () => {
  it('a checklist with no items, a table with no rows', () => {
    expect(blockIsEmpty({ id: 'c', type: 'todo', items: [] })).toBe(true)
    expect(
      blockIsEmpty({ id: 'c', type: 'todo', items: [{ id: '1', label: 'soak', checked: false }] })
    ).toBe(false)
    expect(blockIsEmpty({ id: 't', type: 'table', columns: ['Tool'], rows: [] })).toBe(true)
    expect(
      blockIsEmpty({ id: 't', type: 'table', columns: ['Tool'], rows: [{ id: 'r', cells: ['x'] }] })
    ).toBe(false)
  })

  it('prose and files are never empty blocks', () => {
    expect(blockIsEmpty({ id: 'x', type: 'text', content: '' })).toBe(false)
    expect(blockIsEmpty({ id: 'i', type: 'image', url: 'https://x/a.png' })).toBe(false)
  })

  it('a view cannot say from config alone — its rows live with the host (null)', () => {
    expect(blockIsEmpty({ id: 'v', type: 'view', mode: 'table' })).toBeNull()
  })
})

// ── The frame’s empty body ────────────────────────────────────────────────────────

const BOX_CLASSES = [
  'flex',
  'items-center',
  'justify-between',
  'gap-mn-3', // gap 12
  'p-[14px]', // padding 14px 14px
  'rounded-mn-inner', // radius 14
  'bg-mn-text/[0.035]', // a(.035) — a ground, not an ink tier
]

describe('PondBlock state="empty" — the box, the line, the offered action', () => {
  it.each(POND_BLOCK_KINDS)('%s draws the board’s line and action, nothing else', (kind) => {
    const onEmptyAction = jest.fn()
    const { container } = render(
      <PondBlock
        kind={kind}
        heading="heading"
        headNote="the note"
        state="empty"
        onEmptyAction={onEmptyAction}
      >
        <p data-testid="body">the live module view</p>
      </PondBlock>
    )
    const card = container.firstElementChild as HTMLElement
    expect(card.dataset.blockState).toBe('empty')
    // The head keeps its NORMAL note — not `loading…`.
    expect(screen.getByText('the note')).toBeInTheDocument()
    // Rows, the gallery grid and the big number are all suppressed.
    expect(screen.queryByTestId('body')).toBeNull()

    const box = card.querySelector<HTMLElement>('[data-part="empty"]')!
    expect(box).not.toBeNull()
    for (const cls of BOX_CLASSES) expect(box.className.split(' ')).toContain(cls)

    const { line, action } = blockEmptyCopy(kind)
    const text = screen.getByText(line)
    const textClasses = text.className.split(' ')
    expect(textClasses).toContain('text-[13.5px]')
    expect(textClasses).toContain('text-mn-text-secondary') // .68, the third tier
    expect(text.className).not.toMatch(/font-mono|uppercase|mn-text-faint/)

    const button = screen.getByRole('button', { name: action })
    expect(button).not.toBeDisabled()
    expect(button.getAttribute('aria-disabled')).toBeNull()
    // The existing secondary pill at the board's 32px (`h-8`).
    expect(button.className.split(' ')).toContain('h-8')
    expect(button.className.split(' ')).toContain('bg-secondary')
    expect(button.className.split(' ')).toContain('rounded-mn-pill')

    fireEvent.click(button)
    expect(onEmptyAction).toHaveBeenCalledTimes(1)
  })

  it('with no callback the line renders ALONE — never a dead or disabled button', () => {
    render(
      <PondBlock kind="number" heading="kcal this week" state="empty">
        <p>body</p>
      </PondBlock>
    )
    expect(screen.getByText('no values this week')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('pick a field')).toBeNull()
  })

  it('the box is also exported bare, for a surface under the frame that has its own degenerate case', () => {
    render(<PondBlockEmpty kind="table" />)
    expect(screen.getByText('no rows yet')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('rest is untouched: the body renders, no empty box', () => {
    const { container } = render(
      <PondBlock kind="checklist" heading="method" headNote="1 of 3">
        <p data-testid="body">body</p>
      </PondBlock>
    )
    expect(screen.getByTestId('body')).toBeInTheDocument()
    expect(container.querySelector('[data-part="empty"]')).toBeNull()
  })
})

// ── The pure insert ops the action calls ─────────────────────────────────────────

describe('addTodoItem / addTableRow — engine-shaped inserts through the whole-block contract', () => {
  it('appends one unchecked, unlabelled step with its own id; the rest by reference', () => {
    const block = {
      id: 'c',
      type: 'todo' as const,
      items: [{ id: 'a', label: 'soak', checked: true }],
    }
    const next = addTodoItem(block)
    expect(next.items).toHaveLength(2)
    expect(next.items[0]).toBe(block.items[0])
    expect(next.items[1]).toMatchObject({ label: '', checked: false })
    expect(typeof next.items[1].id).toBe('string')
    expect(next.items[1].id).not.toBe('a')
    expect(block.items).toHaveLength(1) // pure
  })

  it('appends one row with an empty cell per column', () => {
    const block = { id: 't', type: 'table' as const, columns: ['Tool', 'Qty'], rows: [] }
    const next = addTableRow(block)
    expect(next.rows).toHaveLength(1)
    expect(next.rows[0].cells).toEqual(['', ''])
    expect(typeof next.rows[0].id).toBe('string')
  })
})

// ── BlockCanvas wires the action per kind ────────────────────────────────────────

function renderCanvas(blocks: Block[], onChange = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <BlockCanvas blocks={blocks} pageId="page-1" onChange={onChange} onUndoRemove={jest.fn()} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return onChange
}

const cardOf = (id: string) =>
  document.getElementById(`block-${id}`)!.querySelector<HTMLElement>('[data-block-kind]')!

describe('BlockCanvas — the offered action does the thing it offers', () => {
  it('an empty checklist: `add a step` inserts one item through onChange', () => {
    const onChange = renderCanvas([{ id: 'b-todo', type: 'todo', items: [] }])
    const card = cardOf('b-todo')
    expect(card.dataset.blockState).toBe('empty')
    expect(card.textContent).toContain('no steps yet')
    expect(card.textContent).toContain('0 of 0')
    // The view is suppressed: no checkbox, no label field.
    expect(card.querySelector('input')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'add a step' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Block[]
    expect(next).toHaveLength(1)
    expect(next[0].type === 'todo' && next[0].items).toHaveLength(1)
    expect(next[0].type === 'todo' && next[0].items[0]).toMatchObject({ label: '', checked: false })
  })

  it('an empty table: `add a row` inserts one row through onChange; its own `+ Add row` is not also drawn', () => {
    const onChange = renderCanvas([
      {
        id: 'b-table',
        type: 'table',
        title: 'Power Tools',
        columns: ['Tool', 'Location'],
        rows: [],
      },
    ])
    const card = cardOf('b-table')
    expect(card.dataset.blockState).toBe('empty')
    expect(card.textContent).toContain('no rows yet')
    expect(card.textContent).toContain('0 rows')
    expect(screen.queryByText('+ Add row')).toBeNull()
    expect(screen.queryByText('No entries yet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'add a row' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Block[]
    expect(next[0].type === 'table' && next[0].rows).toHaveLength(1)
    expect(next[0].type === 'table' && next[0].rows[0].cells).toEqual(['', ''])
  })

  it('a non-empty table is left exactly as it was: rest state, its own `+ Add row`, no empty box', () => {
    renderCanvas([
      {
        id: 'b-table',
        type: 'table',
        columns: ['Tool'],
        rows: [{ id: 'r1', cells: ['Saw'] }],
      },
    ])
    const card = cardOf('b-table')
    expect(card.dataset.blockState).toBe('rest')
    expect(screen.getByText('+ Add row')).toBeInTheDocument()
    expect(card.querySelector('[data-part="empty"]')).toBeNull()
  })

  it('a non-empty checklist is left exactly as it was', () => {
    renderCanvas([
      { id: 'b-todo', type: 'todo', items: [{ id: 'i1', label: 'soak', checked: false }] },
    ])
    const card = cardOf('b-todo')
    expect(card.dataset.blockState).toBe('rest')
    expect(card.querySelector('input[type="checkbox"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'add a step' })).toBeNull()
  })

  it('a table-mode view over an empty collection: `add a row` calls the collection’s addRow', () => {
    renderCanvas([{ id: 'b-view', type: 'view', mode: 'table' }])
    const card = cardOf('b-view')
    expect(card.dataset.blockState).toBe('empty')
    expect(card.textContent).toContain('no rows yet')
    expect(screen.queryByText('No rows yet')).toBeNull()
    expect(screen.queryByText('+ Add row')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'add a row' }))
    expect(collection.addRow).toHaveBeenCalledTimes(1)
  })

  it('a gallery view over an empty collection: `add a record`', () => {
    renderCanvas([{ id: 'b-view', type: 'view', mode: 'gallery' }])
    const card = cardOf('b-view')
    expect(card.dataset.blockKind).toBe('gallery')
    expect(card.dataset.blockState).toBe('empty')
    fireEvent.click(screen.getByRole('button', { name: 'add a record' }))
    expect(collection.addRow).toHaveBeenCalledTimes(1)
  })

  it('a big-number view over an empty collection: the line alone — `pick a field` has no engine path yet', () => {
    renderCanvas([{ id: 'b-view', type: 'view', mode: 'big-number' }])
    const card = cardOf('b-view')
    expect(card.dataset.blockKind).toBe('number')
    expect(card.dataset.blockState).toBe('empty')
    expect(card.textContent).toContain('no values this week')
    expect(screen.queryByRole('button', { name: 'pick a field' })).toBeNull()
    expect(card.querySelector('button')).toBeNull()
  })

  it('a view still loading, or over a non-collection, is NOT empty — the view keeps its own notice', () => {
    collection.isLoading = true
    renderCanvas([{ id: 'b-view', type: 'view', mode: 'table' }])
    expect(cardOf('b-view').dataset.blockState).toBe('rest')
    expect(screen.queryByText('no rows yet')).toBeNull()
  })

  it('a view whose target is not a collection is NOT empty', () => {
    collection.schema = null
    renderCanvas([{ id: 'b-view', type: 'view', mode: 'table' }])
    expect(cardOf('b-view').dataset.blockState).toBe('rest')
    expect(screen.getByText('This view needs a collection with properties.')).toBeInTheDocument()
  })

  it('a view with rows is at rest with its view drawn', () => {
    collection.rows = [{ id: 'r1', title: 'Bench', values: {} }]
    renderCanvas([{ id: 'b-view', type: 'view', mode: 'table' }])
    expect(cardOf('b-view').dataset.blockState).toBe('rest')
    expect(screen.getByDisplayValue('Bench')).toBeInTheDocument()
  })
})

// ── The chart card’s degenerate case takes the shared treatment ──────────────────

describe('ChartCard — no `No data yet`; the shared box, line alone', () => {
  it('a degenerate chart draws the shared empty box', () => {
    const { container } = render(
      <ChartCard points={[]} seriesColors={['#000']}>
        <svg data-testid="plot" />
      </ChartCard>
    )
    expect(screen.queryByText('No data yet')).toBeNull()
    expect(screen.getByText('no rows yet')).toBeInTheDocument()
    expect(container.querySelector('[data-part="empty"]')).not.toBeNull()
    expect(screen.queryByTestId('plot')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

// ── Source sweep: none of the three ad-hoc strings survives ──────────────────────

describe('source sweep — the three sentence-case empty strings are gone', () => {
  const root = process.cwd()
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === '__mocks__') continue
        sourceFiles(full, out)
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
    return out
  }

  it.each(['No entries yet', 'No rows yet', 'No data yet'])('“%s” is drawn nowhere', (needle) => {
    const hits = sourceFiles(path.join(root, 'src'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes(needle))
      .map((f) => path.relative(root, f))
    expect(hits).toEqual([])
  })
})
