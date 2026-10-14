/**
 * KAN-316 — `refresh()`'s `finally` after every `run()` (revert/accept/reject)
 * invalidated only `pageChangesKey`, never the root `changeLogKey()`, so an
 * answer made from this panel never reached the main change-log page/count or
 * the proposed view within the app's 30s staleTime.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
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
const mockAdvanceStatus = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  advanceStatus: (...args: unknown[]) => mockAdvanceStatus(...args),
}))

// A `revert`/`proposed` record, like `page-changes-panel-reject-stale.test.tsx`
// — the only shape `PageChangesSection` renders a reject control for.
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
  mockAdvanceStatus.mockResolvedValue(undefined)
})

/** A probe standing in for every other change-log view hung off the root key. */
function ChangeLogRootProbe() {
  const { data } = useQuery({
    queryKey: changeLogKey(),
    queryFn: () => 'root-data',
  })
  return <div data-testid="root-probe">{data ?? 'none'}</div>
}

describe('PageChangesPanel — refresh() reaches the root change-log key', () => {
  it('invalidates changeLogKey() when a reject from the panel settles', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ChangeLogRootProbe />
        <PageChangesPanel pageId="page-1" />
      </QueryClientProvider>
    )

    await screen.findByText('root-data')

    const reject = await screen.findByRole('button', { name: 'reject' })
    await user.click(reject)

    await screen.findByText('revert of an earlier change')

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() })
  })
})
