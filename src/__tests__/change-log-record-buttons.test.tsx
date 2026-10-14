/**
 * `ChangeLogRecordPage`'s buttons (KAN-152, s6o3/s6o4): "open page" + "revert"
 * for a settled record, or the shared `ChangeLogAnswerActions` row while the
 * record is still `proposed`/`outdated`. Revert is guarded with a ref so a
 * double click raises one revert (AUDIT G9).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeLogRecordPage } from '@/components/organisms/ChangeLogRecordPage'
import { RAISE_RECORD_CARD_EVENT, type RaiseRecordCardDetail } from '@/lib/terminal-focus'
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
    read: null,
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
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: null,
    type: 'page',
    title: 'kitchen renovation',
    blocks: [{ id: 'a', type: 'text', content: 'fig' }],
    order: 0,
    props: {},
  })
  mockGetThreadFirstQuestion.mockResolvedValue(null)
})

describe('ChangeLogRecordPage — buttons', () => {
  it('shows "open page" and "revert" for a settled, revertable record', async () => {
    mockGetRecord.mockResolvedValue(record())

    renderPage()

    await screen.findByTestId('change-log-record-title')
    expect(screen.getByRole('button', { name: 'open page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'revert' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  })

  it('shows the shared answer row, not revert, for a proposed record', async () => {
    mockGetRecord.mockResolvedValue(record({ status: 'proposed' }))

    renderPage()

    await screen.findByTestId('change-log-record-title')
    expect(screen.getByRole('button', { name: 'accept' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'revert' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'open page' })).not.toBeInTheDocument()
  })

  it('shows the shared answer row, not revert, for an outdated record', async () => {
    mockGetRecord.mockResolvedValue(record({ status: 'outdated' }))

    renderPage()

    await screen.findByTestId('change-log-record-title')
    expect(screen.getByRole('button', { name: 'revise' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'revert' })).not.toBeInTheDocument()
  })

  it('"open page" navigates to the target page', async () => {
    mockGetRecord.mockResolvedValue(record())

    renderPage()

    const openButton = await screen.findByRole('button', { name: 'open page' })
    await waitFor(() => expect(openButton).toBeEnabled())
    fireEvent.click(openButton)

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush.mock.calls[0][0]).toContain('page-1')
  })

  it('two rapid clicks on revert call proposeRevert once (G9)', async () => {
    mockGetRecord.mockResolvedValue(record())
    let settleRevert: (value: ChangeLogRecord) => void = () => {}
    mockProposeRevert.mockReturnValue(
      new Promise((resolve) => {
        settleRevert = resolve
      })
    )

    renderPage()

    const revertButton = await screen.findByRole('button', { name: 'revert' })

    // Two clicks land before the first write settles — a state update
    // guarding on a render would not yet have committed.
    fireEvent.click(revertButton)
    fireEvent.click(revertButton)

    await waitFor(() => expect(mockProposeRevert).toHaveBeenCalled())
    expect(mockProposeRevert).toHaveBeenCalledTimes(1)

    await act(async () => {
      settleRevert(record({ id: 'rec-revert', status: 'proposed', links: { revertOf: 'rec-1' } }))
      await Promise.resolve()
    })
  })

  it('revert raises the new revert record as a card in the composer (s6o4 f4)', async () => {
    mockGetRecord.mockResolvedValue(record())
    mockProposeRevert.mockResolvedValue(record({ id: 'rec-revert', status: 'proposed', links: { revertOf: 'rec-1' } }))
    const raised: RaiseRecordCardDetail[] = []
    const onRaise = (e: Event) => raised.push((e as CustomEvent<RaiseRecordCardDetail>).detail)
    window.addEventListener(RAISE_RECORD_CARD_EVENT, onRaise)

    renderPage()
    const revertButton = await screen.findByRole('button', { name: 'revert' })
    fireEvent.click(revertButton)

    await waitFor(() => expect(raised).toEqual([{ recordId: 'rec-revert' }]))
    window.removeEventListener(RAISE_RECORD_CARD_EVENT, onRaise)
  })

  it('disables revert while a revert is in flight', async () => {
    mockGetRecord.mockResolvedValue(record())
    let settleRevert: (value: ChangeLogRecord) => void = () => {}
    mockProposeRevert.mockReturnValue(
      new Promise((resolve) => {
        settleRevert = resolve
      })
    )

    renderPage()
    const revertButton = await screen.findByRole('button', { name: 'revert' })
    fireEvent.click(revertButton)

    await waitFor(() => expect(revertButton).toBeDisabled())

    await act(async () => {
      settleRevert(record({ id: 'rec-revert', status: 'proposed', links: { revertOf: 'rec-1' } }))
      await Promise.resolve()
    })
  })

  it('shows a person-facing error, not a silent no-op, when the user session is missing', async () => {
    mockGetRecord.mockResolvedValue(record())
    mockGetUser.mockResolvedValue({ data: { user: null } })

    renderPage()
    const revertButton = await screen.findByRole('button', { name: 'revert' })
    fireEvent.click(revertButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('that did not work')
    expect(mockProposeRevert).not.toHaveBeenCalled()
  })

  it('shows a person-facing error, not a silent no-op, when the target page is gone', async () => {
    mockGetRecord.mockResolvedValue(record())
    mockGetPage.mockResolvedValue(null)

    renderPage()
    const revertButton = await screen.findByRole('button', { name: 'revert' })
    fireEvent.click(revertButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('that did not work')
    expect(mockProposeRevert).not.toHaveBeenCalled()
  })

  it('omits revert for a record canRevertRecord refuses', async () => {
    mockGetRecord.mockResolvedValue(record({ action: 'create_page', before: null, after: null }))

    renderPage()

    await screen.findByTestId('change-log-record-title')
    expect(screen.getByRole('button', { name: 'open page' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'revert' })).not.toBeInTheDocument()
  })
})
