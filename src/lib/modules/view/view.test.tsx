/**
 * KAN-292 — the path test: the calendar's, list's and timeline's `add a date field`
 * remedy, wired from the real `ViewView`/`CollectionView` host (not
 * `CollectionCalendar`, `CollectionList` or `CollectionGantt` alone). `ViewView`
 * builds the handler over `useCollectionRows().updateSchema` +
 * `useDeletionUndo`'s `stageUndo`, gated on `editable`, and threads the SAME
 * handler into all three.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { SiblingBlocksProvider } from '@/lib/modules/sibling-context'
import { ViewView } from './view'
import type { ViewBlock } from './schema'
import type { PropertySchema } from '@/lib/properties/schema'

const dateless: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]

const updateSchema = jest.fn()
jest.mock('./use-collection-rows', () => ({
  useCollectionRows: () => {
    const [schema, setSchema] = useState<PropertySchema>(dateless)
    updateSchema.mockImplementation((next: PropertySchema) => setSchema(next))
    return {
      schema,
      rows: [],
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

const calendar: ViewBlock = { id: 'v-cal', type: 'view', mode: 'calendar' }
const list: ViewBlock = { id: 'v-list', type: 'view', mode: 'list' }
const gantt: ViewBlock = { id: 'v-gantt', type: 'view', mode: 'gantt' }

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
})

describe('ViewView — the "add a date field" remedy reaches the page (KAN-292)', () => {
  it.each([
    ['calendar', calendar],
    ['list', list],
    ['gantt', gantt],
  ])(
    '%s: clicking the remedy mints a date field onto the schema, and the button goes on rerender',
    async (_name, data) => {
      const user = userEvent.setup()
      renderView(data)

      const button = screen.getByRole('button', { name: 'add a date field' })
      await user.click(button)

      expect(updateSchema).toHaveBeenCalledWith([
        ...dateless,
        expect.objectContaining({ name: 'date', type: 'date' }),
      ])
      expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
    }
  )

  it('read-only (editable=false) draws no "add a date field" button', () => {
    renderView(calendar, false)
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})

describe('ViewView — undo removes only the field it added (KAN-292)', () => {
  it('does not clobber a schema edit made elsewhere while the undo toast is open', async () => {
    const user = userEvent.setup()
    renderView(calendar)

    await user.click(screen.getByRole('button', { name: 'add a date field' }))
    const afterAdd = updateSchema.mock.calls.at(-1)![0] as PropertySchema
    const addedField = afterAdd[afterAdd.length - 1]

    // Another schema edit lands while the toast is still open — e.g. a column
    // added through the picker. Undo must not clobber it.
    const otherField = { id: 'p-other', name: 'Notes', type: 'text' as const }
    const withOther = [...afterAdd, otherField]
    act(() => {
      updateSchema(withOther)
    })

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    const afterUndo = updateSchema.mock.calls.at(-1)![0] as PropertySchema
    expect(afterUndo).toEqual([...dateless, otherField])
    expect(afterUndo.find((d) => d.id === addedField.id)).toBeUndefined()
  })
})
