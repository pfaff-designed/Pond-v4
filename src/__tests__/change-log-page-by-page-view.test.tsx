/**
 * KAN-148 — the change log page's `by page` view (s6o1, "stated" not drawn):
 * the "all" query's own records regrouped by page (`buildLogPageGroups`),
 * group heads in the day-head style, chips "grouped by page" · "newest
 * first", the same five-column table as "all". The lead figure ("N
 * proposed, waiting on you") stays; "all"'s own descriptive paragraph does
 * not.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { changeLogRecordUrl } from '@/lib/change-log/record-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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
  countWaiting: jest.fn().mockResolvedValue(3),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

const mockListRecords = jest.fn()
const mockListPages = jest.fn().mockResolvedValue([])

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: 'tool-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-01-01T09:24:00.000Z',
    statusAt: '2026-01-01T09:24:00.000Z',
    ...over,
  }
}

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
  mockListPages.mockResolvedValue([
    { id: 'page-1', title: 'launch plan' },
    { id: 'page-2', title: 'budget' },
  ])
})

describe('ChangeLogPage — the by page view', () => {
  it('shows the lead figure but not "all"\'s own descriptive paragraph', async () => {
    mockListRecords.mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))

    expect(await screen.findByTestId('change-log-waiting-count')).toHaveTextContent('3')
    expect(screen.getByText(/waiting on you/)).toBeInTheDocument()
    expect(screen.queryByText(/Every action in this pond, by you, by Pond/)).not.toBeInTheDocument()
  })

  it('renders the "grouped by page" and "newest first" chips', async () => {
    mockListRecords.mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))

    expect(await screen.findByText('grouped by page')).toBeInTheDocument()
    expect(screen.getByText('newest first')).toBeInTheDocument()
  })

  it('groups records by page, newest group first, rows newest first within a group', async () => {
    const BUDGET_OLDER = record({
      id: 'rec-budget-older',
      targetPageId: 'page-2',
      createdAt: '2026-01-01T08:00:00.000Z',
    })
    const LAUNCH_OLDER = record({
      id: 'rec-launch-older',
      targetPageId: 'page-1',
      createdAt: '2026-01-01T09:00:00.000Z',
    })
    const LAUNCH_NEWEST = record({
      id: 'rec-launch-newest',
      targetPageId: 'page-1',
      createdAt: '2026-01-01T10:00:00.000Z',
    })
    // `listRecords` returns newest-first, as the real store does.
    mockListRecords.mockResolvedValue([LAUNCH_NEWEST, LAUNCH_OLDER, BUDGET_OLDER])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))

    const groupHeads = await screen.findAllByTestId('change-log-group-head')
    expect(groupHeads.map((el) => el.textContent)).toEqual(['launch plan', 'budget'])

    const launchRows = screen.getAllByTestId(/change-log-status-rec-launch/)
    expect(launchRows).toHaveLength(2)
    expect(screen.getByTestId('change-log-status-rec-launch-newest')).toBeInTheDocument()
    expect(screen.getByTestId('change-log-status-rec-launch-older')).toBeInTheDocument()
    expect(screen.getByTestId('change-log-status-rec-budget-older')).toBeInTheDocument()
  })

  it('renders the same five columns as "all"', async () => {
    mockListRecords.mockResolvedValue([record()])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))
    await screen.findAllByText('launch plan')

    expect(screen.getByText('time')).toBeInTheDocument()
    expect(screen.getByText('what')).toBeInTheDocument()
    expect(screen.getByText('page')).toBeInTheDocument()
    expect(screen.getByText('by')).toBeInTheDocument()
    expect(screen.getByText('status')).toBeInTheDocument()
  })

  it('opens the record page when a row is clicked', async () => {
    mockListRecords.mockResolvedValue([record({ id: 'rec-open' })])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))
    const statusCell = await screen.findByTestId('change-log-status-rec-open')

    await user.click(statusCell.closest('button') as HTMLElement)

    expect(mockPush).toHaveBeenCalledWith(changeLogRecordUrl('rec-open'))
  })

  it('shows the empty state, not a blank card, when nothing is logged', async () => {
    mockListRecords.mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))

    expect(await screen.findByTestId('change-log-empty')).toHaveTextContent(
      'nothing logged in this pond yet'
    )
  })

  it('offers load more, and fetching the next page surfaces an older page group', async () => {
    // A full first page (50, `page-1`) so `hasNextPage` is true, then a
    // second page holding a record on a page whose edits are all older than
    // the first page — "by page" has no group for it until load more runs.
    const PAGE_ONE: ChangeLogRecord[] = Array.from({ length: 50 }, (_, i) =>
      record({
        id: `page1-${i}`,
        targetPageId: 'page-1',
        createdAt: new Date(2026, 0, 1, 12, 0, -i).toISOString(),
      })
    )
    const OLDER_PAGE_RECORD = record({
      id: 'rec-older-page',
      targetPageId: 'page-2',
      createdAt: '2025-12-01T08:00:00.000Z',
    })
    mockListRecords.mockImplementation(async (_supabase, opts) => {
      if (opts.before === undefined) return PAGE_ONE
      return [OLDER_PAGE_RECORD]
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'by page' }))
    await screen.findByTestId('change-log-load-more')
    expect(screen.queryByText('budget')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('change-log-load-more'))

    const groupHeads = await screen.findAllByTestId('change-log-group-head')
    expect(groupHeads.map((el) => el.textContent)).toContain('budget')
    expect(mockListRecords).toHaveBeenCalledTimes(2)
  })
})
