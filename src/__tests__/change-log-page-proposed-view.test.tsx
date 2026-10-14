/**
 * KAN-96 — the change log page's `proposed` view (s6o2): a real, switchable
 * pill that reads every still-waiting record (`WAITING_STATUSES`). The card
 * body is a placeholder (just `record.id`) at this stage — header fields,
 * diff rows and the answer buttons land in later items.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { REVISE_NOTE } from '@/lib/change-log/answer'
import { changeLogKey } from '@/lib/change-log/keys'
import { pagesKey } from '@/lib/pages/keys'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
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

jest.mock('@/lib/change-log/answer', () => ({
  ...jest.requireActual('@/lib/change-log/answer'),
  acceptRecordFromLog: (...args: unknown[]) => mockAcceptRecordFromLog(...args),
  rejectRecordFromLog: (...args: unknown[]) => mockRejectRecordFromLog(...args),
}))

jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestChanges: (...args: unknown[]) => mockRequestChanges(...args),
}))

const mockListRecords = jest.fn()
const mockAcceptRecordFromLog = jest.fn()
const mockRejectRecordFromLog = jest.fn()
const mockRequestChanges = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: 'tool-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-01-01T09:24:00.000Z',
    statusAt: '2026-01-01T09:24:00.000Z',
    ...over,
  }
}

/** The infinite "all" query has no `status` filter; the proposed view's does. */
const isProposedQuery = (opts: { status?: unknown }) => Array.isArray(opts.status)

/** A full `#RRGGBB` or `#RRGGBBAA` colour literal, same scope as the token-law sweep. */
const HEX_COLOUR = /#[0-9a-fA-F]{6}\b([0-9a-fA-F]{2})?/

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
}

