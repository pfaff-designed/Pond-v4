/**
 * KAN-351 — the board's own "add a status field" remedy, mirroring KAN-292's
 * "add a date field": a board with no status/select property in its schema
 * offers the remedy instead of the bare `BOARD_EMPTY_LINE` notice. Wired from
 * the real `ViewView` host, same `schemaRef` + `stageUndo` seam as the date
 * remedy, so clicking it mints the field and the undo toast removes it again.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { CollectionView, ViewView } from '@/lib/modules/view/view'
import { BOARD_EMPTY_LINE } from '@/lib/modules/view/kinds'
import type { ViewBlock } from '@/lib/modules/view/schema'
import type { PropertySchema, PropertyValue } from '@/lib/properties/schema'
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

describe('CollectionBoard — a status field with no options (KAN-377)', () => {
  it('draws one "No <name>" lane, min-h-[380px], with ＋ task — not zero lanes', () => {
    initialSchema = [...titleOnly, { id: 'p-status', name: 'status', type: 'status', options: [] }]

    const { container } = renderView(board)

    const lanes = container.querySelectorAll<HTMLElement>('[data-part="lane"]')
    expect(lanes).toHaveLength(1)
    expect(lanes[0]).toHaveAttribute('data-lane', 'No status')
    expect(lanes[0].className).toContain('min-h-[380px]')
    expect(screen.getByRole('button', { name: '＋ task' })).toBeInTheDocument()
  })

  it('a status field WITH options and zero rows draws its three lanes, each min-h-[380px] ending in ＋ task — no "No status" lane', () => {
    initialSchema = [
      ...titleOnly,
      {
        id: 'p-status',
        name: 'status',
        type: 'status',
        options: [
          { id: 'o-todo', label: 'to do' },
          { id: 'o-doing', label: 'doing' },
          { id: 'o-done', label: 'done' },
        ],
      },
    ]

    const { container } = renderView(board)

    const lanes = container.querySelectorAll<HTMLElement>('[data-part="lane"]')
    expect(Array.from(lanes).map((lane) => lane.dataset.lane)).toEqual(['to do', 'doing', 'done'])
    lanes.forEach((lane) => expect(lane.className).toContain('min-h-[380px]'))
    expect(screen.getAllByRole('button', { name: '＋ task' })).toHaveLength(3)
    expect(screen.queryByText('No status')).not.toBeInTheDocument()
  })
})

describe('CollectionBoard — the full ＋ task path, on the real `CollectionView` host (KAN-377)', () => {
  const statusSchema: PropertySchema = [
    ...titleOnly,
    {
      id: 'p-status',
      name: 'status',
      type: 'status',
      options: [
        { id: 'o-todo', label: 'to do' },
        { id: 'o-doing', label: 'doing' },
        { id: 'o-done', label: 'done' },
      ],
    },
  ]
  const boardConfig: ViewBlock = {
    id: 'v-board2',
    type: 'view',
    mode: 'board',
    groupBy: 'p-status',
  }

  it('click ＋ task in doing writes the status and lands the card there, opening its peek; the row going away returns three empty lanes', async () => {
    const user = userEvent.setup()
    let rows: CollectionRow[] = []
    let rerenderBoard: (el: ReactElement) => void = () => {}
    const draw = () =>
      rerenderBoard(
        <CollectionView
          config={boardConfig}
          schema={statusSchema}
          rows={rows}
          editable
          onAddRow={addRowSpy}
          onRenameRow={jest.fn()}
        />
      )
    const addRowSpy = jest.fn(async (values: Record<string, PropertyValue> = {}) => {
      const id = 'row-1'
      rows = [...rows, { id, title: '', values }]
      draw()
      return id
    })

    const { container, rerender } = render(
      <CollectionView
        config={boardConfig}
        schema={statusSchema}
        rows={rows}
        editable
        onAddRow={addRowSpy}
        onRenameRow={jest.fn()}
      />
    )
    rerenderBoard = rerender

    const doingLane = () => container.querySelector<HTMLElement>('[data-lane="doing"]')!
    await user.click(within(doingLane()).getByRole('button', { name: '＋ task' }))

    expect(addRowSpy).toHaveBeenCalledWith({ 'p-status': 'o-doing' })
    expect(within(doingLane()).getByText('1')).toBeInTheDocument()
    expect(within(doingLane()).getByRole('article')).toBeInTheDocument()

    const peek = document.querySelector<HTMLElement>('[data-part="record-peek"]')
    expect(peek).not.toBeNull()
    expect(peek).toHaveAttribute('data-placement', 'center')
    expect(within(peek!).getByLabelText('status value')).toHaveTextContent('doing')

    rows = []
    draw()

    const lanes = container.querySelectorAll<HTMLElement>('[data-part="lane"]')
    expect(Array.from(lanes).map((lane) => lane.dataset.lane)).toEqual(['to do', 'doing', 'done'])
    expect(document.querySelector('[data-part="record-peek"]')).toBeNull()
  })
})

describe('CollectionBoard — ＋ task double-click guard (KAN-377, AUDIT G9)', () => {
  const statusSchema: PropertySchema = [
    ...titleOnly,
    {
      id: 'p-status',
      name: 'status',
      type: 'status',
      options: [
        { id: 'o-todo', label: 'to do' },
        { id: 'o-doing', label: 'doing' },
        { id: 'o-done', label: 'done' },
      ],
    },
  ]
  const boardConfig: ViewBlock = {
    id: 'v-board3',
    type: 'view',
    mode: 'board',
    groupBy: 'p-status',
  }

  it('a fast double-click writes one row; a further click after it resolves adds a second', async () => {
    const user = userEvent.setup()
    let resolveAdd: (id: string | null) => void = () => {}
    const addRowSpy = jest.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveAdd = resolve
        })
    )

    const { container } = render(
      <CollectionView
        config={boardConfig}
        schema={statusSchema}
        rows={[]}
        editable
        onAddRow={addRowSpy}
        onRenameRow={jest.fn()}
      />
    )

    const doingLane = () => container.querySelector<HTMLElement>('[data-lane="doing"]')!
    const button = () => within(doingLane()).getByRole('button', { name: '＋ task' })

    await user.dblClick(button())
    expect(addRowSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveAdd('row-1')
    })

    await user.click(button())
    expect(addRowSpy).toHaveBeenCalledTimes(2)
  })
})
