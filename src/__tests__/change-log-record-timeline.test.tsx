/**
 * `ChangeLogRecordPage`'s "this change" column (KAN-152, s6o3): the full
 * revision lineage — root first — found by walking `links.revisedFrom`
 * backward to the root, then `listRevisionsOf` forward, rendered through
 * `buildChangeTimeline` with the viewed record's own rows highlighted.
 */

import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogRecordPage } from '@/components/organisms/ChangeLogRecordPage'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  getRecord: (...args: unknown[]) => mockGetRecord(...args),
  listRevisionsOf: (...args: unknown[]) => mockListRevisionsOf(...args),
  listRevertsOf: (...args: unknown[]) => mockListRevertsOf(...args),
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
const mockListRevisionsOf = jest.fn()
const mockListRevertsOf = jest.fn()
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
    before: [{ id: 'a', type: 'text', content: 'kiwi' }],
    after: [{ id: 'a', type: 'text', content: 'fig' }],
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

function renderPage(recordId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogRecordPage recordId={recordId} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: null,
    type: 'page',
    title: 'kitchen renovation',
    blocks: [{ id: 'a', type: 'text', content: 'fig' }],
    order: 0,
    props: {},
  })
  mockGetThreadFirstQuestion.mockResolvedValue(null)
  mockListRevertsOf.mockResolvedValue([])
})

describe('ChangeLogRecordPage — this change column', () => {
  it('renders the 4-event proposed → changes requested → revised → accepted chain, highlighting the viewed record', async () => {
    const original = record({
      id: 'rec-1',
      status: 'changes_requested',
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:12:00.000Z', actor: 'pond' },
        { status: 'changes_requested', at: '2026-09-30T09:16:00.000Z', actor: 'you' },
      ],
    })
    const revision = record({
      id: 'rec-2',
      status: 'accepted',
      links: { revisedFrom: 'rec-1' },
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:20:00.000Z', actor: 'pond' },
        { status: 'accepted', at: '2026-09-30T09:31:00.000Z', actor: 'you' },
      ],
    })
    const byId: Record<string, ChangeLogRecord> = { 'rec-1': original, 'rec-2': revision }
    mockGetRecord.mockImplementation((_supabase: unknown, id: string) =>
      Promise.resolve(byId[id] ?? null)
    )
    mockListRevisionsOf.mockResolvedValue([revision])

    renderPage('rec-2')

    await screen.findByTestId('change-log-record-title')
    const rows = await screen.findAllByTestId('change-log-record-timeline-row')

    expect(rows).toHaveLength(4)
    expect(within(rows[0]).getByText('proposed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('changes requested')).toBeInTheDocument()
    expect(within(rows[2]).getByText('revised')).toBeInTheDocument()
    expect(within(rows[3]).getByText('accepted')).toBeInTheDocument()

    // Board s6o3: exactly ONE row is highlighted — the viewed record's own
    // LATEST transition ("accepted"), not every transition the viewed
    // record ever went through (its earlier "revised" row stays plain).
    expect(rows[0]).not.toHaveClass('bg-mn-hover-fill')
    expect(rows[1]).not.toHaveClass('bg-mn-hover-fill')
    expect(rows[2]).not.toHaveClass('bg-mn-hover-fill')
    expect(rows[3]).toHaveClass('bg-mn-hover-fill')

    rows.forEach((row) => expect(row).toHaveClass('rounded-[8px]'))

    expect(mockListRevisionsOf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recordId: 'rec-1' })
    )
  })
})