/** Same render, but handing back the `QueryClient` so a test can spy on it. */
function renderPageWithClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ChangeLogPage />
    </QueryClientProvider>
  )
  return client
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ChangeLogPage — the proposed view', () => {
  it('says so plainly when nothing is waiting', async () => {
    mockListRecords.mockImplementation(async (_supabase, opts) => (isProposedQuery(opts) ? [] : []))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    expect(await screen.findByTestId('change-log-proposed-empty')).toHaveTextContent(
      'nothing waiting'
    )
  })

  it('renders the frame 2 filter chips and a card once a record is waiting', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-waiting' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    expect(screen.getByText('status is proposed')).toBeInTheDocument()
    expect(screen.getByText('newest first')).toBeInTheDocument()
    expect(await screen.findByTestId('change-log-proposed-card-rec-waiting')).toBeInTheDocument()
    expect(screen.queryByTestId('change-log-proposed-empty')).not.toBeInTheDocument()
  })

  it('queries both proposed and outdated statuses — WAITING_STATUSES, not a literal proposed-only filter', async () => {
    mockListRecords.mockResolvedValue([])
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    expect(mockListRecords).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: ['proposed', 'outdated'] })
    )
  })

  it("a changed block's card shows a remove row of the before text, then an add row of the after", async () => {
    const CHANGED = record({
      id: 'rec-changed',
      before: [{ id: 'block-1', type: 'text', content: 'kiwi' }],
      after: [{ id: 'block-1', type: 'text', content: 'fig' }],
    })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [CHANGED] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    const card = await screen.findByTestId('change-log-proposed-card-rec-changed')
    const rows = card.querySelectorAll<HTMLElement>('[data-kind="diff-line"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-variant', 'remove')
    expect(rows[0]).toHaveTextContent('kiwi')
    expect(rows[1]).toHaveAttribute('data-variant', 'add')
    expect(rows[1]).toHaveTextContent('fig')
  })

  it('a block present only in after renders as an add row with no remove', async () => {
    const CREATED = record({
      id: 'rec-created',
      before: [],
      after: [{ id: 'block-1', type: 'text', content: 'fig' }],
    })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [CREATED] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    const card = await screen.findByTestId('change-log-proposed-card-rec-created')
    const rows = card.querySelectorAll<HTMLElement>('[data-kind="diff-line"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-variant', 'add')
    expect(rows[0]).toHaveTextContent('fig')
  })

  it('writes once even when accept is clicked twice before the first settles (G9)', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-accept' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    let settleAccept: () => void = () => {}
    mockAcceptRecordFromLog.mockImplementation(
      () =>
        new Promise((resolve) => {
          settleAccept = () => resolve({ refused: false, record: PROPOSED_RECORD })
        })
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    const acceptButton = await screen.findByRole('button', { name: 'accept' })

    // Two clicks land in the same tick, before the first write settles — a
    // state update guarding on a render would not yet have committed.
    fireEvent.click(acceptButton)
    fireEvent.click(acceptButton)

    await waitFor(() => expect(mockAcceptRecordFromLog).toHaveBeenCalled())
    expect(mockAcceptRecordFromLog).toHaveBeenCalledTimes(1)

    settleAccept()
    await waitFor(() => expect(mockListRecords).toHaveBeenCalled())
  })

  it('an outdated record shows the reason line and revise/reject, no accept', async () => {
    const OUTDATED_RECORD = record({ id: 'rec-outdated', status: 'outdated' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [OUTDATED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    const card = await screen.findByTestId('change-log-proposed-card-rec-outdated')
    expect(card).toHaveTextContent('this proposal is out of date — ask Pond to revise it')
    expect(screen.getByTestId('change-log-proposed-reason-rec-outdated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'revise' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'reject' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  })

  it('clicking revise on an outdated record dispatches the request-changes event with the canned note and reason outdated', async () => {
    const OUTDATED_RECORD = record({
      id: 'rec-outdated-revise',
      status: 'outdated',
      toolCallId: 'tool-outdated',
    })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [OUTDATED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    await screen.findByTestId('change-log-proposed-card-rec-outdated-revise')

    await user.click(screen.getByRole('button', { name: 'revise' }))

    expect(mockRequestChanges).toHaveBeenCalledWith({
      toolCallId: 'tool-outdated',
      note: REVISE_NOTE,
      reason: 'outdated',
      targetPageId: 'page-1',
    })
  })

  it('leaves the view once rejected', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-reject' })
    let rejected = false
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? (rejected ? [] : [PROPOSED_RECORD]) : []
    )
    mockRejectRecordFromLog.mockImplementation(async () => {
      rejected = true
      return { ...PROPOSED_RECORD, status: 'rejected' as const }
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    expect(await screen.findByTestId('change-log-proposed-card-rec-reject')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'reject' }))

    expect(mockRejectRecordFromLog).toHaveBeenCalledWith(expect.anything(), PROPOSED_RECORD)
    await waitFor(() =>
      expect(screen.queryByTestId('change-log-proposed-card-rec-reject')).not.toBeInTheDocument()
    )
  })

  it('a typed note dispatches the request-changes event with the note and toolCallId', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-request', toolCallId: 'tool-request' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    await screen.findByTestId('change-log-proposed-card-rec-request')

    await user.click(screen.getByRole('button', { name: 'request changes' }))
    await user.type(screen.getByLabelText('note to pond'), 'fix the date')
    await user.click(screen.getByRole('button', { name: 'send' }))

    expect(mockRequestChanges).toHaveBeenCalledWith({
      toolCallId: 'tool-request',
      note: 'fix the date',
      reason: 'note',
      targetPageId: 'page-1',
    })
  })

  it('an open record whose action has no accept adapter shows request changes and reject, no accept (KAN-313 split)', async () => {
    const UNSUPPORTED_RECORD = record({ id: 'rec-unsupported', action: 'create_page' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [UNSUPPORTED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))

    const card = await screen.findByTestId('change-log-proposed-card-rec-unsupported')
    expect(within(card).queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'revise' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'request changes' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'reject' })).toBeEnabled()
  })

  it('dispatches the request-changes event once even when revise is double-clicked as two real, separate clicks (G9)', async () => {
    const OUTDATED_RECORD = record({
      id: 'rec-outdated-double',
      status: 'outdated',
      toolCallId: 'tool-outdated-double',
    })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [OUTDATED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    const reviseButton = await screen.findByRole('button', { name: 'revise' })

    // Two awaited clicks, each its own task with a React re-render in
    // between — the race a microtask-released guard misses, since the
    // microtask queue drains well before the second click's task starts.
    // The second click lands on a button `disabled` by the first.
    await user.click(reviseButton)
    await user.click(reviseButton)

    expect(mockRequestChanges).toHaveBeenCalledTimes(1)
    expect(mockRequestChanges).toHaveBeenCalledWith({
      toolCallId: 'tool-outdated-double',
      note: REVISE_NOTE,
      reason: 'outdated',
      targetPageId: 'page-1',
    })
  })

  it("dispatches the request-changes event once even when the note box's send is clicked twice before the guard clears (G9)", async () => {
    const PROPOSED_RECORD = record({ id: 'rec-note-double', toolCallId: 'tool-note-double' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    await screen.findByTestId('change-log-proposed-card-rec-note-double')
    await user.click(screen.getByRole('button', { name: 'request changes' }))
    await user.type(screen.getByLabelText('note to pond'), 'shorten this')
    const sendButton = screen.getByRole('button', { name: 'send' })

    fireEvent.click(sendButton)
    fireEvent.click(sendButton)

    expect(mockRequestChanges).toHaveBeenCalledTimes(1)
    expect(mockRequestChanges).toHaveBeenCalledWith({
      toolCallId: 'tool-note-double',
      note: 'shorten this',
      reason: 'note',
      targetPageId: 'page-1',
    })
  })

  it('accepting invalidates the whole change-log root and the pages key, not just this view’s own proposed list', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-invalidate', targetPageId: null })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    mockAcceptRecordFromLog.mockResolvedValue({
      refused: false,
      record: { ...PROPOSED_RECORD, status: 'accepted' as const },
      undoRecordId: null,
    })
    const user = userEvent.setup()
    const client = renderPageWithClient()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    await user.click(await screen.findByRole('button', { name: 'accept' }))

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pagesKey('pond-1') })
  })

  it('rejecting invalidates the whole change-log root and the pages key, not just this view’s own proposed list', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-invalidate-reject', targetPageId: null })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    mockRejectRecordFromLog.mockResolvedValue({ ...PROPOSED_RECORD, status: 'rejected' as const })
    const user = userEvent.setup()
    const client = renderPageWithClient()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    await user.click(await screen.findByRole('button', { name: 'reject' }))

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pagesKey('pond-1') })
  })

  // Path test (last): walks PATH_STEPS 2-8 against the real hosting surface —
  // open the proposed view, accept one card, reject another, request changes
  // on a third, confirm an outdated card offers only revise/reject, then
  // empty once nothing is left waiting.
  it('walks PATH_STEPS 2-8: accept, reject, request changes, outdated, then nothing waiting', async () => {
    const user = userEvent.setup()
    const ACCEPT_RECORD = record({ id: 'rec-accept', toolCallId: 'tool-accept' })
    const REJECT_RECORD = record({ id: 'rec-reject', toolCallId: 'tool-reject' })
    const REQUEST_RECORD = record({ id: 'rec-request', toolCallId: 'tool-request' })
    const OUTDATED_RECORD = record({
      id: 'rec-outdated',
      status: 'outdated',
      toolCallId: 'tool-outdated',
    })
    let waiting: ChangeLogRecord[] = [ACCEPT_RECORD, REJECT_RECORD, REQUEST_RECORD, OUTDATED_RECORD]
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? waiting : []
    )
    mockAcceptRecordFromLog.mockImplementation(
      async (_supabase, opts: { record: ChangeLogRecord }) => {
        waiting = waiting.filter((r) => r.id !== opts.record.id)
        return { refused: false, record: { ...opts.record, status: 'accepted' as const } }
      }
    )
    mockRejectRecordFromLog.mockImplementation(async (_supabase, rejected: ChangeLogRecord) => {
      waiting = waiting.filter((r) => r.id !== rejected.id)
      return { ...rejected, status: 'rejected' as const }
    })

    renderPage()

    // Step 3: open the proposed view — the chips, and a card for every
    // record still waiting.
    await user.click(screen.getByRole('button', { name: 'proposed' }))
    expect(screen.getByText('status is proposed')).toBeInTheDocument()
    expect(screen.getByText('newest first')).toBeInTheDocument()
    await screen.findByTestId('change-log-proposed-card-rec-accept')
    await screen.findByTestId('change-log-proposed-card-rec-reject')
    await screen.findByTestId('change-log-proposed-card-rec-request')
    await screen.findByTestId('change-log-proposed-card-rec-outdated')

    // Step 4: accept — the card leaves the view.
    await user.click(
      within(screen.getByTestId('change-log-proposed-card-rec-accept')).getByRole('button', {
        name: 'accept',
      })
    )
    await waitFor(() =>
      expect(screen.queryByTestId('change-log-proposed-card-rec-accept')).not.toBeInTheDocument()
    )

    // Step 5: a second proposal — reject it. It leaves; the others don't.
    await user.click(
      within(screen.getByTestId('change-log-proposed-card-rec-reject')).getByRole('button', {
        name: 'reject',
      })
    )
    await waitFor(() =>
      expect(screen.queryByTestId('change-log-proposed-card-rec-reject')).not.toBeInTheDocument()
    )
    expect(screen.getByTestId('change-log-proposed-card-rec-request')).toBeInTheDocument()
    expect(screen.getByTestId('change-log-proposed-card-rec-outdated')).toBeInTheDocument()

    // Step 6: a third — request changes. The note reaches the proposer; the
    // record settles outside this view (fire-and-forget to AITerminal), so
    // it only drops out of the list on the view's next switch-back refetch.
    await user.click(
      within(screen.getByTestId('change-log-proposed-card-rec-request')).getByRole('button', {
        name: 'request changes',
      })
    )
    await user.type(screen.getByLabelText('note to pond'), 'shorten this')
    await user.click(screen.getByRole('button', { name: 'send' }))
    expect(mockRequestChanges).toHaveBeenCalledWith({
      toolCallId: 'tool-request',
      note: 'shorten this',
      reason: 'note',
      targetPageId: 'page-1',
    })
    waiting = waiting.filter((r) => r.id !== 'rec-request')
    await user.click(screen.getByRole('button', { name: 'all' }))
    await user.click(screen.getByRole('button', { name: 'proposed' }))
    await waitFor(() =>
      expect(screen.queryByTestId('change-log-proposed-card-rec-request')).not.toBeInTheDocument()
    )

    // Step 7: a hand-edited target shows outdated — its reason line, revise
    // and reject, no accept.
    const outdatedCard = screen.getByTestId('change-log-proposed-card-rec-outdated')
    expect(within(outdatedCard).queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    expect(within(outdatedCard).getByRole('button', { name: 'revise' })).toBeEnabled()
    expect(within(outdatedCard).getByRole('button', { name: 'reject' })).toBeEnabled()
    expect(screen.getByTestId('change-log-proposed-reason-rec-outdated')).toHaveTextContent(
      'this proposal is out of date — ask Pond to revise it'
    )

    // Step 8: reject the last card — nothing proposed shows "nothing waiting".
    await user.click(within(outdatedCard).getByRole('button', { name: 'reject' }))
    await waitFor(() =>
      expect(screen.getByTestId('change-log-proposed-empty')).toHaveTextContent('nothing waiting')
    )
  })

  // PATH_STEPS 9 (dark mode): one assertion on the card's own tokens, matching
  // the lighter convention `change-log-page-dark-theme.test.tsx` already uses,
  // rather than re-walking the whole path a second time under `.dark`.
  it('under .dark, a proposed card draws through mn-* role tokens with no literal hex (PATH_STEPS 9)', async () => {
    const PROPOSED_RECORD = record({ id: 'rec-dark' })
    mockListRecords.mockImplementation(async (_supabase, opts) =>
      isProposedQuery(opts) ? [PROPOSED_RECORD] : []
    )
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <div className="dark">
        <QueryClientProvider client={client}>
          <ChangeLogPage />
        </QueryClientProvider>
      </div>
    )

    await user.click(screen.getByRole('button', { name: 'proposed' }))
    const card = await screen.findByTestId('change-log-proposed-card-rec-dark')

    expect(card).toHaveClass('bg-mn-card')
    expect(HEX_COLOUR.test(card.outerHTML)).toBe(false)
  })
})
