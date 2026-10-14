/**
 * KAN-94 — the change log page's table chrome (s6o1): the header row, the
 * day-group header rows, and record rows — wired to `buildLogRows` through
 * the organism's own `listRecords` + page-title fetch.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { clockTime } from '@/lib/change-log/page-changes'
import { changeLogRecordUrl } from '@/lib/change-log/record-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

const RECORDS: ChangeLogRecord[] = [
  record({ id: 'r1', status: 'accepted', actor: 'pond', createdAt: '2026-09-30T09:31:00.000Z' }),
  record({
    id: 'r2',
    status: 'outdated',
    actor: 'pond',
    action: 'memory_note',
    targetPageId: null,
    createdAt: '2026-09-30T09:02:00.000Z',
  }),
  record({
    id: 'r3',
    status: 'proposed',
    actor: 'you',
    action: 'define_schema',
    targetPageId: 'page-gone',
    createdAt: '2026-09-29T18:40:00.000Z',
  }),
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
  mockListRecords.mockResolvedValue(RECORDS)
  mockListPages.mockResolvedValue([{ id: 'page-1', title: 'kitchen renovation' }])
})

describe('ChangeLogPage — table chrome', () => {
  it('renders the header row columns', async () => {
    renderPage()
    await screen.findByText('created this page')

    for (const column of ['time', 'what', 'page', 'by', 'status']) {
      expect(screen.getByText(column)).toBeInTheDocument()
    }
  })

  it('groups rows under day headers and renders each column', async () => {
    renderPage()
    await screen.findByText('created this page')

    expect(screen.getByText('Sep 30')).toBeInTheDocument()
    expect(screen.getByText('Sep 29')).toBeInTheDocument()

    expect(screen.getByText(clockTime(RECORDS[0]))).toBeInTheDocument()
    expect(screen.getByText('created this page')).toBeInTheDocument()
    expect(screen.getByText('kitchen renovation')).toBeInTheDocument()
    expect(screen.getAllByText('pond')).toHaveLength(2)

    expect(screen.getByText('recorded a memory note')).toBeInTheDocument()
    // "memory" also names an inert view-bar pill (s6o1), so two matches is right.
    expect(screen.getAllByText('memory')).toHaveLength(2)

    expect(screen.getByText('set up the fields')).toBeInTheDocument()
    expect(screen.getByText('deleted page')).toBeInTheDocument()
    expect(screen.getByText('you')).toBeInTheDocument()
  })

  it('splits status into a pill for proposed/outdated, plain mono text otherwise', async () => {
    renderPage()
    await screen.findByText('created this page')

    const accepted = screen.getByTestId('change-log-status-r1')
    expect(accepted).toHaveTextContent('accepted')
    expect(accepted).not.toHaveClass('rounded-full')

    const outdated = screen.getByTestId('change-log-status-r2')
    expect(outdated).toHaveTextContent('outdated')
    expect(outdated).toHaveClass('rounded-full')

    const proposed = screen.getByTestId('change-log-status-r3')
    expect(proposed).toHaveTextContent('proposed')
    expect(proposed).toHaveClass('rounded-full')
  })

  it('passes the pond-scoped user to listRecords and listPages', async () => {
    renderPage()
    await screen.findByText('created this page')

    expect(mockListRecords).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user-1', pondId: 'pond-1' })
    )
    expect(mockListPages).toHaveBeenCalledWith(expect.anything(), 'user-1', 'pond-1')
  })

  it('opens the record page when a row is clicked', async () => {
    renderPage()
    await screen.findByText('created this page')

    await userEvent.click(screen.getByText('created this page'))

    expect(mockPush).toHaveBeenCalledWith(changeLogRecordUrl('r1'))
  })
})
