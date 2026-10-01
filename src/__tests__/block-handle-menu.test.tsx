/**
 * UI flow test for the block handle menu's "turn into › table" gesture (#101,
 * board 6j frames 2–3).
 *
 * Clicking a block's handle opens the block menu. On a LIST block it offers
 * "turn into › table" with the preview count ("4 rows · 3 columns"); picking it
 * writes through createDatabaseFromList and swaps the list for a view of the new
 * database IN PLACE, as a direct user edit — no proposal card, no accept/reject —
 * with an undo toast that restores the list and removes the database. On a
 * non-list block the menu offers no conversion. The write path is mocked; the pure
 * list helpers stay real so the preview count is genuine.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockDeletePage = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
}))

const view = { id: 'v-1', type: 'view', mode: 'table', collectionId: 'db-1' }
const mockCreateDatabaseFromList = jest.fn().mockResolvedValue({
  view,
  databaseId: 'db-1',
  databasesRootId: 'root-db',
  rowCount: 4,
  schema: [],
})
jest.mock('@/lib/pages/list-to-table', () => ({
  ...jest.requireActual('@/lib/pages/list-to-table'),
  createDatabaseFromList: (...args: unknown[]) => mockCreateDatabaseFromList(...args),
}))

const heading: Block = { id: 'b-heading', type: 'text', content: '## ingredients' }
const list: Block = {
  id: 'b-list',
  type: 'text',
  content: '- 500g strong white flour\n- 350g water\n- 100g levain\n- 10g salt',
}
const table: Block = {
  id: 'b-table',
  type: 'table',
  columns: ['Tool', 'Location'],
  rows: [{ id: 'r1', cells: ['Saw', 'Wall'] }],
}

function Harness({ initial, onChange }: { initial: Block[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="sourdough, 78%"
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

beforeEach(() => {
  jest.clearAllMocks()
})

describe('block handle menu — turn into › table (#101)', () => {
  it('opens the block menu from the handle and offers "turn into › table" with the preview count on a list', async () => {
    const user = userEvent.setup()
    renderCanvas([heading, list])
    const handles = screen.getAllByRole('button', { name: /block menu/i })
    await user.click(handles[1])

    const menu = await screen.findByRole('menu', { name: /block menu/i })
    expect(within(menu).getByText('turn into')).toBeInTheDocument()
    const tableItem = within(menu).getByRole('menuitem', { name: /table/i })
    expect(tableItem).toHaveTextContent('4 rows · 3 columns')
  })

  it('offers no conversion on a block that is not a list', async () => {
    const user = userEvent.setup()
    renderCanvas([table])
    await user.click(screen.getByRole('button', { name: /block menu/i }))
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    expect(within(menu).queryByText('turn into')).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: /table/i })).not.toBeInTheDocument()
    // The menu still carries the block's own actions.
    expect(within(menu).getByRole('menuitem', { name: /delete/i })).toBeInTheDocument()
  })

  it('applies directly: creates the database and swaps the list for a view of it in place, with no proposal card (AC2, AC5)', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(screen.getAllByRole('button', { name: /block menu/i })[1])
    await user.click(await screen.findByRole('menuitem', { name: /table/i }))

    await waitFor(() => expect(mockCreateDatabaseFromList).toHaveBeenCalledTimes(1))
    const [, input] = mockCreateDatabaseFromList.mock.calls[0]
    expect(input.block).toEqual(list)
    // Named after the heading above the list (6j frame 3).
    expect(input.title).toBe('ingredients')

    // The list block was replaced IN PLACE by the view, the heading untouched.
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls.at(-1)![0] as Block[]
    expect(next.map((b) => b.id)).toEqual(['b-heading', 'v-1'])
    expect(next[1]).toEqual(view)

    // A direct user edit: no accept / reject anywhere (only Pond's changes are diffs).
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    // …but it is undoable.
    expect(await screen.findByText(/turned into a table/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('undo restores the list in place and removes the database it made', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(screen.getAllByRole('button', { name: /block menu/i })[1])
    await user.click(await screen.findByRole('menuitem', { name: /table/i }))
    await user.click(await screen.findByRole('button', { name: /undo/i }))

    await waitFor(() => {
      const next = onChange.mock.calls.at(-1)![0] as Block[]
      expect(next.map((b) => b.id)).toEqual(['b-heading', 'b-list'])
      expect(next[1]).toEqual(list)
    })
    await waitFor(() => expect(mockDeletePage).toHaveBeenCalledWith(expect.anything(), 'db-1'))
  })

  it('keeps delete in the menu and closes on Escape', async () => {
    const user = userEvent.setup()
    const { onChange } = renderCanvas([heading, list])
    await user.click(screen.getAllByRole('button', { name: /block menu/i })[0])
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(menu).not.toBeInTheDocument())

    await user.click(screen.getAllByRole('button', { name: /block menu/i })[0])
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }))
    const next = onChange.mock.calls.at(-1)![0] as Block[]
    expect(next.map((b) => b.id)).toEqual(['b-list'])
  })
})
