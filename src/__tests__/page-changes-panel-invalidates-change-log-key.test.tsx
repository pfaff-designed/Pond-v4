/**
 * KAN-316 — the rail's colour write invalidates the root `changeLogKey()`,
 * not this panel's own key, so an already-open panel only picks the change
 * up because `pageChangesKey()` nests under it. The panel itself answers
 * nothing now (KAN-175, gutting the revert/accept/reject controls) — this
 * pins the nesting, not a write path through the panel.
 */

import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageChangesPanel } from '@/components/organisms/PageChangesPanel'
import { changeLogKey } from '@/lib/change-log/keys'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
// render visibly distinct labels without depending on `summarizeBlockEdit`.
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

describe('PageChangesPanel — pageChangesKey nests under changeLogKey()', () => {
  it('refetches when something else (the rail) invalidates the root changeLogKey()', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    mockListRecords.mockResolvedValue([record('edit-1', 'create_page')])
    render(
      <QueryClientProvider client={queryClient}>
        <PageChangesPanel pageId="page-1" />
      </QueryClientProvider>
    )
    await screen.findByText('created this page')
    expect(mockListRecords).toHaveBeenCalledTimes(1)

    mockListRecords.mockResolvedValue([record('edit-2', 'define_schema')])
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: changeLogKey() })
    })

    expect(await screen.findByText('set up the fields')).toBeInTheDocument()
    expect(mockListRecords).toHaveBeenCalledTimes(2)
  })
})
