/**
 * KAN-175 — the panel's "open in change log" lands on `?page=<id>`;
 * `ChangeLogPage`'s "all" view, when that param is set, lists only that
 * page's own records (the same `listRecords({ targetPageId })` query the
 * panel itself makes) behind a "page is {title}" chip. `pageFilterId` is
 * read straight from `useSearchParams()` on every render (not into state),
 * so clearing the chip's `×` (or the "all" pill) actually drops `?page=`
 * from the URL via `router.replace`, rather than leaving it for a reload to
 * re-apply.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

let mockSearchParams = new URLSearchParams({ page: 'page-1' })
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}))

jest.mock('@/lib/pond/name', () => ({
  usePondName: () => 'life',
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
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

const mockListRecords = jest.fn()
const mockListPages = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'create_page',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

const PAGE_1_RECORDS: ChangeLogRecord[] = [
  record({ id: 'r1', targetPageId: 'page-1', action: 'create_page' }),
]

const OTHER_PAGE_RECORDS: ChangeLogRecord[] = [
  record({ id: 'r2', targetPageId: 'page-2', action: 'define_schema' }),
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
  return { ...utils, client }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSearchParams = new URLSearchParams({ page: 'page-1' })
  mockListRecords.mockImplementation(async (_supabase, opts) => {
    if (opts.targetPageId === 'page-1') return PAGE_1_RECORDS
    return OTHER_PAGE_RECORDS
  })
  mockListPages.mockResolvedValue([
    { id: 'page-1', title: 'kitchen renovation' },
    { id: 'page-2', title: 'budget' },
  ])
})

describe('ChangeLogPage — page filter', () => {
  it('renders only the filtered page’s records plus the chip, scoped to targetPageId', async () => {
    renderPage()

    expect(await screen.findByText('created this page')).toBeInTheDocument()
    expect(screen.getByText(/page is kitchen renovation/)).toBeInTheDocument()
    expect(screen.queryByText('set up the fields')).not.toBeInTheDocument()

    expect(mockListRecords).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetPageId: 'page-1' })
    )
  })

  it('clears the filter via router.replace, dropping `?page=` rather than leaving it for a reload', async () => {
    renderPage()
    await screen.findByText(/page is kitchen renovation/)

    await userEvent.click(screen.getByRole('button', { name: 'clear page filter' }))

    expect(mockReplace).toHaveBeenCalledWith('?nodeId=__change_log__')
  })

  it('picks up a URL change while mounted, not just once at mount', async () => {
    const { rerender, client } = renderPage()
    await screen.findByText(/page is kitchen renovation/)

    // What `router.replace` actually does to the URL — the component must
    // react to the new `searchParams` on the next render, not a value it
    // captured once when it first mounted.
    mockSearchParams = new URLSearchParams()
    rerender(
      <QueryClientProvider client={client}>
        <ChangeLogPage />
      </QueryClientProvider>
    )

    // The paginated "all" query (no `targetPageId`) is what the mock answers
    // with `OTHER_PAGE_RECORDS` — its own record showing up is proof the
    // filtered, single-page list is gone.
    expect(await screen.findByText('set up the fields')).toBeInTheDocument()
    expect(screen.queryByText(/page is kitchen renovation/)).not.toBeInTheDocument()
    expect(
      mockListRecords.mock.calls.some(([, opts]) => opts.targetPageId === undefined)
    ).toBe(true)
  })
})
