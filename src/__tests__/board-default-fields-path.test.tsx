/**
 * KAN-351 path test: a board (or calendar) inserted with no databases yet lands
 * usable with no model involved — the source picker's `new` step opens prefilled,
 * the written schema carries a groupable status (or date) field, and the view
 * draws straight off it. Harness mirrors `calendar-path.test.tsx`'s real
 * `BlockCanvas`; the `new database —` write path mirrors
 * `block-canvas-new-database-options.test.tsx`'s fake-Supabase precedent.
 */

import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
import { makeFakeSupabase } from './helpers/fake-supabase'
import { BOARD_EMPTY_LINE } from '@/lib/modules/view/kinds'

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
 *  array, same as `calendar-path.test.tsx`'s and the options precedent's. */
function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="trip planning"
      onChange={setBlocks}
      onUndoRemove={() => {}}
    />
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
  jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('`/board` with no databases yet lands real lanes, and a card lands in one (KAN-351)', () => {
  it('↵ ↵ ↵ lands a board with three empty lanes, each ＋ task; a typed card lands in its lane', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    const { container } = renderCanvas([])
    fireEvent.click(await screen.findByTestId('trailing-block-gap'))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/board')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    // `/board` also fuzzy-matches the `dashboard` template, which ranks first —
    // the exact `board` block row is picked by name, not by ↵ on the top match.
    fireEvent.click(within(menu).getByRole('option', { name: 'board' }))

    // `source`: no databases, so `new database — trip planning` is the only row
    // and is preselected — ↵ is enough.
    const source = await screen.findByRole('listbox', { name: '/board' })
    expect(within(source).getByText(/new database/)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Enter' })

    // `new`: opens prefilled with `title` and `status` — no further picking needed.
    const draft = await screen.findByRole('listbox', { name: 'new database — trip planning' })
    expect(within(draft).getByText('title')).toBeInTheDocument()
    expect(within(draft).getByText('status')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(await screen.findByText('to do')).toBeInTheDocument()
    expect(screen.getByText('doing')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.queryByText(BOARD_EMPTY_LINE)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'add a status field' })
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '＋ task' })).toHaveLength(3)

    const toDoLane = container.querySelector<HTMLElement>('[data-lane="to do"]')!
    fireEvent.click(within(toDoLane).getByRole('button', { name: '＋ task' }))

    const titleInput = await within(toDoLane).findByRole('textbox', { name: 'Card title' })
    fireEvent.change(titleInput, { target: { value: 'wash the car' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    expect(within(toDoLane).getByRole('textbox', { name: 'Card title' })).toHaveValue(
      'wash the car'
    )
  })
})

describe('`/calendar` with no databases yet lands a usable month grid (KAN-351)', () => {
  it('↵ ↵ ↵ lands a month grid with no "add a date field" remedy', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([])
    fireEvent.click(await screen.findByTestId('trailing-block-gap'))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'blocks' })
    writeInTextBlock(editor, '/calendar')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByRole('option', { name: /^calendar/ }))

    const source = await screen.findByRole('listbox', { name: '/calendar' })
    expect(within(source).getByText(/new database/)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Enter' })

    const draft = await screen.findByRole('listbox', { name: 'new database — trip planning' })
    expect(within(draft).getByText('title')).toBeInTheDocument()
    expect(within(draft).getByRole('option', { name: /^date/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Enter' })

    expect(await screen.findByText('september 2026')).toBeInTheDocument()
    expect(screen.getByText('today')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'add a date field' })).not.toBeInTheDocument()
  })
})
