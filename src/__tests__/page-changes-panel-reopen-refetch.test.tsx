/**
 * KAN-303 item 4 — the panel's `useQuery` for `pageChangesKey` relied on the
 * app's global 30s `staleTime` (`providers.tsx`), so closing and reopening the
 * panel inside that window (⌥⌘H twice) remounted the query without refetching
 * and kept showing the rows a second tab last saw. `refetchOnMount: 'always'`
 * makes a remount always re-read, independent of staleness.
 */

import { render, screen, cleanup } from '@testing-library/react'
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
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

// Different `action`s rather than different `before`/`after` so the two sets
// render visibly distinct labels ("created this page" vs. "set up the fields")
// without depending on `summarizeBlockEdit`'s own behaviour.
function record(id: string, action: ChangeLogRecord['action']): ChangeLogRecord {
  return {
    id,
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action,
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: [],
    after: [],
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-10-01T09:31:00.000Z',
    statusAt: '2026-10-01T09:31:00.000Z',
  }
}

const FIRST_SET = [record('edit-1', 'create_page')]
const SECOND_SET = [record('edit-2', 'define_schema')]

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
})

describe('PageChangesPanel — reopening after a close', () => {
  it('refetches on remount within the app-wide 30s staleTime, no invalidateQueries needed', async () => {
    // Shares the app's own default (`providers.tsx`) — a shorter staleTime in
    // the test would hide the bug the ticket describes.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    })

    mockListRecords.mockResolvedValue(FIRST_SET)
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <PageChangesPanel pageId="page-1" />
      </QueryClientProvider>
    )
    await screen.findByText('created this page')
    expect(mockListRecords).toHaveBeenCalledTimes(1)

    // The panel closes: `usePageChangesPanel` unmounts it, it does not merely hide.
    unmount()
    cleanup()

    mockListRecords.mockResolvedValue(SECOND_SET)

    render(
      <QueryClientProvider client={queryClient}>
        <PageChangesPanel pageId="page-1" />
      </QueryClientProvider>
    )

    expect(await screen.findByText('set up the fields')).toBeInTheDocument()
    expect(mockListRecords).toHaveBeenCalledTimes(2)
  })
})
