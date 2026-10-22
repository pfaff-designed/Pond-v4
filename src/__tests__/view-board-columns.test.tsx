/**
 * #521 — a board's columns are the options of its group-by field: adding,
 * renaming and removing one is editing that property. Before this ticket the
 * board drew every lane as a bare label with no menu and no "+ column"
 * affordance at all (`CollectionBoard`'s own comment said so: "adding,
 * renaming and reordering lanes is editing that property, which the board
 * does not do"). Wired from the real `ViewView` host, same `schemaRef` +
 * `stageUndo` seam KAN-351's "add a status field" and KAN-380's field
 * rename/delete already use, so every write here mints/edits/removes an
 * OPTION rather than the whole field.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { ViewView } from '@/lib/modules/view/view'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

const statusSchema: PropertySchema = [
  { id: 'p-title', name: 'Title', type: 'text' },
  {
    id: 'p-status',
    name: 'status',
    type: 'status',
    options: [
      { id: 'o-todo', label: 'to do' },
      { id: 'o-done', label: 'done' },
    ],
  },
]

let initialRows: CollectionRow[] = []
let initialSchema: PropertySchema = statusSchema

const updateSchema = jest.fn()
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => {
    const [schema, setSchema] = useState<PropertySchema>(initialSchema)
    const [rows] = useState<CollectionRow[]>(initialRows)
    updateSchema.mockImplementation((next: PropertySchema) => setSchema(next))
    return {
      schema,
      rows,
      collectionName: 'Trips',
      isLoading: false,
      isError: false,
      setValue: jest.fn(),
      addRow: jest.fn(),
      removeRow: jest.fn(),
      renameRow: jest.fn(),
      updateSchema,
    }
  },
}))

const board: ViewBlock = { id: 'v-board', type: 'view', mode: 'board', groupBy: 'p-status' }

function renderView(data: ViewBlock, editable = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
          <ViewView data={data} editable={editable} onChange={jest.fn()} />
        </SiblingBlocksProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const stageOf = (schema: PropertySchema) => schema.find((d) => d.id === 'p-status')

beforeEach(() => {
  updateSchema.mockClear()
  initialRows = []
  initialSchema = statusSchema
})

describe('CollectionBoard — the "+ column" affordance (#521)', () => {
  it('an editable board draws a trailing "+ column" lane', () => {
    renderView(board)
    expect(screen.getByRole('button', { name: '＋ column' })).toBeInTheDocument()
  })

  it('clicking it mints a fresh option, labelled "new column", onto the status field', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: '＋ column' }))

    expect(updateSchema).toHaveBeenCalledWith([
      statusSchema[0],
      {
        ...statusSchema[1],
        options: [...statusSchema[1].options!, expect.objectContaining({ label: 'new column' })],
      },
    ])
    expect(screen.getByText('new column')).toBeInTheDocument()
  })

  it('a second "new column" is free-named "new column 2"', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: '＋ column' }))
    await user.click(screen.getByRole('button', { name: '＋ column' }))

    expect(screen.getByText('new column')).toBeInTheDocument()
    expect(screen.getByText('new column 2')).toBeInTheDocument()
  })

  it('the undo toast removes the minted option again', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: '＋ column' }))
    expect(screen.getByText('new column')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(statusSchema)
    expect(screen.queryByText('new column')).not.toBeInTheDocument()
  })

  it('read-only (editable=false) draws no "+ column" lane', () => {
    renderView(board, false)
    expect(screen.queryByRole('button', { name: '＋ column' })).not.toBeInTheDocument()
  })

  it('rapid repeat clicks each mint their own column, free-named past the last one — no de-dupe, same as every other persistent add control', () => {
    renderView(board)

    const button = screen.getByRole('button', { name: '＋ column' })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    expect(updateSchema).toHaveBeenCalledTimes(2)
    expect(screen.getByText('new column')).toBeInTheDocument()
    expect(screen.getByText('new column 2')).toBeInTheDocument()
  })
})

describe('CollectionBoard — renaming a column (#521)', () => {
  it('a real lane\'s label is a button that opens a column-header menu', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    expect(await screen.findByRole('menu', { name: 'to do column menu' })).toBeInTheDocument()
  })

  it('the "No status" lane stays plain text, never a menu trigger', () => {
    // The only lane renders even with zero rows when it's the only group
    // (KAN-377) — a laneless, optionless status field draws just this one.
    initialSchema = [statusSchema[0], { ...statusSchema[1], options: [] }]
    renderView(board)

    expect(screen.queryByRole('button', { name: 'No status' })).not.toBeInTheDocument()
    expect(screen.getByText('No status')).toBeInTheDocument()
  })

  it('committing a new name in the menu renames just that option, in place', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    const menu = await screen.findByRole('menu', { name: 'to do column menu' })
    const input = within(menu).getByLabelText('column name')
    await user.clear(input)
    await user.keyboard('doing{Enter}')

    expect(updateSchema).toHaveBeenCalledWith([
      statusSchema[0],
      {
        ...statusSchema[1],
        options: [
          { id: 'o-todo', label: 'doing' },
          { id: 'o-done', label: 'done' },
        ],
      },
    ])
    expect(screen.getByText('doing')).toBeInTheDocument()
    expect(screen.queryByText('to do')).not.toBeInTheDocument()
  })

  it('a name another column already has is refused with a note, writing nothing', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    const menu = await screen.findByRole('menu', { name: 'to do column menu' })
    const input = within(menu).getByLabelText('column name')
    await user.clear(input)
    await user.keyboard('done{Enter}')

    expect(updateSchema).not.toHaveBeenCalled()
    expect(await within(menu).findByText('a column is already called done')).toBeInTheDocument()
  })

  it('the undo toast restores the old label', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    const menu = await screen.findByRole('menu', { name: 'to do column menu' })
    const input = within(menu).getByLabelText('column name')
    await user.clear(input)
    await user.keyboard('doing{Enter}')
    expect(screen.getByText('doing')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(statusSchema)
    expect(screen.getByText('to do')).toBeInTheDocument()
  })
})

describe('CollectionBoard — deleting a column (#521)', () => {
  it('the menu draws a "delete column" row', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    const menu = await screen.findByRole('menu', { name: 'to do column menu' })
    expect(within(menu).getByRole('menuitem', { name: 'delete column' })).toBeInTheDocument()
  })

  it('clicking it removes just that option, leaving its sibling', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    const menu = await screen.findByRole('menu', { name: 'to do column menu' })
    await user.click(within(menu).getByRole('menuitem', { name: 'delete column' }))

    expect(updateSchema).toHaveBeenCalledWith([
      statusSchema[0],
      { ...statusSchema[1], options: [{ id: 'o-done', label: 'done' }] },
    ])
    expect(screen.queryByText('to do')).not.toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('the undo toast restores the option at its original position', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'to do' }))
    const menu = await screen.findByRole('menu', { name: 'to do column menu' })
    await user.click(within(menu).getByRole('menuitem', { name: 'delete column' }))
    expect(stageOf(initialSchema)).toBeDefined() // sanity: fixture unchanged

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(statusSchema)
    expect(screen.getByText('to do')).toBeInTheDocument()
  })

  it('read-only (editable=false) draws no column-header menu at all', () => {
    renderView(board, false)
    expect(screen.queryByRole('button', { name: 'to do' })).not.toBeInTheDocument()
    expect(screen.getByText('to do')).toBeInTheDocument()
  })
})
