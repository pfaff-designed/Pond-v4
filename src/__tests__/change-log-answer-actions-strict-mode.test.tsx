/**
 * `ChangeLogAnswerActions`'s revise button under `React.StrictMode` (KAN-152,
 * G9). StrictMode (Next dev) invokes a state updater function twice to
 * surface non-pure updaters — a `requestChanges` dispatch living INSIDE the
 * updater fires twice for one real click; the dispatch must happen outside it.
 */

import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogAnswerActions } from '@/components/molecules/ChangeLogAnswerActions'
import { REVISE_NOTE } from '@/lib/change-log/answer'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/supabase/use-lazy-client', () => ({
  useLazySupabase: () => () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestChanges: (...args: unknown[]) => mockRequestChanges(...args),
}))

const mockRequestChanges = jest.fn()

const OUTDATED_RECORD: ChangeLogRecord = {
  id: 'rec-outdated-strict',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'outdated',
  action: 'edit',
  actor: 'pond',
  targetPageId: 'page-1',
  targetBlockId: null,
  before: null,
  after: null,
  sourceThreadId: null,
  toolCallId: 'tool-outdated-strict',
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-01-01T09:24:00.000Z',
  statusAt: '2026-01-01T09:24:00.000Z',
}

function renderUnderStrictMode() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <ChangeLogAnswerActions record={OUTDATED_RECORD} pondId="pond-1" onError={jest.fn()} />
      </QueryClientProvider>
    </StrictMode>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ChangeLogAnswerActions — revise under StrictMode', () => {
  it('dispatches the request-changes event exactly once for one click', async () => {
    const user = userEvent.setup()
    renderUnderStrictMode()

    await user.click(screen.getByRole('button', { name: 'revise' }))

    expect(mockRequestChanges).toHaveBeenCalledTimes(1)
    expect(mockRequestChanges).toHaveBeenCalledWith({
      toolCallId: 'tool-outdated-strict',
      note: REVISE_NOTE,
      reason: 'outdated',
      targetPageId: 'page-1',
    })
  })
})
