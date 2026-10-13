/**
 * KAN-292 — the path test: the calendar's, list's and timeline's `add a date field`
 * remedy, wired from the real `ViewView`/`CollectionView` host (not
 * `CollectionCalendar`, `CollectionList` or `CollectionGantt` alone). `ViewView`
 * builds the handler over `useCollectionRows().updateSchema` +
 * `useDeletionUndo`'s `stageUndo`, gated on `editable`, and threads the SAME
 * handler into all three.
 */
import { render, screen } from '@testing-library/react'
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

function renderView(data: ViewBlock) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <SiblingBlocksProvider value={{ blocks: [], pageId: 'page-1' }}>
          <ViewView data={data} editable onChange={jest.fn()} />
        </SiblingBlocksProvider>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

describe('ViewView — the calendar’s "add a date field" remedy reaches the page (KAN-292)', () => {
  it('clicking the remedy mints a date field onto the schema, and the button goes on rerender', async () => {
    const user = userEvent.setup()
    renderView(calendar)

    const button = screen.getByRole('button', { name: 'add a date field' })
    await user.click(button)

    expect(updateSchema).toHaveBeenCalledWith([
      ...dateless,
      expect.objectContaining({ name: 'date', type: 'date' }),
    ])
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})

describe('ViewView — the list’s "add a date field" remedy reaches the page (KAN-292)', () => {
  it('clicking the remedy mints a date field onto the schema, and the button goes on rerender', async () => {
    const user = userEvent.setup()
    renderView(list)

    const button = screen.getByRole('button', { name: 'add a date field' })
    await user.click(button)

    expect(updateSchema).toHaveBeenCalledWith([
      ...dateless,
      expect.objectContaining({ name: 'date', type: 'date' }),
    ])
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})

describe('ViewView — the timeline’s "add a date field" remedy reaches the page (KAN-292)', () => {
  it('clicking the remedy mints a date field onto the schema, and the button goes on rerender', async () => {
    const user = userEvent.setup()
    renderView(gantt)

    const button = screen.getByRole('button', { name: 'add a date field' })
    await user.click(button)

    expect(updateSchema).toHaveBeenCalledWith([
      ...dateless,
      expect.objectContaining({ name: 'date', type: 'date' }),
    ])
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})
