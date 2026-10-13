/**
 * KAN-303 — a stale Revert click. `proposeRevert` refuses with a typed
 * `RevertRefusedError` (e.g. tab A already raised a revert of this same
 * change), and `run()`'s catch must show the person line that refusal maps
 * to, never the error's own developer-text message.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageChangesPanel } from '@/components/organisms/PageChangesPanel'
import { RevertRefusedError } from '@/lib/change-log/errors'
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
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

const mockProposeRevert = jest.fn()
jest.mock('@/lib/change-log/revert', () => ({
  ...jest.requireActual('@/lib/change-log/revert'),
  proposeRevert: (...args: unknown[]) => mockProposeRevert(...args),
}))

const EDIT_RECORD: ChangeLogRecord = {
  id: 'edit-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'edit',
  actor: 'pond',
  targetPageId: 'page-1',
  targetBlockId: null,
  before: [{ id: 'a', type: 'text', content: 'one' }],
  after: [{ id: 'a', type: 'text', content: 'ONE' }],
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
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
    blocks: [{ id: 'a', type: 'text', content: 'ONE' }],
    props: {},
    order: 0,
  })
  mockListRecords.mockResolvedValue([EDIT_RECORD])
})

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PageChangesPanel pageId="page-1" />
    </QueryClientProvider>
  )
}

describe('PageChangesPanel — a stale Revert', () => {
  it('shows the person line for a revert already waiting, never developer text', async () => {
    mockProposeRevert.mockRejectedValue(
      new RevertRefusedError('waiting', 'change log: record edit-1 already has a revert waiting on you')
    )

    const user = userEvent.setup()
    renderPanel()

    const revert = await screen.findByRole('button', { name: 'Revert' })
    await user.click(revert)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('a revert of this change is already waiting')
    expect(alert.textContent).not.toMatch(/change log:/)
  })
})
