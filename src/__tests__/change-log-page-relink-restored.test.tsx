/**
 * KAN-448 — restoring a deleted page's change-log record relinks its
 * subtree's page-link blocks. `change-log-page-deleted-view.test.tsx` covers
 * the rest of the restore flow (`restorePage`, cache invalidation, parent
 * fallback copy); this file only asserts the `restorePageRelinked` wiring
 * (KAN-451: restore-then-relink's one home, shared with `TrashPage.tsx`).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { restorePageRelinked } from '@/lib/pages/child-links'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/name', () => ({
  usePondName: () => 'the garden',
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

jest.mock('@/lib/change-log/trash', () => ({
  existingPageIds: (...args: unknown[]) => mockExistingPageIds(...args),
}))

jest.mock('@/lib/pages/child-links', () => ({
  restorePageRelinked: jest.fn().mockResolvedValue(undefined),
}))

const mockListRecords = jest.fn()
const mockExistingPageIds = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'delete',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-01-01T18:40:00.000Z',
    statusAt: '2026-01-01T18:40:00.000Z',
    ...over,
  }
}

const DELETE_RECORD = record({
  id: 'del-1',
  targetPageId: 'page-1',
  before: {
    title: 'old quotes',
    parentId: 'parent-1',
    order: 0,
    pageIds: ['page-1'],
    blockCount: 4,
    nestedPageCount: 1,
    parentPath: ['creativity', 'kitchen renovation'],
  },
})

const isDeletedQuery = (opts: { action?: unknown }) => Array.isArray(opts.action)

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
  mockExistingPageIds.mockResolvedValue(new Set(['page-1']))
})

describe('ChangeLogPage — restore relinks the subtree (KAN-448)', () => {
  it("clicking restore on a deleted card relinks the record's target page id", async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isDeletedQuery(opts) ? [DELETE_RECORD] : []
    )

    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'deleted' }))

    const restoreButton = await screen.findByRole('button', { name: 'restore' })
    await user.click(restoreButton)

    expect(restorePageRelinked).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      pondId: 'pond-1',
      recordId: 'del-1',
      rootPageId: 'page-1',
    })
  })
})
