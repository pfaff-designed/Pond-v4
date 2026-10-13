/**
 * KAN-262 path test: `/calendar` on the real page host (`BlockCanvas`, not the
 * bare `CollectionCalendar`) — the source picker, a picked database, and the
 * landed view block drawing a real collection's dated rows. Mirrors
 * `block-return.test.tsx`'s `/table` source-pick precedent (#280).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'
import { withSchema, type PropertySchema } from '@/lib/properties/schema'
import { CALENDAR_EMPTY_LINE } from '@/lib/modules/view/kinds'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
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

/** The pond's databases root and two databases in it, as `fetchPages` lists them. */
const databaseRows = [
  { id: 'root', parent_id: null, type: 'page', title: 'databases', order: 0, updated_at: '' },
  {
    id: 'db-events',
    parent_id: 'root',
    type: 'database',
    title: 'events',
    order: 0,
    updated_at: '',
  },
  {
    id: 'db-notes',
    parent_id: 'root',
    type: 'database',
    title: 'notes',
    order: 1,
    updated_at: '',
  },
  {
    id: 'db-fresh',
    parent_id: 'root',
    type: 'database',
    title: 'fresh',
    order: 2,
    updated_at: '',
  },
]

const schemaWithDate: PropertySchema = [
  { id: 'p-due', name: 'Due', type: 'date' },
  { id: 'p-title', name: 'Title', type: 'text' },
]
const schemaNoDate: PropertySchema = [{ id: 'p-title', name: 'Title', type: 'text' }]

/** `getPage` by collection id — the schema each database carries. */
const PAGES: Record<string, PondPage> = {
  'db-events': {
    id: 'db-events',
    parentId: 'root',
    type: 'page',
    title: 'events',
    blocks: [],
    order: 0,
    props: withSchema({}, schemaWithDate),
  },
  'db-notes': {
    id: 'db-notes',
    parentId: 'root',
    type: 'page',
    title: 'notes',
    blocks: [],
    order: 0,
    props: withSchema({}, schemaNoDate),
  },
  // What `/calendar → new database` makes: a title field and no records at all.
  'db-fresh': {
    id: 'db-fresh',
    parentId: 'root',
    type: 'page',
    title: 'fresh',
    blocks: [],
    order: 0,
    props: withSchema({}, schemaNoDate),
  },
}

const rowPage = (
  id: string,
  parentId: string,
  title: string,
  props: Record<string, unknown>
): PondPage => ({
  id,
  parentId,
  type: 'row',
  title,
  blocks: [],
  order: 0,
  props,
})

/** Four same-day rows over the pinned "today" (2026-09-10) — one past the ＋3 cap. */
const ROWS_BY_COLLECTION: Record<string, PondPage[]> = {
  'db-events': [
    rowPage('r1', 'db-events', 'first', { 'p-due': '2026-09-10' }),
    rowPage('r2', 'db-events', 'second', { 'p-due': '2026-09-10' }),
    rowPage('r3', 'db-events', 'third', { 'p-due': '2026-09-10' }),
    rowPage('r4', 'db-events', 'fourth', { 'p-due': '2026-09-10' }),
  ],
  // A record exists, but the collection's own schema has no date property — the
  // "no rows at all" frame box (viewFrameState) is a different, earlier case.
  'db-notes': [rowPage('r1', 'db-notes', 'a note', {})],
}

const mockGetPage = jest.fn((_supabase: unknown, id: string) => Promise.resolve(PAGES[id] ?? null))
const mockGetCollectionRows = jest.fn((_supabase: unknown, _userId: string, id: string) =>
  Promise.resolve(ROWS_BY_COLLECTION[id] ?? [])
)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (supabase: unknown, id: string) => mockGetPage(supabase, id),
  getCollectionRows: (supabase: unknown, userId: string, id: string) =>
    mockGetCollectionRows(supabase, userId, id),
}))

/** `BlockCanvas` is controlled — a harness re-renders it with `onChange`'s next
 *  array, the same way `DocumentPanel` and `block-return.test.tsx`'s do. */
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
  mockFetchPages.mockResolvedValue(databaseRows)
  jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

describe('`/calendar` path (KAN-262)', () => {
  it('picking a database with dated rows lands the month grid, its chrome, and a day’s ＋{n} overflow', async () => {
    const { container } = renderCanvas([])
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    const editor = await findTextBlock()
    // An empty page leads with its templates; typing a block's name returns to the blocks.
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'page from template' })
    writeInTextBlock(editor, '/calendar')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByText('calendar'))

    const picker = await screen.findByRole('listbox', { name: '/calendar' })
    fireEvent.click(await within(picker).findByRole('option', { name: /events/ }))

    // Chrome: period label, today, prev/next.
    expect(await screen.findByText('september 2026')).toBeInTheDocument()
    expect(screen.getByText('today')).toBeInTheDocument()
    expect(screen.getByLabelText('Previous month')).toBeInTheDocument()
    expect(screen.getByLabelText('Next month')).toBeInTheDocument()

    // The day's four dated rows, capped in the desktop week grid: three shown, one
    // folded into the overflow label. (Today is also the mobile focused-day list's
    // default focus, which reads all four uncapped — scope here to the desktop grid.)
    await waitFor(() => expect(screen.getByText('september 2026')).toBeInTheDocument())
    const desktopWrap = [...container.querySelectorAll('div')].find((d) => d.classList.contains('md:flex'))!
    await waitFor(() => expect(within(desktopWrap).getByText('first')).toBeInTheDocument())
    expect(within(desktopWrap).getByText('second')).toBeInTheDocument()
    expect(within(desktopWrap).getByText('third')).toBeInTheDocument()
    expect(within(desktopWrap).queryByText('fourth')).not.toBeInTheDocument()
    expect(within(desktopWrap).getByText('＋1 more')).toBeInTheDocument()
  })

  it('a database with no date field renders the emptyLine copy, not an error', async () => {
    renderCanvas([])
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'page from template' })
    writeInTextBlock(editor, '/calendar')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByText('calendar'))

    const picker = await screen.findByRole('listbox', { name: '/calendar' })
    fireEvent.click(await within(picker).findByRole('option', { name: /notes/ }))

    expect(await screen.findByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a database with no records draws the calendar’s own chrome and emptyLine, not the frame’s `no rows yet` (decision a)', async () => {
    renderCanvas([])
    fireEvent.click(await screen.findByRole('button', { name: 'Add a block' }))
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    await screen.findByRole('listbox', { name: 'page from template' })
    writeInTextBlock(editor, '/calendar')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    fireEvent.click(within(menu).getByText('calendar'))

    const picker = await screen.findByRole('listbox', { name: '/calendar' })
    fireEvent.click(await within(picker).findByRole('option', { name: /fresh/ }))

    expect(await screen.findByText(CALENDAR_EMPTY_LINE)).toBeInTheDocument()
    expect(screen.getByText('september 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Next month')).toBeInTheDocument()
    expect(screen.queryByText('no rows yet')).not.toBeInTheDocument()
    expect(screen.queryByText('add a row')).not.toBeInTheDocument()
  })
})
