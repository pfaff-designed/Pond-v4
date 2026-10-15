/**
 * KAN-318 path test — PATH_STEPS 2–3 end to end, against the real hosting
 * surface (`DocumentPanel`, swapping `ChangeLogPage` for `ChangeLogRecordPage`
 * on a navigable URL — the same stateful `next/navigation` fake
 * `change-log-path.test.tsx` built): the "all" table's row reads the record
 * page's own title (`recordTitle`), never `describeChange`'s generic
 * summary, and clicking through to an outdated-by-accept record renders its
 * last transition's actor as "by you", never "by pond" — this proves the
 * record page's own render path (`statusField`) reads `transitions.at(-1)
 * ?.actor` correctly end to end; the fixture's transition is hand-built with
 * `actor: 'you'` already on it, so it does not exercise `markOutdated`'s own
 * default-actor write (that regression is covered separately, by the unit
 * test in `change-log-store.test.ts`). This is the automated half of the
 * ticket's "Done when" (criteria 1 and 2); criterion 3 is walked live.
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { describeChange } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

// A stateful fake of the two hooks, lifted verbatim from `change-log-path.test.tsx`
// — `push` actually advances the URL and notifies every mounted
// `useSearchParams()`, so clicking a table row and `DocumentPanel`'s own read
// see the SAME url, the same way the real router's address change does.
jest.mock('next/navigation', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react')
  let current = new URLSearchParams({ nodeId: '__change_log__' })
  const listeners = new Set<(params: URLSearchParams) => void>()
  const push = jest.fn((href: string) => {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
    current = new URLSearchParams(qs)
    listeners.forEach((listener) => listener(current))
  })
  return {
    __reset: () => {
      current = new URLSearchParams({ nodeId: '__change_log__' })
    },
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => {
      const [params, setParams] = useState(current)
      useEffect(() => {
        listeners.add(setParams)
        return () => {
          listeners.delete(setParams)
        }
      }, [])
      return params
    },
  }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/tree', () => ({ fetchPages: jest.fn().mockResolvedValue([]) }))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: jest.fn().mockResolvedValue([{ id: 'page-1', title: 'kitchen renovation' }]),
  getPage: (...args: unknown[]) => mockGetPage(...args),
}))

jest.mock('@/lib/conversation/client', () => ({
  ...jest.requireActual('@/lib/conversation/client'),
  getThreadFirstQuestion: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(0),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  getRecord: (...args: unknown[]) => mockGetRecord(...args),
  listRevertsOf: jest.fn().mockResolvedValue([]),
  listRevisionsOf: jest.fn().mockResolvedValue([]),
}))

const mockListRecords = jest.fn()
const mockGetRecord = jest.fn()
const mockGetPage = jest.fn()

function record(over: Partial<ChangeLogRecord> & Pick<ChangeLogRecord, 'id'>): ChangeLogRecord {
  return {
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

/** PATH_STEPS 2's own example — the text block edit "alpha one" → "apple
 *  one", already accepted. Its row must read this, never `describeChange`'s
 *  generic "wrote 1 paragraph". */
const EDIT_RECORD = record({
  id: 'r-edit',
  targetBlockId: 'b1',
  before: [{ id: 'b1', type: 'text', content: 'alpha one' }],
  after: [{ id: 'b1', type: 'text', content: 'apple one' }],
  transitions: [{ status: 'accepted', at: '2026-09-30T09:31:00.000Z', actor: 'you' }],
})

/** PATH_STEPS 3's repro — a second proposal on the same page the person's
 *  own accept swept to `outdated`. Its transitions are hand-built, not
 *  produced by a real `markOutdated` call: the first is Pond's own
 *  proposal, the second stands in for the sweep's write with `actor: 'you'`
 *  already baked in, so this fixture only drives the render path. */
const OUTDATED_RECORD = record({
  id: 'r-outdated',
  status: 'outdated',
  statusAt: '2026-09-30T08:05:00.000Z',
  createdAt: '2026-09-30T08:00:00.000Z',
  targetBlockId: 'b2',
  before: [{ id: 'b2', type: 'text', content: 'bravo two' }],
  after: [{ id: 'b2', type: 'text', content: 'banana two' }],
  transitions: [
    { status: 'proposed', at: '2026-09-30T08:00:00.000Z', actor: 'pond' },
    { status: 'outdated', at: '2026-09-30T08:05:00.000Z', actor: 'you' },
  ],
})

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <div data-testid="document-panel">
          <DocumentPanel />
        </div>
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(jest.requireMock('next/navigation') as { __reset: () => void }).__reset()
  mockListRecords.mockResolvedValue([EDIT_RECORD, OUTDATED_RECORD])
  mockGetRecord.mockImplementation(async (_sb: unknown, id: string) =>
    [EDIT_RECORD, OUTDATED_RECORD].find((r) => r.id === id) ?? null
  )
  mockGetPage.mockResolvedValue({ id: 'page-1', type: 'page', title: 'kitchen renovation', blocks: [] })
})

describe('KAN-318 path test — the "all" table reads the record page\'s own title', () => {
  it('shows "alpha one → apple one", not describeChange\'s summary, and opens the matching record', async () => {
    const user = userEvent.setup()
    renderPanel()
    const panel = screen.getByTestId('document-panel')

    const row = await within(panel).findByText('alpha one → apple one')
    expect(row).not.toHaveTextContent(describeChange(EDIT_RECORD, null))
    expect(within(panel).queryByText(/wrote 1 paragraph/)).not.toBeInTheDocument()

    await user.click(row)

    expect(await within(panel).findByTestId('change-log-record-title')).toHaveTextContent(
      'alpha one → apple one'
    )
  })
})

describe('KAN-318 path test — the record page renders the sweep actor', () => {
  it('renders a fixture\'s outdated transition as "by you", never "by pond"', async () => {
    const user = userEvent.setup()
    renderPanel()
    const panel = screen.getByTestId('document-panel')

    const row = await within(panel).findByText('bravo two → banana two')
    await user.click(row)

    const title = await within(panel).findByTestId('change-log-record-title')
    expect(title).toHaveTextContent('bravo two → banana two')
    expect(within(panel).getByText(/outdated by you/)).toBeInTheDocument()
    expect(within(panel).queryByText(/outdated by pond/)).not.toBeInTheDocument()
  })
})

describe('KAN-318 path test — the "proposed" view reads the same way', () => {
  it('shows the outdated record\'s real before → after content, never a generic summary', async () => {
    const user = userEvent.setup()
    renderPanel()
    const panel = screen.getByTestId('document-panel')

    await within(panel).findByText('bravo two → banana two')
    await user.click(within(panel).getByRole('tab', { name: 'proposed' }))

    expect(await within(panel).findByText('bravo two')).toBeInTheDocument()
    expect(within(panel).getByText('banana two')).toBeInTheDocument()
    expect(within(panel).queryByText(/wrote 1 paragraph/)).not.toBeInTheDocument()
  })
})
