/**
 * KAN-97 — the change log page's `deleted` view (s6o6): a real, switchable
 * pill rendering `buildDeletedCards`' output, with restore wired to
 * `restorePage` through the organism itself (not a mock of the pure builder —
 * that is `change-log-deleted-view.test.ts`'s job).
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/name', () => ({
  usePondName: () => 'the garden',
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(0),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/change-log/trash', () => ({
  existingPageIds: (...args: unknown[]) => mockExistingPageIds(...args),
  restorePage: (...args: unknown[]) => mockRestorePage(...args),
}))

const mockListRecords = jest.fn()
const mockExistingPageIds = jest.fn()
const mockRestorePage = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'delete',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-01-01T18:40:00.000Z',
    statusAt: '2026-01-01T18:40:00.000Z',
    ...over,
  }
}

const DELETE_RECORD = record({
  id: 'del-1',
  before: {
    title: 'old quotes',
    parentId: 'parent-1',
    order: 0,
    pageIds: ['page-1'],
    blockCount: 4,
    nestedPageCount: 1,
    parentPath: ['creativity', 'kitchen renovation'],
  },
})

const RESTORE_RECORD = record({
  id: 'restore-1',
  action: 'restore',
  createdAt: '2026-01-02T09:00:00.000Z',
  statusAt: '2026-01-02T09:00:00.000Z',
})

/** A second, later trashing — same shape as `DELETE_RECORD` but its own page
 *  and a later `createdAt`, so its `restorable until` falls later on the
 *  calendar and must render in ink, not burnt orange. */
const LATER_DELETE_RECORD = record({
  id: 'del-2',
  createdAt: '2026-01-10T12:00:00.000Z',
  statusAt: '2026-01-10T12:00:00.000Z',
  before: {
    title: 'supplier list',
    parentId: 'parent-2',
    order: 0,
    pageIds: ['page-2'],
    blockCount: 2,
    nestedPageCount: 0,
    parentPath: [],
  },
  targetPageId: 'page-2',
})

const shortDateOf = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' }).toLowerCase()}`
}
const plus30Days = (iso: string): string =>
  new Date(Date.parse(iso) + 30 * 86_400_000).toISOString()
const RESTORABLE_UNTIL = `restorable until ${shortDateOf(plus30Days(DELETE_RECORD.createdAt))}`

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

/** The infinite "all" query has no `action` filter; the deleted view's does. */
const isDeletedQuery = (opts: { action?: unknown }) => Array.isArray(opts.action)

beforeEach(() => {
  jest.clearAllMocks()
  mockExistingPageIds.mockResolvedValue(new Set(['page-1']))
  mockRestorePage.mockResolvedValue(undefined)
})

