/**
 * KAN-380 — the table header's rename and delete commits, wired from the
 * real `ViewView` host: same `schemaRef` + `stageUndo` seam as the
 * date/status remedies (`view-board-add-status-field.test.tsx`), one atomic
 * write per commit, logged through `logSchemaEdit`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { ViewView } from '@/lib/modules/view/view'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

const twoFields: PropertySchema = [
  { id: 'p-1', name: 'field 1', type: 'text' },
  { id: 'p-2', name: 'field 2', type: 'text' },
]

let initialRows: CollectionRow[] = []
let initialSchema: PropertySchema = twoFields

const updateSchema = jest.fn()
const logSchemaEdit = jest.fn()
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
      logSchemaEdit,
    }
  },
}))

const table: ViewBlock = { id: 'v-table', type: 'view', mode: 'table' }

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

beforeEach(() => {
  updateSchema.mockClear()
  logSchemaEdit.mockClear()
  initialRows = []
  initialSchema = twoFields
})

describe('CollectionTable — rename a field from its header (KAN-380)', () => {
  it('committing a new name writes the schema, logs the edit, and stages an undo toast', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('due{Enter}')

    expect(screen.getByRole('button', { name: 'due' })).toBeInTheDocument()
    expect(updateSchema).toHaveBeenCalledWith([
      twoFields[0],
      { ...twoFields[1], name: 'due' },
    ])
    expect(logSchemaEdit).toHaveBeenCalledWith(twoFields, [
      twoFields[0],
      { ...twoFields[1], name: 'due' },
    ])
    expect(screen.getByText('renamed field field 2 to due')).toBeInTheDocument()
  })

  it('undo restores the original name', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.clear(within(menu).getByLabelText('field name'))
    await user.keyboard('due{Enter}')
    expect(screen.getByRole('button', { name: 'due' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(twoFields)
    expect(logSchemaEdit).toHaveBeenLastCalledWith(
      [twoFields[0], { ...twoFields[1], name: 'due' }],
      twoFields
    )
    expect(screen.getByRole('button', { name: 'field 2' })).toBeInTheDocument()
  })

  it('undo no-ops when the old name is now taken by another field in the meantime', async () => {
    const user = userEvent.setup()
    renderView(table)

    // rename field 2 -> due, staging an undo that would restore "field 2".
    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const firstMenu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.clear(within(firstMenu).getByLabelText('field name'))
    await user.keyboard('due{Enter}')

    // rename field 1 -> field 2, so the name the first undo wants is now taken.
    await user.click(screen.getByRole('button', { name: 'field 1' }))
    const secondMenu = await screen.findByRole('menu', { name: 'field 1 field menu' })
    await user.clear(within(secondMenu).getByLabelText('field name'))
    await user.keyboard('field 2{Enter}')

    updateSchema.mockClear()
    logSchemaEdit.mockClear()

    // undo the FIRST toast (due -> field 2) — it must no-op, not collide.
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' })
    await user.click(undoButtons[0])

    expect(updateSchema).not.toHaveBeenCalled()
    expect(logSchemaEdit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'due' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'field 2' })).toBeInTheDocument()
  })

  it('an unchanged name writes nothing, logs nothing, and stages no toast', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.keyboard('{Enter}')

    expect(updateSchema).not.toHaveBeenCalled()
    expect(logSchemaEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('read-only (editable=false) draws the header as plain text, no button or menu', () => {
    renderView(table, false)

    expect(screen.queryByRole('button', { name: 'field 2' })).not.toBeInTheDocument()
    expect(screen.getByText('field 2')).toBeInTheDocument()
  })

  it('opening the menu from the keyboard (Enter) lands focus in the name input, text selected — not on delete field', async () => {
    const user = userEvent.setup()
    renderView(table)

    screen.getByRole('button', { name: 'field 2' }).focus()
    await user.keyboard('{Enter}')

    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    const input = within(menu).getByLabelText('field name') as HTMLInputElement
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('field 2'.length)
  })

  it('opening the menu from the keyboard (Space) lands focus in the name input, text selected', async () => {
    const user = userEvent.setup()
    renderView(table)

    screen.getByRole('button', { name: 'field 2' }).focus()
    await user.keyboard(' ')

    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    const input = within(menu).getByLabelText('field name') as HTMLInputElement
    expect(input).toHaveFocus()
  })
})

describe('CollectionTable — delete a field from its header menu (KAN-380)', () => {
  it('delete field removes the column at once, logs the edit, and stages an undo toast', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.click(within(menu).getByRole('menuitem', { name: 'delete field' }))

    expect(screen.queryByRole('button', { name: 'field 2' })).not.toBeInTheDocument()
    expect(updateSchema).toHaveBeenCalledWith([twoFields[0]])
    expect(logSchemaEdit).toHaveBeenCalledWith(twoFields, [twoFields[0]])
    expect(screen.getByText('deleted field field 2')).toBeInTheDocument()
  })

  it('undo restores the column and its values at its original index', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.click(within(menu).getByRole('menuitem', { name: 'delete field' }))
    expect(screen.queryByRole('button', { name: 'field 2' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(twoFields)
    expect(logSchemaEdit).toHaveBeenLastCalledWith([twoFields[0]], twoFields)
    expect(screen.getByRole('button', { name: 'field 2' })).toBeInTheDocument()
  })

  it('a double commit on the same delete writes once and stages one undo toast (AUDIT G9)', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    const deleteItem = within(menu).getByRole('menuitem', { name: 'delete field' })
    fireEvent.click(deleteItem)
    fireEvent.click(deleteItem)

    expect(updateSchema).toHaveBeenCalledTimes(1)
    expect(logSchemaEdit).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
  })

  it('undo restores under a free name, never dropped, when the name was reclaimed in the meantime', async () => {
    initialRows = [
      { id: 'r-1', title: 'Trip 1', values: { 'p-1': 'x', 'p-2': 'Paris' } },
      { id: 'r-2', title: 'Trip 2', values: { 'p-1': 'y', 'p-2': 'Tokyo' } },
    ]
    const user = userEvent.setup()
    renderView(table)

    // delete field 2, staging an undo that would restore "field 2".
    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const deleteMenu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.click(within(deleteMenu).getByRole('menuitem', { name: 'delete field' }))
    expect(screen.queryByRole('button', { name: 'field 2' })).not.toBeInTheDocument()

    // rename field 1 -> field 2, reclaiming the deleted field's name.
    await user.click(screen.getByRole('button', { name: 'field 1' }))
    const renameMenu = await screen.findByRole('menu', { name: 'field 1 field menu' })
    await user.clear(within(renameMenu).getByLabelText('field name'))
    await user.keyboard('field 2{Enter}')
    expect(screen.getAllByRole('button', { name: 'field 2' })).toHaveLength(1)

    // undo the delete toast (staged first, so it's the first Undo button) — the
    // clash must restore the def under a free name, not no-op and drop its values.
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' })
    await user.click(undoButtons[0])

    expect(screen.getAllByRole('button', { name: 'field 2' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'field 2 2' })).toBeInTheDocument()
    const values = screen.getAllByRole('textbox', { name: 'field 2 2 value' })
    expect(values.map((el) => (el as HTMLInputElement).value)).toEqual(['Paris', 'Tokyo'])
  })

  it('the title (Name) header has no delete affordance — it never routes through the field menu', () => {
    renderView(table)

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Name/ })).not.toBeInTheDocument()
  })
})

describe('CollectionTable — the person\'s path, start to finish (KAN-380, PATH_STEPS 2-5)', () => {
  it('rename then delete then undo: the column and every row\'s value come back', async () => {
    initialRows = [
      { id: 'r-1', title: 'Trip 1', values: { 'p-1': 'x', 'p-2': 'Paris' } },
      { id: 'r-2', title: 'Trip 2', values: { 'p-1': 'y', 'p-2': 'Tokyo' } },
    ]
    const user = userEvent.setup()
    renderView(table)

    // Step 2-3: open the `field 2` header, rename to `due`, header reads `due`.
    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const renameMenu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.clear(within(renameMenu).getByLabelText('field name'))
    await user.keyboard('due{Enter}')
    expect(screen.getByRole('button', { name: 'due' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('textbox', { name: 'due value' }).map((el) => (el as HTMLInputElement).value)
    ).toEqual(['Paris', 'Tokyo'])

    // Step 4: reopen, delete field — column gone at once, undo toast reads
    // `deleted field due`.
    await user.click(screen.getByRole('button', { name: 'due' }))
    const deleteMenu = await screen.findByRole('menu', { name: 'due field menu' })
    await user.click(within(deleteMenu).getByRole('menuitem', { name: 'delete field' }))
    expect(screen.queryByRole('button', { name: 'due' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'due value' })).not.toBeInTheDocument()
    expect(screen.getByText('deleted field due')).toBeInTheDocument()

    // Step 5: undo the delete toast (the rename's own toast is still stacked
    // above it) — the column and every row's value are back.
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' })
    await user.click(undoButtons[undoButtons.length - 1])
    expect(screen.getByRole('button', { name: 'due' })).toBeInTheDocument()
    const values = screen.getAllByRole('textbox', { name: 'due value' })
    expect(values.map((el) => (el as HTMLInputElement).value)).toEqual(['Paris', 'Tokyo'])
  })

  it('try to break it: renaming to an existing field\'s name is refused and writes nothing', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    const input = within(menu).getByLabelText('field name')
    await user.clear(input)
    await user.keyboard('field 1{Enter}')

    expect(updateSchema).not.toHaveBeenCalled()
    expect(logSchemaEdit).not.toHaveBeenCalled()
    expect(within(menu).getByText('a field is already called field 1')).toBeInTheDocument()
    expect(screen.getByRole('menu', { name: 'field 2 field menu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'field 2' })).toBeInTheDocument()
  })

  it('try to break it: an empty name reverts, writing nothing', async () => {
    const user = userEvent.setup()
    renderView(table)

    await user.click(screen.getByRole('button', { name: 'field 2' }))
    const menu = await screen.findByRole('menu', { name: 'field 2 field menu' })
    await user.clear(within(menu).getByLabelText('field name'))
    await user.keyboard('{Enter}')

    expect(updateSchema).not.toHaveBeenCalled()
    expect(logSchemaEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu', { name: 'field 2 field menu' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'field 2' })).toBeInTheDocument()
  })

  it('try to break it: the Name header has no field-menu/delete affordance at all', () => {
    renderView(table)

    expect(screen.queryByRole('button', { name: /^Name$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: /Name field menu/ })).not.toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })
})
