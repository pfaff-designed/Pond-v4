/**
 * KAN-351 — the board's own "add a status field" remedy, mirroring KAN-292's
 * "add a date field": a board with no status/select property in its schema
 * offers the remedy instead of the bare `BOARD_EMPTY_LINE` notice. Wired from
 * the real `ViewView` host, same `schemaRef` + `stageUndo` seam as the date
 * remedy, so clicking it mints the field and the undo toast removes it again.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { ViewView } from '@/lib/modules/view/view'
import { BOARD_EMPTY_LINE } from '@/lib/modules/view/kinds'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

const titleOnly: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]

// Seeded before each `renderView` — a fresh `useState` reads it on mount.
let initialRows: CollectionRow[] = []
let initialSchema: PropertySchema = titleOnly

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

const board: ViewBlock = { id: 'v-board', type: 'view', mode: 'board' }

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
  initialRows = []
  initialSchema = titleOnly
})

describe('CollectionBoard — the "add a status field" remedy (KAN-351)', () => {
  it('a schema with no status/select property offers the remedy, line and button together', () => {
    renderView(board)

    expect(screen.getByText(BOARD_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'add a status field' })).toBeInTheDocument()
  })

  it('clicking it mints a status field with the three default lanes, and the remedy goes', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'add a status field' }))

    expect(updateSchema).toHaveBeenCalledWith([
      ...titleOnly,
      expect.objectContaining({
        name: 'status',
        type: 'status',
        options: [
          expect.objectContaining({ label: 'to do' }),
          expect.objectContaining({ label: 'doing' }),
          expect.objectContaining({ label: 'done' }),
        ],
      }),
    ])
    expect(screen.queryByRole('button', { name: 'add a status field' })).not.toBeInTheDocument()
    expect(screen.getByText('to do')).toBeInTheDocument()
    expect(screen.getByText('doing')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('read-only (editable=false) draws no remedy button, keeping the bare notice', () => {
    renderView(board, false)

    expect(screen.queryByRole('button', { name: 'add a status field' })).not.toBeInTheDocument()
    expect(screen.getByText(BOARD_EMPTY_LINE)).toBeInTheDocument()
  })

  it('the undo toast removes the field again, restoring the remedy', async () => {
    const user = userEvent.setup()
    renderView(board)

    await user.click(screen.getByRole('button', { name: 'add a status field' }))
    expect(screen.getByText('to do')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(titleOnly)
    expect(screen.getByRole('button', { name: 'add a status field' })).toBeInTheDocument()
  })

  it('two clicks fired back-to-back before re-render give one write, one toast, and Undo removes it', () => {
    renderView(board)

    const button = screen.getByRole('button', { name: 'add a status field' })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    expect(updateSchema).toHaveBeenCalledTimes(1)
    expect(updateSchema).toHaveBeenCalledWith([
      ...titleOnly,
      expect.objectContaining({
        name: 'status',
        type: 'status',
        options: [
          expect.objectContaining({ label: 'to do' }),
          expect.objectContaining({ label: 'doing' }),
          expect.objectContaining({ label: 'done' }),
        ],
      }),
    ])
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(updateSchema).toHaveBeenLastCalledWith(titleOnly)
    expect(screen.getByRole('button', { name: 'add a status field' })).toBeInTheDocument()
  })
})
