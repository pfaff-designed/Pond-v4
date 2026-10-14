/**
 * `ChangeLogRecordPage`'s before→after card (KAN-152, s6o3): `recordDiffRows`
 * through `ChangeRows` (remove then add) for a block action, or one plain
 * line built from `describeChange` for everything else.
 */

import { render, screen } from '@testing-library/react'
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

describe('ChangeLogRecordPage — before → after card', () => {
  it('shows a remove row then an add row for an edit record', async () => {
    mockGetRecord.mockResolvedValue(
      record({
        before: [{ id: 'a', type: 'text', content: 'kiwi' }],
        after: [{ id: 'a', type: 'text', content: 'fig' }],
      })
    )

    renderPage()

    const card = await screen.findByTestId('change-log-record-diff-card')
    expect(card).toHaveTextContent('before → after')
    const rows = card.querySelectorAll<HTMLElement>('[data-kind="diff-line"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-variant', 'remove')
    expect(rows[0]).toHaveTextContent('kiwi')
    expect(rows[1]).toHaveAttribute('data-variant', 'add')
    expect(rows[1]).toHaveTextContent('fig')
  })

  it('shows one plain line for a non-block action', async () => {
    mockGetRecord.mockResolvedValue(
      record({ action: 'create_page', targetBlockId: null, before: null, after: null })
    )

    renderPage()

    const card = await screen.findByTestId('change-log-record-diff-card')
    expect(card.querySelectorAll('[data-kind="diff-line"]')).toHaveLength(0)
    expect(card).toHaveTextContent('created this page')
  })
})
