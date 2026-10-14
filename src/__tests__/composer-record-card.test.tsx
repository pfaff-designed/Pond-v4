/**
 * KAN-152 — the composer's own revert card (board `Pond 06.15 Change log`
 * s6o4 f4), raised by `ChangeLogRecordPage`'s revert button through
 * `RAISE_RECORD_CARD_EVENT` and rendered inside the mounted `AITerminal`:
 * head "proposed edit — {page}" · "revert of HH:MM" (the ORIGINAL record's
 * time), the before→after diff, accept/reject. Accept routes through the
 * shared `ChangeLogAnswerActions` to `revert.ts`'s `acceptRevert` — mocked
 * here to assert the call, not to re-run its own transaction logic (covered
 * by `revert.test.ts`).
 *
 * Minimal harness, same shape as `open-change-log-composer.test.tsx`'s own
 * (no live thread needed): `AITerminal` mounted alone, no `PondContext`
 * provider (`pondId` resolves `null`, which `ChangeLogAnswerActions` already
 * accepts), the raise dispatched directly as `ChangeLogRecordPage`'s own
 * `handleRevert` does.
 */

import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatClockTime } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn().mockResolvedValue({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  }),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  getRecord: (...args: unknown[]) => mockGetRecord(...args),
}))

jest.mock('@/lib/change-log/revert', () => ({
  ...jest.requireActual('@/lib/change-log/revert'),
  acceptRevert: (...args: unknown[]) => mockAcceptRevert(...args),
}))

const mockGetPage = jest.fn()
const mockGetRecord = jest.fn()
const mockAcceptRevert = jest.fn()

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { raiseRecordCard } from '@/lib/terminal-focus'

const ORIGINAL_CREATED_AT = '2026-09-30T09:20:00.000Z'

function revertRecord(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-revert',
    userId: 'user-1',
    pondId: null,
    status: 'proposed',
    action: 'revert',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: 'a',
    before: [{ id: 'a', type: 'text', content: 'fig' }],
    after: [{ id: 'a', type: 'text', content: 'kiwi' }],
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: { revertOf: 'rec-original' },
    transitions: [],
    createdAt: '2026-09-30T10:02:00.000Z',
    statusAt: '2026-09-30T10:02:00.000Z',
    ...over,
  }
}

function originalRecord(): ChangeLogRecord {
  return {
    id: 'rec-original',
    userId: 'user-1',
    pondId: null,
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: 'a',
    before: [{ id: 'a', type: 'text', content: 'kiwi' }],
    after: [{ id: 'a', type: 'text', content: 'fig' }],
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: ORIGINAL_CREATED_AT,
    statusAt: ORIGINAL_CREATED_AT,
  }
}

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

let revertStatus: ChangeLogRecord['status'] = 'proposed'

beforeEach(() => {
  jest.clearAllMocks()
  revertStatus = 'proposed'
  mockGetPage.mockResolvedValue({
    id: 'page-1',
    parentId: null,
    type: 'page',
    title: 'kitchen renovation',
    blocks: [{ id: 'a', type: 'text', content: 'kiwi' }],
    order: 0,
    props: {},
  })
  mockGetRecord.mockImplementation(async (_supabase: unknown, id: string) =>
    id === 'rec-revert'
      ? revertRecord({ status: revertStatus })
      : id === 'rec-original'
        ? originalRecord()
        : null
  )
})

describe('AITerminal — the raised revert card (KAN-152, s6o4 f4)', () => {
  it('raises one card with "revert of HH:MM" (the original record\'s time) and accept/reject', async () => {
    renderTerminal()

    act(() => {
      raiseRecordCard('rec-revert')
    })

    const card = await screen.findByTestId('composer-record-card')
    expect(
      await within(card).findByText('proposed edit — kitchen renovation')
    ).toBeInTheDocument()
    expect(
      within(card).getByText(`revert of ${formatClockTime(ORIGINAL_CREATED_AT)}`)
    ).toBeInTheDocument()
    expect(within(card).getByText('fig')).toBeInTheDocument()
    expect(within(card).getByText('kiwi')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'accept' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'reject' })).toBeInTheDocument()
  })

  it('accept calls acceptRevert, and the card leaves once settled', async () => {
    const user = userEvent.setup()
    mockAcceptRevert.mockImplementation(async () => {
      // The real write settles the status BEFORE the caller invalidates and
      // refetches — the same order this mock mirrors.
      revertStatus = 'accepted'
      return { kind: 'accepted', revert: revertRecord({ status: 'accepted' }) }
    })
    renderTerminal()

    act(() => {
      raiseRecordCard('rec-revert')
    })
    const card = await screen.findByTestId('composer-record-card')

    await user.click(within(card).getByRole('button', { name: 'accept' }))

    await waitFor(() => expect(mockAcceptRevert).toHaveBeenCalledTimes(1))
    expect(mockAcceptRevert.mock.calls[0][1]).toMatchObject({
      revert: expect.objectContaining({ id: 'rec-revert' }),
    })
    await waitFor(() => expect(screen.queryByTestId('composer-record-card')).not.toBeInTheDocument())
  })

  it('carries no paper of its own — only the diff is its own paper box (s6o4 f4)', async () => {
    renderTerminal()

    act(() => {
      raiseRecordCard('rec-revert')
    })
    const card = await screen.findByTestId('composer-record-card')

    // The card sits on the composer's own glass: 14px padding, 12px gap,
    // no background/shadow of its own.
    expect(card).toHaveClass('p-3.5', 'gap-3')
    expect(card).not.toHaveClass('bg-mn-card', 'shadow-mn-card', 'rounded-mn-card')

    // The diff is its own paper box: 10px padding, 20px radius, the
    // two-part shadow, 3px gap.
    const diff = within(card).getByTestId('composer-record-card-diff')
    expect(diff).toHaveClass('p-[10px]', 'gap-[3px]', 'bg-mn-card', 'shadow-mn-card', 'rounded-mn-card')
  })
})
