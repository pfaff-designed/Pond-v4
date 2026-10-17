/**
 * KAN-344 — the person’s path, keys only, on the real `BlockCanvas`: a click
 * on a non-text block’s own chrome selects it, Return steps out of it the
 * same as ↓ out of a table’s last cell, and Return on a checklist’s empty
 * last item steps out too. No slash menu, no undo — those are separate items.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

// Seeded per describe block before render, like `view.test.tsx`'s own mock —
// the `view`/chart fixtures elsewhere in this file never read this and keep
// seeing the empty defaults.
let initialSchema: PropertySchema = []
let initialRows: CollectionRow[] = []
const renameRow = jest.fn()
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [rows] = useState<CollectionRow[]>(initialRows)
    return {
      schema: initialSchema,
      rows,
      collectionName: 'Shop',
      isLoading: false,
      isError: false,
      setValue: jest.fn(),
      addRow: jest.fn(),
      removeRow: jest.fn(),
      renameRow,
      updateSchema: jest.fn(),
    }
  },
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue({ id: 'page-1', parentId: null, blocks: [] }),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

const table: Block = {
  id: 'b-table',
  type: 'table',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
}
const chart: Block = { id: 'b-chart', type: 'view', mode: 'chart' }
const viewTable: Block = { id: 'b-view-table', type: 'view', mode: 'table' }
const checklist: Block = {
  id: 'b-checklist',
  type: 'todo',
  items: [
    { id: 'i1', label: 'sand the top', checked: false },
    { id: 'i2', label: '', checked: false },
  ],
}

function Harness({ initial, onChange }: { initial: Block[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="workshop"
      onChange={(next) => {
        onChange(next)
        setBlocks(next)
      }}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(initial: Block[]) {
  const onChange = jest.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={initial} onChange={onChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onChange }
}

const blockRoot = (blockId: string) => document.getElementById(`block-${blockId}`)!
const blockOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
    el.getAttribute('data-block-id')
  )
const lastBlocks = (onChange: jest.Mock) => onChange.mock.calls.at(-1)![0] as Block[]

beforeEach(() => {
  jest.clearAllMocks()
  initialSchema = []
  initialRows = []
})

describe('KAN-344 — the person’s path, keys only', () => {
  it('table → chart: click the table’s chrome (selected), Return opens a line between them', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([table, chart])

    const group = blockRoot('b-table')
    const card = group.querySelector('[data-block-state]')!
    await user.click(group)
    expect(card).toHaveAttribute('data-block-state', 'selected')

    await user.keyboard('{Enter}')
    // The insert is one ordinary own-edit, not two: `onChange` fires exactly
    // once, and that call's own before-state is the original two blocks
    // untouched — never a second, already-mutated call (KAN-139's
    // `sessionUndo` records whatever `before` the own-edit save captured, so
    // a second call here would silently narrow what undo can revert to).
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual([
      table,
      expect.objectContaining({ type: 'text', content: '' }),
      chart,
    ])
    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-chart'])
    await waitFor(() => expect(blockOrder()).toEqual(['b-table', opened[1].id, 'b-chart']))

    const line = await within(blockRoot(opened[1].id)).findByRole('textbox', { name: 'text block' })
    await waitFor(() => expect(line).toHaveFocus())
  })

  it('the table’s last cell steps out on ↓: a line opens between table and chart', async () => {
    const { onChange } = renderCanvas([table, chart])
    fireEvent.keyDown(screen.getByDisplayValue('Wall'), { key: 'ArrowDown' })

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-table', expect.any(String), 'b-chart'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('Return on the checklist’s empty last item removes it and opens a line after the block', async () => {
    const { onChange } = renderCanvas([checklist, chart])
    const items = screen.getAllByRole('textbox', { name: 'Step' })
    fireEvent.keyDown(items[1], { key: 'Enter' })

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-checklist', expect.any(String), 'b-chart'])
    expect(opened[0]).toMatchObject({ items: [{ label: 'sand the top' }] })
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('Return on a checklist’s non-empty last item adds a line and focuses it; Return again steps out', async () => {
    const user = userEvent.setup()
    const oneItemChecklist: Block = {
      id: 'b-checklist-1',
      type: 'todo',
      items: [{ id: 'i1', label: 'sand the top', checked: false }],
    }
    const { onChange } = renderCanvas([oneItemChecklist, chart])

    await user.click(screen.getByRole('textbox', { name: 'Step' }))
    await user.keyboard('{Enter}')

    const items = screen.getAllByRole('textbox', { name: 'Step' })
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveValue('')
    await waitFor(() => expect(items[1]).toHaveFocus())

    await user.keyboard('{Enter}')

    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-checklist-1', expect.any(String), 'b-chart'])
    expect(opened[0]).toMatchObject({ items: [{ label: 'sand the top' }] })
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('a database-backed table view: Return in the last row’s Row title commits it and opens a line after the block', async () => {
    const user = userEvent.setup()
    initialSchema = []
    initialRows = [
      { id: 'row-1', title: 'Saw', values: {} },
      { id: 'row-2', title: 'Wall', values: {} },
    ]
    const { onChange } = renderCanvas([viewTable, chart])

    const titles = screen.getAllByLabelText('Row title')
    await user.click(titles[1])
    await user.keyboard(' sanded')
    await user.keyboard('{Enter}')

    expect(renameRow).toHaveBeenCalledWith('row-2', 'Wall sanded')
    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-view-table', expect.any(String), 'b-chart'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })

  it('a database-backed table view: ↓ in the last row’s title opens a line; ↓ in the first row’s title does nothing', () => {
    initialSchema = []
    initialRows = [
      { id: 'row-1', title: 'Saw', values: {} },
      { id: 'row-2', title: 'Wall', values: {} },
    ]
    const { onChange } = renderCanvas([viewTable, chart])
    const titles = screen.getAllByLabelText('Row title')

    fireEvent.keyDown(titles[0], { key: 'ArrowDown' })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(titles[1], { key: 'ArrowDown' })
    const opened = lastBlocks(onChange)
    expect(opened.map((b) => b.id)).toEqual(['b-view-table', expect.any(String), 'b-chart'])
    expect(opened[1]).toMatchObject({ type: 'text', content: '' })
  })
})