describe('ChangeLogPage — the deleted view', () => {
  it('renders a trashed page as an s6o6 card, restorable in burnt orange', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isDeletedQuery(opts) ? [DELETE_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'deleted' }))

    expect(await screen.findByText('deleted page old quotes')).toBeInTheDocument()
    expect(screen.getByText('you · 1 jan')).toBeInTheDocument()
    expect(screen.getByText('creativity › kitchen renovation')).toBeInTheDocument()
    expect(screen.getByText('4 blocks, 1 nested page')).toBeInTheDocument()

    const restorable = screen.getByText(RESTORABLE_UNTIL)
    expect(restorable).toHaveClass('text-mn-signal-dated')
    expect(screen.getByRole('button', { name: 'restore' })).toBeInTheDocument()

    expect(mockExistingPageIds).toHaveBeenCalledWith(expect.anything(), ['page-1'])
  })

  it('restores through restorePage and stops offering restore once answered', async () => {
    let answered = false
    mockListRecords.mockImplementation(async (_supabase, opts) => {
      if (!isDeletedQuery(opts)) return []
      return answered ? [DELETE_RECORD, RESTORE_RECORD] : [DELETE_RECORD]
    })
    mockRestorePage.mockImplementation(async () => {
      answered = true
    })

    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'deleted' }))

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    expect(mockRestorePage).toHaveBeenCalledWith(expect.anything(), 'del-1')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'restore' })).not.toBeInTheDocument()
    })
  })

  it("reads the top-level card's `was in` as the pond's real name, not the literal 'life'", async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isDeletedQuery(opts) ? [LATER_DELETE_RECORD] : []
    )
    mockExistingPageIds.mockResolvedValue(new Set(['page-2']))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'deleted' }))

    expect(await screen.findByText('the garden')).toBeInTheDocument()
    expect(screen.queryByText('life')).not.toBeInTheDocument()
  })

  it('says so, on the card and as a notice, when the restore fell back to the pond root', async () => {
    let answered = false
    mockListRecords.mockImplementation(async (_supabase, opts) => {
      if (!isDeletedQuery(opts)) return []
      return answered
        ? [DELETE_RECORD, record({ ...RESTORE_RECORD, after: { parentFallback: true } })]
        : [DELETE_RECORD]
    })
    mockRestorePage.mockImplementation(async () => {
      answered = true
    })

    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'deleted' }))

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    const fallbackLine = 'put back at the top of the pond — its old place is gone'
    expect(await screen.findAllByText(fallbackLine)).toHaveLength(2)
  })

  it('colours only the soonest restorable-until burnt orange when two pages are in trash', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isDeletedQuery(opts) ? [DELETE_RECORD, LATER_DELETE_RECORD] : []
    )
    mockExistingPageIds.mockResolvedValue(new Set(['page-1', 'page-2']))

    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'deleted' }))

    const laterRestorable = `restorable until ${shortDateOf(plus30Days(LATER_DELETE_RECORD.createdAt))}`
    const soonerRestorable = await screen.findByText(RESTORABLE_UNTIL)
    const later = screen.getByText(laterRestorable)

    expect(soonerRestorable).toHaveClass('text-mn-signal-dated')
    expect(later).not.toHaveClass('text-mn-signal-dated')
    expect(later).toHaveClass('text-mn-text', 'font-medium')
  })

  it('has no lead paragraph or waiting-count figure — s6o6 draws only the title, view bar and cards', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isDeletedQuery(opts) ? [DELETE_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'deleted' }))
    await screen.findByText('deleted page old quotes')

    expect(
      screen.queryByText('Every action in this pond, by you, by Pond and by anyone you share a page with. One record for each, newest first.', { exact: false })
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('change-log-waiting-count')).not.toBeInTheDocument()
    expect(screen.queryByText('waiting on you')).not.toBeInTheDocument()
  })

  it('wires restore through a PondControl button, not the raw button primitive', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isDeletedQuery(opts) ? [DELETE_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'deleted' }))

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    expect(restoreButton).toHaveAttribute('data-kind', 'button')
  })

  it('says so plainly when nothing has been trashed', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) => (isDeletedQuery(opts) ? [] : []))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'deleted' }))

    expect(await screen.findByTestId('change-log-deleted-empty')).toHaveTextContent(
      'nothing in the trash'
    )
  })

  it('refetches on each switch, picking up a page trashed since the last fetch — not just once', async () => {
    let trashed = false
    mockListRecords.mockImplementation(async (_supabase, opts) => {
      if (!isDeletedQuery(opts)) return []
      return trashed ? [DELETE_RECORD, LATER_DELETE_RECORD] : [DELETE_RECORD]
    })
    mockExistingPageIds.mockResolvedValue(new Set(['page-1', 'page-2']))

    const user = userEvent.setup()
    // A client with the app's own default staleTime (`Providers`, 30s) — the
    // bug only shows once data from the first open is still "fresh".
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30 * 1000 } },
    })
    render(
      <QueryClientProvider client={client}>
        <ChangeLogPage />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('button', { name: 'deleted' }))
    expect(await screen.findByText('deleted page old quotes')).toBeInTheDocument()
    expect(screen.queryByText('deleted page supplier list')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'all' }))
    trashed = true // a page trashed through the mocked store while the deleted view was closed

    await user.click(screen.getByRole('button', { name: 'deleted' }))
    expect(await screen.findByText('deleted page supplier list')).toBeInTheDocument()
  })

  it('narrows to s6o6’s 700px content box, not s6o1’s 840px', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) => (isDeletedQuery(opts) ? [] : []))
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByTestId('change-log-column')).toHaveStyle({ maxWidth: '840px' })

    await user.click(screen.getByRole('button', { name: 'deleted' }))

    // maxWidth bounds the border-box column, which eats PAGE_COLUMN_PAD_PX (32px)
    // each side — 700 + 2 * 32 so the content box itself lands at exactly 700px.
    await waitFor(() =>
      expect(screen.getByTestId('change-log-column')).toHaveStyle({ maxWidth: '764px' })
    )
  })
})
