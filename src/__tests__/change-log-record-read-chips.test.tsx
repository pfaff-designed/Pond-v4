/**
 * `ChangeLogRecordPage`'s "read" chips (KAN-331): only a uuid-shaped chip is
 * resolved with `getPage` — a page title or a non-page source string renders
 * as its own stored string via the `pageTitleById.get(chip) ?? chip`
 * fallback, never fired at `getPage` (the 400 this ticket fixes).
 */

import { render, screen } from '@testing-library/react'
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
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
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

const mockPush = jest.fn()
const mockGetUser = jest.fn()
const mockGetRecord = jest.fn()
const mockGetPage = jest.fn()
const mockGetThreadFirstQuestion = jest.fn()
const mockProposeRevert = jest.fn()
const mockListRevisionsOf = jest.fn()
const mockListRevertsOf = jest.fn()

const REAL_PAGE_ID = 'a1b2c3d4-e5f6-4789-a123-0123456789ab'

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
    read: [REAL_PAGE_ID, 'kitchen renovation', 'email · j. hart'],
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
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockGetPage.mockImplementation((_supabase: unknown, id: string) =>
    Promise.resolve(
      id === 'page-1'
        ? {
            id: 'page-1',
            parentId: null,
            type: 'page',
            title: 'target page',
            blocks: [{ id: 'a', type: 'text', content: 'fig' }],
            order: 0,
            props: {},
          }
        : id === REAL_PAGE_ID
          ? {
              id: REAL_PAGE_ID,
              parentId: null,
              type: 'page',
              title: 'a real read page',
              blocks: [],
              order: 0,
              props: {},
            }
          : null
    )
  )
  mockGetThreadFirstQuestion.mockResolvedValue(null)
  mockListRevisionsOf.mockResolvedValue([])
  mockListRevertsOf.mockResolvedValue([])
})

describe('ChangeLogRecordPage — read chips', () => {
  it('only calls getPage for a uuid-shaped chip, and every chip still renders', async () => {
    mockGetRecord.mockResolvedValue(record())

    renderPage()

    expect(await screen.findByText('a real read page')).toBeInTheDocument()
    expect(screen.getByText('kitchen renovation')).toBeInTheDocument()
    expect(screen.getByText('email · j. hart')).toBeInTheDocument()

    const readChipPageCalls = mockGetPage.mock.calls.filter(([, id]) => id !== 'page-1')
    expect(readChipPageCalls).toEqual([[expect.anything(), REAL_PAGE_ID]])
  })
})
