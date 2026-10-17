import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionList, LIST_EMPTY_LINE } from './list'
import type { CollectionRow } from './apply'
import type { PropertySchema } from '@/lib/properties/schema'

const schemaWithDate: PropertySchema = [
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-title', name: 'Title', type: 'text' },
]

// Mirrors the real `useCollectionRows` closely enough for the empty→foot
// transition: `addRow`/`renameRow` land in the same `rows` state the list reads.
function StatefulList() {
  const [rows, setRows] = useState<CollectionRow[]>([])
  let nextId = rows.length
  const onAddRow = async () => {
    const id = `r${++nextId}`
    setRows((prev) => [...prev, { id, values: {}, title: '' }])
    return id
  }
  const onRenameRow = (rowId: string, title: string) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
  }
  return (
    <CollectionList
      viewKey="v1"
      schema={schemaWithDate}
      rows={rows}
      editable
      onAddRow={onAddRow}
      onRenameRow={onRenameRow}
    />
  )
}

describe('CollectionList — add an item from empty (KAN-352)', () => {
  it('opens the shared input from the empty state and adds a record on Enter', async () => {
    const user = userEvent.setup()
    const onAddRow = jest.fn().mockResolvedValue('r1')
    const onRenameRow = jest.fn()
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[]}
        editable
        onAddRow={onAddRow}
        onRenameRow={onRenameRow}
      />
    )

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    const input = screen.getByRole('textbox', { name: 'Add an item' })
    await user.type(input, 'milk')
    await user.keyboard('{Enter}')

    expect(onAddRow).toHaveBeenCalledTimes(1)
    expect(onRenameRow).toHaveBeenCalledWith('r1', 'milk')
  })

  it('writes nothing on an empty Enter', async () => {
    const user = userEvent.setup()
    const onAddRow = jest.fn().mockResolvedValue('r1')
    const onRenameRow = jest.fn()
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[]}
        editable
        onAddRow={onAddRow}
        onRenameRow={onRenameRow}
      />
    )

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    await user.keyboard('{Enter}')

    expect(onAddRow).not.toHaveBeenCalled()
    expect(onRenameRow).not.toHaveBeenCalled()
  })

  it('shows no add affordance when not editable', () => {
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[]}
        onAddRow={jest.fn()}
        onRenameRow={jest.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'add an item' })).not.toBeInTheDocument()
    expect(screen.getByText(LIST_EMPTY_LINE)).toBeInTheDocument()
  })
})

describe('CollectionList — the foot stays open for more (KAN-352)', () => {
  it('keeps `add an item` at the foot once the list has rows, and a second add stays open', async () => {
    const user = userEvent.setup()
    const onAddRow = jest.fn().mockResolvedValue('r2')
    const onRenameRow = jest.fn()
    render(
      <CollectionList
        viewKey="v1"
        schema={schemaWithDate}
        rows={[{ id: 'r1', values: {}, title: 'milk' }]}
        editable
        onAddRow={onAddRow}
        onRenameRow={onRenameRow}
      />
    )

    const addButton = screen.getByRole('button', { name: 'add an item' })
    await user.click(addButton)
    const input = screen.getByRole('textbox', { name: 'Add an item' })
    await user.type(input, 'eggs')
    await user.keyboard('{Enter}')

    expect(onAddRow).toHaveBeenCalledTimes(1)
    expect(onRenameRow).toHaveBeenCalledWith('r2', 'eggs')
    expect(screen.getByRole('textbox', { name: 'Add an item' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Add an item' })).toHaveFocus()
  })
})

describe('CollectionList — the empty→foot transition stays open (KAN-352)', () => {
  it('adds milk then eggs with no extra click between them', async () => {
    const user = userEvent.setup()
    render(<StatefulList />)

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    await user.type(screen.getByRole('textbox', { name: 'Add an item' }), 'milk')
    await user.keyboard('{Enter}')

    const footInput = await screen.findByRole('textbox', { name: 'Add an item' })
    expect(footInput).toHaveValue('')
    expect(footInput).toHaveFocus()

    await user.type(footInput, 'eggs')
    await user.keyboard('{Enter}')

    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(screen.getByText('eggs')).toBeInTheDocument()
  })
})

describe('CollectionList — the add input never remounts across the empty→foot transition (KAN-352)', () => {
  it('keeps the draft and focus while a slow addRow is still in flight', async () => {
    const user = userEvent.setup()
    let resolveAdd: (id: string) => void = () => {}

    function DeferredList() {
      const [rows, setRows] = useState<CollectionRow[]>([])
      const onAddRow = () =>
        new Promise<string>((resolve) => {
          resolveAdd = (id: string) => {
            setRows((prev) => [...prev, { id, values: {}, title: '' }])
            resolve(id)
          }
        })
      const onRenameRow = (rowId: string, title: string) => {
        setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, title } : row)))
      }
      return (
        <CollectionList
          viewKey="v1"
          schema={schemaWithDate}
          rows={rows}
          editable
          onAddRow={onAddRow}
          onRenameRow={onRenameRow}
        />
      )
    }

    render(<DeferredList />)

    await user.click(screen.getByRole('button', { name: 'add an item' }))
    const input = screen.getByRole('textbox', { name: 'Add an item' })
    await user.type(input, 'milk')
    await user.keyboard('{Enter}')
    // addRow is still awaiting (getUser + createPage, in the real hook) — keep typing.
    await user.type(input, 'eg')

    await act(async () => {
      resolveAdd('r1')
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(input).toHaveValue('eg')
    expect(input).toHaveFocus()
  })
})
