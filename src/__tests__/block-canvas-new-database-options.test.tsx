/**
 * KAN-351: `BlockCanvas`'s `onSourcePick` → `createDatabase` schema mapping must
 * carry a picked field's `options` (minting an id per field AND per option),
 * not drop them — the hop that turns the picker's default `status` field into
 * lanes a board can actually group by. Harness mirrors `calendar-path.test.tsx`
 * (the real `BlockCanvas`, not a bare picker); assertions mirror
 * `feature-databases.test.ts`'s "making a new database" test, against the same
 * `makeFakeSupabase` fake, reading the write back with `readSchema`.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { DEFAULT_STATUS_OPTIONS, readSchema } from '@/lib/properties/schema'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { makeFakeSupabase } from './helpers/fake-supabase'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
const mockCreateClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))
jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

/** `BlockCanvas` is controlled — a harness re-renders it with `onChange`'s next
 *  array, the same way `calendar-path.test.tsx`'s does. */
function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas blocks={blocks} pageId="page-1" pageTitle="trip planning" onChange={setBlocks} />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchPages.mockResolvedValue([])
})

describe('`/board` → `new tasks` writes the task fields, with minted status option ids (KAN-351)', () => {
  it('creates a tasks database: status lanes, done, due, repeats, and assignee', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([])
    fireEvent.click(await screen.findByTestId('trailing-block-gap'))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/board')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByRole('option', { name: 'board' }))

    const picker = await screen.findByRole('listbox', { name: '/board' })
    fireEvent.click(within(picker).getByText('new tasks'))

    let database: ReturnType<typeof sb._pages.get>
    await waitFor(() => {
      database = [...sb._pages.values()].find((p) => readSchema(p.props) !== null)
      expect(database).toBeDefined()
    })
    expect(database!.title).toBe('tasks')

    const schema = readSchema(database!.props)!
    expect(schema.map((field) => [field.name, field.type])).toEqual([
      ['status', 'status'],
      ['done', 'checkbox'],
      ['due', 'date'],
      ['repeats', 'text'],
      ['assignee', 'text'],
    ])
    const status = schema[0]
    expect(status.name).toBe('status')
    expect(status.type).toBe('status')
    expect(status.id).toEqual(expect.any(String))
    expect(status.options).toEqual(
      DEFAULT_STATUS_OPTIONS.map((label) => ({ id: expect.any(String), label }))
    )
    // Each option got its own minted id — not the field's id reused three times.
    const optionIds = status.options!.map((o) => o.id)
    expect(new Set([status.id, ...optionIds]).size).toBe(4)
  })
})
