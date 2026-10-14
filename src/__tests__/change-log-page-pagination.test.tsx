/**
 * KAN-94 — pagination (AUDIT G7): a "load more" control at the table foot,
 * reading the next page via the prior page's oldest `createdAt` as `before`,
 * so a long log is never rendered in one shot.
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
  listPages: jest.fn().mockResolvedValue([]),
}))

const mockListRecords = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'create_page',
    actor: 'pond',
    targetPageId: null,
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

// One full page (50) so `hasNextPage` is true, then a short second page.
const PAGE_ONE: ChangeLogRecord[] = Array.from({ length: 50 }, (_, i) =>
  record({
    id: `page1-${i}`,
    createdAt: new Date(2026, 8, 30, 12, 0, -i).toISOString(),
  })
)
const PAGE_TWO: ChangeLogRecord[] = [
  record({ id: 'page2-0', createdAt: '2026-09-29T08:00:00.000Z' }),
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockListRecords.mockImplementation(async (_supabase, opts) => {
    if (opts.before === undefined) return PAGE_ONE
    return PAGE_TWO
  })
})

describe('ChangeLogPage — pagination', () => {
  it('renders only the first page until load more is used', async () => {
    renderPage()
    await screen.findByTestId('change-log-load-more')

    expect(screen.getByTestId(`change-log-status-${PAGE_ONE[0].id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`change-log-status-${PAGE_TWO[0].id}`)).not.toBeInTheDocument()
    expect(mockListRecords).toHaveBeenCalledTimes(1)
  })

  it('appends the second page without re-rendering the first page rows', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('change-log-load-more')

    const firstRowBefore = screen.getByTestId(`change-log-status-${PAGE_ONE[0].id}`)

    await user.click(screen.getByTestId('change-log-load-more'))

    await waitFor(() => {
      expect(screen.getByTestId(`change-log-status-${PAGE_TWO[0].id}`)).toBeInTheDocument()
    })

    // The first page's row is the same DOM node, not torn down and rebuilt.
    expect(screen.getByTestId(`change-log-status-${PAGE_ONE[0].id}`)).toBe(firstRowBefore)
    expect(mockListRecords).toHaveBeenCalledTimes(2)
    expect(mockListRecords).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ before: PAGE_ONE[PAGE_ONE.length - 1].createdAt })
    )
  })

  it('hides load more once a short page signals the log is exhausted', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('change-log-load-more')

    await user.click(screen.getByTestId('change-log-load-more'))

    await waitFor(() => {
      expect(screen.getByTestId(`change-log-status-${PAGE_TWO[0].id}`)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('change-log-load-more')).not.toBeInTheDocument()
  })
})
