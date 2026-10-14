/**
 * `ChangeLogRecordPage`'s skeleton (KAN-152, s6o3): the loading placeholder
 * resolving into the fields grid, and the not-found state for a record
 * missing or hidden by RLS (AUDIT G6). The before→after card, the "this
 * change" column and the action buttons are later passes of this ticket.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogRecordPage } from '@/components/organisms/ChangeLogRecordPage'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  getRecord: (...args: unknown[]) => mockGetRecord(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

jest.mock('@/lib/conversation/client', () => ({
  ...jest.requireActual('@/lib/conversation/client'),
  getThreadFirstQuestion: (...args: unknown[]) => mockGetThreadFirstQuestion(...args),
}))

const mockGetRecord = jest.fn()
const mockGetPage = jest.fn()
const mockGetThreadFirstQuestion = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: 'a',
    before: null,
    after: [{ id: 'a', type: 'text', content: 'ONE' }],
    sourceThreadId: null,
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:20:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

function renderPage(recordId = 'rec-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogRecordPage recordId={recordId} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPage.mockResolvedValue(null)
  mockGetThreadFirstQuestion.mockResolvedValue(null)
})

describe('ChangeLogRecordPage — loading', () => {
  it('shows a loading placeholder, then the title and fields once the record resolves', async () => {
    let resolveRecord: (value: ChangeLogRecord) => void = () => {}
    mockGetRecord.mockReturnValue(
      new Promise((resolve) => {
        resolveRecord = resolve
      })
    )

    renderPage()

    expect(screen.getByTestId('change-log-record-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('change-log-record-title')).not.toBeInTheDocument()

    resolveRecord(record())

    await screen.findByTestId('change-log-record-title')
    expect(screen.getByTestId('change-log-record-title')).toHaveTextContent('ONE')
    expect(screen.getByText('status')).toBeInTheDocument()
    expect(screen.getByText('proposed by')).toBeInTheDocument()
    expect(screen.getByText('page')).toBeInTheDocument()
    expect(screen.queryByTestId('change-log-record-loading')).not.toBeInTheDocument()
  })

  it('renders the read chips and omits the from-thread row with no thread', async () => {
    mockGetRecord.mockResolvedValue(record({ read: ['kitchen renovation', 'email · j. hart'] }))

    renderPage()

    await screen.findByTestId('change-log-record-title')
    expect(screen.getByText('kitchen renovation')).toBeInTheDocument()
    expect(screen.getByText('email · j. hart')).toBeInTheDocument()
    expect(screen.queryByText('from thread')).not.toBeInTheDocument()
  })

  it('renders the from-thread chip from the thread’s first question', async () => {
    mockGetRecord.mockResolvedValue(record({ sourceThreadId: 'thread-1' }))
    mockGetThreadFirstQuestion.mockResolvedValue('when can the electrician come back?')

    renderPage()

    await screen.findByText('when can the electrician come back?')
    expect(screen.getByText('from thread')).toBeInTheDocument()
  })
})

describe('ChangeLogRecordPage — not found', () => {
  it('shows the not-found state for an unknown or invisible record', async () => {
    mockGetRecord.mockResolvedValue(null)

    renderPage('rec-missing')

    await waitFor(() => {
      expect(screen.getByTestId('change-log-record-not-found')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('change-log-record-title')).not.toBeInTheDocument()
  })
})
