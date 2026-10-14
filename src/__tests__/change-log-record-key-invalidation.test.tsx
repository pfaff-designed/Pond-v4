/**
 * KAN-152 fix: the record page's own query keys must sit UNDER `changeLogKey()`
 * (`src/lib/change-log/keys.ts`), the same root every answer (`ChangeLogAnswerActions`)
 * and the revert buttons already invalidate — otherwise an accept/reject/revert
 * from ANY surface leaves a mounted record page reading a stale status for up to
 * 30s (React Query's default `staleTime`).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogRecordPage } from '@/components/organisms/ChangeLogRecordPage'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

jest.mock('@/lib/change-log/revert', () => ({
  ...jest.requireActual('@/lib/change-log/revert'),
  proposeRevert: (...args: unknown[]) => mockProposeRevert(...args),
}))

jest.mock('@/lib/change-log/answer', () => ({
  ...jest.requireActual('@/lib/change-log/answer'),
  acceptRecordFromLog: (...args: unknown[]) => mockAcceptRecordFromLog(...args),
}))

const mockPush = jest.fn()
const mockGetRecord = jest.fn()
const mockGetPage = jest.fn()
const mockGetThreadFirstQuestion = jest.fn()
const mockProposeRevert = jest.fn()
const mockListRevertsOf = jest.fn()
const mockListRevisionsOf = jest.fn()
const mockAcceptRecordFromLog = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'proposed',
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

function renderPage(client: QueryClient, recordId = 'rec-1') {
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
  mockListRevisionsOf.mockResolvedValue([])
})

describe('ChangeLogRecordPage — query keys nest under changeLogKey()', () => {
  it('an accept answered on the record page updates its own status field and buttons', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const proposedRecord = record({ status: 'proposed' })
    const acceptedRecord = record({
      status: 'accepted',
      actor: 'you',
      transitions: [{ status: 'accepted', actor: 'you', at: '2026-09-30T09:40:00.000Z' }],
      statusAt: '2026-09-30T09:40:00.000Z',
    })
    mockGetRecord.mockResolvedValueOnce(proposedRecord).mockResolvedValue(acceptedRecord)
    mockAcceptRecordFromLog.mockResolvedValue({
      refused: false,
      record: acceptedRecord,
      undoRecordId: null,
    })

    renderPage(client)

    const acceptButton = await screen.findByRole('button', { name: 'accept' })
    await act(async () => {
      fireEvent.click(acceptButton)
    })

    // Without the fix, this record's own query sits outside `changeLogKey()`
    // and `ChangeLogAnswerActions`'s invalidation (`changeLogKey()` only)
    // never reaches it — the buttons/status would stay on the `proposed` copy.
    await waitFor(() => expect(screen.getByRole('button', { name: 'open page' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    expect(screen.getByText(/accepted by you/)).toBeInTheDocument()
  })

  it("after a revert raised and accepted elsewhere, the original record's 'reverted by' pill follows the revert's status", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const original = record({ id: 'rec-1', status: 'accepted' })
    let revertStatus: ChangeLogRecord['status'] = 'proposed'
    const revert = () =>
      record({
        id: 'rec-revert',
        action: 'revert',
        status: revertStatus,
        links: { revertOf: 'rec-1' },
      })

    mockGetRecord.mockImplementation((_supabase: unknown, id: string) =>
      Promise.resolve(id === 'rec-1' ? original : revert())
    )
    mockListRevertsOf.mockImplementation((_supabase: unknown, opts: { recordId: string }) =>
      Promise.resolve(opts.recordId === 'rec-1' ? [revert()] : [])
    )
    mockAcceptRecordFromLog.mockImplementation(async () => {
      revertStatus = 'accepted'
      return { refused: false, record: revert(), undoRecordId: null }
    })

    render(
      <QueryClientProvider client={client}>
        <div data-testid="original">
          <ChangeLogRecordPage recordId="rec-1" />
        </div>
        <div data-testid="revert-page">
          <ChangeLogRecordPage recordId="rec-revert" />
        </div>
      </QueryClientProvider>
    )

    await waitFor(() => expect(screen.getByText('proposed')).toBeInTheDocument())

    const acceptButton = await screen.findByRole('button', { name: 'accept' })
    await act(async () => {
      fireEvent.click(acceptButton)
    })

    // Without the fix, the original record's `revertsByRecordId` query sits
    // outside `changeLogKey()` and never refetches when the revert is
    // answered on its OWN page — the pill would keep reading "proposed".
    await waitFor(() => expect(screen.getByText('accepted')).toBeInTheDocument())
    expect(screen.queryByText('proposed')).not.toBeInTheDocument()
  })
})
