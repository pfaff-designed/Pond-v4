/**
 * KAN-303 item 3 (SPEC.md item 4) — a bounded (~8s) Postgres lock-wait reaches
 * `run()`'s catch as a `PostgrestError`-shaped object (SQLSTATE `57014`,
 * `query_canceled`), not an `Error` instance, so `err instanceof Error` missed
 * it and the panel fell through to "that did not work". It must map to a
 * specific, bounded-wait line instead.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageChangesPanel } from '@/components/organisms/PageChangesPanel'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}))

const mockGetPage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

const mockListRecords = jest.fn()
const mockAdvanceStatus = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  advanceStatus: (...args: unknown[]) => mockAdvanceStatus(...args),
}))

const REVERT_RECORD: ChangeLogRecord = {
  id: 'revert-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'proposed',
  action: 'revert',
  actor: 'you',
  targetPageId: 'page-1',
  targetBlockId: null,
  before: [],
  after: [],
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: { revertOf: 'edit-1' },
  transitions: [],
  createdAt: '2026-10-01T09:31:00.000Z',
  statusAt: '2026-10-01T09:31:00.000Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: null,
    type: 'page',
    title: 'Page 1',
    blocks: [],
    props: {},
    order: 0,
  })
  mockListRecords.mockResolvedValue([REVERT_RECORD])
})

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PageChangesPanel pageId="page-1" />
    </QueryClientProvider>
  )
}

describe('PageChangesPanel — a lock-wait timeout', () => {
  it('shows "this page is busy — try again in a moment", not "that did not work"', async () => {
    mockAdvanceStatus.mockRejectedValue({
      code: '57014',
      message: 'canceling statement due to statement timeout',
    })

    const user = userEvent.setup()
    renderPanel()

    const reject = await screen.findByRole('button', { name: 'reject' })
    await user.click(reject)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('this page is busy — try again in a moment')
    expect(alert.textContent).not.toMatch(/that did not work/)
  })
})
