/**
 * #98 — the propose_changes card inside the terminal: request changes reaches
 * Pond, a resolved card stays inert across reload, the change log flips a card
 * to outdated, and accept all appears only with more than one card.
 *
 * Integration-style RTL test with the same mocks as add-row-flow-ui.test.tsx,
 * plus the change-log store (so the record sync is under our control).
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/pond/context', () => {
  const active = { pond: { id: 'pond-7' }, ponds: [], loading: false, reload: () => {}, addPond: () => {} }
  return {
    ...jest.requireActual('@/lib/pond/context'),
    usePond: () => active,
    usePondId: () => active.pond.id,
  }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

const mockGetPage = jest.fn().mockResolvedValue(null)
const mockListPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: jest.fn(),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  collectionTitleResolver: () => () => undefined,
}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
// KAN-267: the write path an accept lands through — the place picker needs a
// real target page to resolve the accept against.
const mockCommitBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

let mockResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: mockResolutions,
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

// The change log, under test control: what the sync reads back per card.
const mockListByCalls = jest.fn()
// KAN-93: controllable per test, so an accept can be given a record to remember.
const mockGetRecordByToolCall = jest.fn().mockResolvedValue(null)
const mockAcceptRecord = jest.fn().mockResolvedValue(undefined)
// KAN-302: the chain's tip status, separate from the record's own frozen `status`.
// Kept per-record so every test's existing mockResolveChainStatus setup still
// drives it; `resolveChainStatuses` (the production call site now) is just
// that same per-record mock walked over the batch and collected into a Map.
const mockResolveChainStatus = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: (...args: unknown[]) => mockListByCalls(...args),
  resolveChainStatuses: async (
    supabase: unknown,
    opts: { userId: string; pondId: string | null; records: Array<{ id: string; status: string }> }
  ) => {
    const tips = new Map<string, string>()
    for (const record of opts.records) {
      tips.set(
        record.id,
        await mockResolveChainStatus(supabase, {
          userId: opts.userId,
          pondId: opts.pondId,
          recordId: record.id,
          status: record.status,
        })
      )
    }
    return tips
  },
  getRecordByToolCall: (...args: unknown[]) => mockGetRecordByToolCall(...args),
  advanceStatus: jest.fn(),
  acceptRecord: (...args: unknown[]) => mockAcceptRecord(...args),
  markOutdated: jest.fn(),
}))

// KAN-93: the session-undo stack an accept's record id is handed to.
const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

// KAN-267: the receipt toast fires through the notify bridge (the terminal
// mounts outside DeletionUndoProvider), so it has to be mocked to be read.
const mockRequestNotify = jest.fn()
jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: (...args: unknown[]) => mockRequestNotify(...args),
}))

const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
const mockSetMessages = jest.fn()
const mockAddToolOutput = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}> = []

// The turn's lifecycle, under test control: 'ready' means the turn has settled.
let mockStatus = 'ready'
let mockError: Error | undefined
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
    addToolOutput: mockAddToolOutput,
    setMessages: mockSetMessages,
    status: mockStatus,
    error: mockError,
  })),
}))

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ extractions: [] }),
} as Response)

import { AITerminal } from '@/components/organisms/AITerminal'
import { applyProposedChanges } from '@/lib/pages/edits'
import { createDeterministicMintId } from '@/lib/change-log/mint-id'
import { pagesKey } from '@/lib/pages/keys'
import type { ModuleChange } from '@/lib/modules/ai-composition'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  )
  const result = render(wrap(ui))
  return {
    ...result,
    queryClient,
    rerender: (node: React.ReactElement) => result.rerender(wrap(node)),
  }
}

function batch(toolCallId: string, targetPageId?: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      targetPageId,
      changes: [
        { op: 'create', data: { type: 'text', content: `first line of ${toolCallId}` } },
        { op: 'create', data: { type: 'text', content: `second line of ${toolCallId}` } },
      ],
    },
  }
}

/** The note box under the card — scoped so its `send` is not the composer's. */
function noteBox(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-part="note-box"]')
  if (!el) throw new Error('no note box open')
  return el
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

/**
 * A ChangeLogRecord whose accept makes it undoable (KAN-93). `after` is computed
 * the same way propose.ts computes it — real `applyProposedChanges`, seeded by
 * the SAME toolCallId — against an empty page (every accept test here mocks
 * `getPage` to `blocks: []`), so the accept write lands blocks byte-identical to
 * it, the way accept.ts's recordId gate now requires.
 */
function fakeRecord(id: string, toolCallId: string, targetPageId: string) {
  const changes = batch(toolCallId).input.changes as ModuleChange[]
  const after = applyProposedChanges([], changes, createDeterministicMintId(toolCallId), {
    batch: changes,
  }).blocks
  return {
    id,
    userId: 'user-1',
    pondId: 'pond-7',
    status: 'proposed' as const,
    action: 'edit' as const,
    actor: 'pond',
    targetPageId,
    targetBlockId: null,
    before: [],
    after,
    sourceThreadId: null,
    toolCallId,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    statusAt: '2026-10-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockListByCalls.mockResolvedValue([])
  // Default: the chain's tip is just the record's own status — only a test
  // that cares about a redo moving the tip past it overrides this.
  mockResolveChainStatus
    .mockReset()
    .mockImplementation((_sb: unknown, opts: { status: string }) => Promise.resolve(opts.status))
  mockGetRecordByToolCall.mockReset().mockResolvedValue(null)
  mockAcceptRecord.mockReset().mockResolvedValue(undefined)
  mockGetPage.mockReset().mockResolvedValue(null)
  mockListPages.mockReset().mockResolvedValue([])
  mockCommitBlocks.mockReset().mockResolvedValue(undefined)
  mockStatus = 'ready'
  mockError = undefined
  mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1')] }]
})

describe('AITerminal — propose_changes card (#98)', () => {
  it('renders one card for the batch with accept / reject / request changes and no accept all', async () => {
    renderWithQuery(<AITerminal />)
    await ready()
    expect(screen.getByText('first line of pc1')).toBeInTheDocument()
    expect(screen.getByText('second line of pc1')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'accept' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'reject' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'request changes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'accept all' })).not.toBeInTheDocument()
  })

  it('request changes sends the note to Pond and settles the card as changes requested', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AITerminal />)
    await ready()

    await user.click(screen.getByRole('button', { name: 'request changes' }))
    await user.type(screen.getByRole('textbox', { name: 'note to pond' }), 'drop the second line')
    await user.click(within(noteBox()).getByRole('button', { name: 'send' }))

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [message, options] = mockSendMessage.mock.calls[0] as [
      { text: string; metadata: Record<string, unknown> },
      { body: Record<string, unknown> },
    ]
    expect(message.text).toBe('drop the second line')
    expect(message.metadata.requestChanges).toEqual({ toolCallId: 'pc1', reason: 'note' })
    expect(options.body.requestChanges).toEqual({
      toolCallId: 'pc1',
      note: 'drop the second line',
      reason: 'note',
    })
    // The route scopes the change-log record by pond; a note without it files into main.
    expect(options.body.pondId).toBe('pond-7')
    // This turn's envelope already carries the decision, so the model reads it.
    const resolutions = options.body.resolutions as {
      changes: Record<string, string>
      changeNotes?: Record<string, string>
    }
    expect(resolutions.changes).toEqual({
      'pc1:0': 'changes_requested',
      'pc1:1': 'changes_requested',
    })
    expect(resolutions.changeNotes).toEqual({ pc1: 'drop the second line' })

    expect(screen.getByText('changes requested')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
  })

  it('a changes-requested card re-seeds inert from the envelope, with its note, after reload', async () => {
    mockResolutions = {
      changes: { 'pc1:0': 'changes_requested', 'pc1:1': 'changes_requested' },
      creates: {},
      skipped: {},
      changeNotes: { pc1: 'drop the second line' },
    }
    mockMessages = [
      { id: 'm1', role: 'assistant', parts: [batch('pc1')] },
      {
        id: 'u2',
        role: 'user',
        metadata: {
          sentAt: '2026-10-01T07:12:00.000Z',
          requestChanges: { toolCallId: 'pc1', reason: 'note' },
        },
        parts: [{ type: 'text', text: 'drop the second line' }],
      },
    ]
    renderWithQuery(<AITerminal />)
    await ready()
    expect(screen.getByText('changes requested')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    // The note shows once, under the card — the request-changes message is not a
    // second "you" line in the thread.
    expect(screen.getAllByText('drop the second line')).toHaveLength(1)
    expect(document.querySelector('[data-part="you-row"]')).toBeNull()
  })

  it('an outdated record flips the card: greyed, no accept, revise offered — and revise asks Pond', async () => {
    const user = userEvent.setup()
    mockListByCalls.mockResolvedValue([
      { id: 'rec-1', toolCallId: 'pc1', status: 'outdated', action: 'edit' },
    ])
    renderWithQuery(<AITerminal />)
    await ready()

    await waitFor(() => expect(screen.getByText('outdated')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'accept' })).not.toBeInTheDocument()
    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(card).toHaveAttribute('data-status', 'outdated')

    await user.click(screen.getByRole('button', { name: 'revise' }))
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, options] = mockSendMessage.mock.calls[0] as [
      unknown,
      { body: Record<string, unknown> },
    ]
    expect(options.body.requestChanges).toMatchObject({ toolCallId: 'pc1', reason: 'outdated' })
    expect(options.body.pondId).toBe('pond-7')
  })

  // KAN-302 — a redo never flips the record's own `status` back from `undone`
  // (0021 inserts a new `redo` row instead); the card must follow the chain's
  // tip, not the row, so it reads `accepted` again once the redo lands.
  it('an undone card adopts accepted again once the chain redo lands (KAN-302)', async () => {
    mockResolutions = {
      changes: { 'pc1:0': 'undone', 'pc1:1': 'undone' },
      creates: {},
      skipped: {},
    }
    mockListByCalls.mockResolvedValue([
      { id: 'rec-1', toolCallId: 'pc1', status: 'undone', action: 'edit' },
    ])
    mockResolveChainStatus.mockResolvedValue('accepted')

    renderWithQuery(<AITerminal />)
    await ready()

    await waitFor(() => expect(screen.getByText('accepted')).toBeInTheDocument())
    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(card).toHaveAttribute('data-status', 'accepted')
    expect(screen.queryByText('undone')).not.toBeInTheDocument()
  })

  it('ask again on a rejected card regenerates the answer; it does not send a new turn', async () => {
    const user = userEvent.setup()
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'tidy this page' }] },
      { id: 'm1', role: 'assistant', parts: [batch('pc1')] },
    ]
    renderWithQuery(<AITerminal />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'reject' }))
    await user.click(await screen.findByRole('button', { name: 'ask again' }))

    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockRegenerate.mock.calls[0][0].body).toMatchObject({ pondId: 'pond-7' })
    expect(mockRegenerate.mock.calls[0][0].body).toHaveProperty('resolutions')
  })

  it('ask again is offered only on the last answer: an older turn has none, its rejected card included', async () => {
    const user = userEvent.setup()
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'first question' }] },
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'older answer' }, batch('pc1')],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'second question' }] },
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'newer answer' }, batch('pc2')],
      },
    ]
    renderWithQuery(<AITerminal />)
    await ready()
    for (const reject of screen.getAllByRole('button', { name: 'reject' })) {
      await user.click(reject)
    }

    const newerAnswer = await screen.findByText('newer answer')
    const askAgains = await screen.findAllByRole('button', { name: 'ask again' })
    for (const askAgain of askAgains) {
      expect(newerAnswer.compareDocumentPosition(askAgain)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }

    await user.click(askAgains[0])
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
  })

  it('a thread ending on a user line offers no ask again on the answer above it; the error row still resends', async () => {
    const user = userEvent.setup()
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'first question' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'the first answer' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'second question' }] },
    ]
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()
    await user.click(screen.getByText(/1 earlier turn/))

    expect(await screen.findByText('the first answer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ask again' })).not.toBeInTheDocument()

    mockStatus = 'error'
    mockError = new Error('boom')
    rerender(<AITerminal />)
    await user.click(await screen.findByRole('button', { name: 'ask again' }))

    expect(mockRegenerate).toHaveBeenCalledTimes(1)
  })

  it('ask again does nothing once a stream is running (double-press guard)', async () => {
    const user = userEvent.setup()
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'tidy this page' }] },
      { id: 'm1', role: 'assistant', parts: [batch('pc1')] },
    ]
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'reject' }))
    const askAgain = await screen.findByRole('button', { name: 'ask again' })

    mockStatus = 'submitted'
    rerender(<AITerminal />)
    await user.click(askAgain)

    expect(mockRegenerate).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('a finished regenerate folds the replaced answer into metadata.earlier; a second one appends', async () => {
    const user = userEvent.setup()
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'tidy this page' }] },
      {
        id: 'm1',
        role: 'assistant',
        metadata: { sentAt: '2026-10-01T07:12:00.000Z', read: ['life'] },
        parts: [batch('pc1')],
      },
    ]
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()

    // The test's setMessages is a spy: fold its updaters into the mocked thread.
    const applySetMessages = () => {
      type Thread = typeof mockMessages
      for (const [update] of mockSetMessages.mock.calls as [Thread | ((prev: Thread) => Thread)][]) {
        if (typeof update !== 'function') continue
        mockMessages = update(mockMessages)
      }
      mockSetMessages.mockClear()
    }
    // regenerate() drops the answer, streams a replacement with a new id, then settles.
    const regenerateInto = (replacement: (typeof mockMessages)[number]) => {
      mockMessages = mockMessages.slice(0, 1)
      mockStatus = 'streaming'
      rerender(<AITerminal />)
      mockMessages = [...mockMessages, replacement]
      mockStatus = 'ready'
      rerender(<AITerminal />)
      applySetMessages()
      rerender(<AITerminal />)
    }

    await user.click(screen.getByRole('button', { name: 'reject' }))
    await user.click(await screen.findByRole('button', { name: 'ask again' }))
    regenerateInto({
      id: 'm2',
      role: 'assistant',
      metadata: { sentAt: '2026-10-01T07:15:00.000Z' },
      parts: [batch('pc2')],
    })

    const firstEarlier = {
      parts: [batch('pc1')],
      sentAt: '2026-10-01T07:12:00.000Z',
      read: ['life'],
    }
    expect(mockMessages[1].id).toBe('m2')
    expect(mockMessages[1].metadata?.earlier).toEqual([firstEarlier])

    await user.click(await screen.findByRole('button', { name: 'reject' }))
    await user.click(await screen.findByRole('button', { name: 'ask again' }))
    regenerateInto({ id: 'm3', role: 'assistant', parts: [batch('pc3')] })

    expect(mockRegenerate).toHaveBeenCalledTimes(2)
    expect(mockMessages[1].id).toBe('m3')
    const earlier = mockMessages[1].metadata?.earlier as Array<{ parts: unknown[] }>
    expect(earlier).toHaveLength(2)
    expect(earlier[0]).toEqual(firstEarlier)
    expect(earlier[1].parts).toEqual([batch('pc2')])
  })

  it('a failed regenerate puts the replaced answer back as current, unfolded, and clears the stash', async () => {
    const user = userEvent.setup()
    const stashed = {
      id: 'm1',
      role: 'assistant',
      metadata: { sentAt: '2026-10-01T07:12:00.000Z', read: ['life'] },
      parts: [batch('pc1')],
    }
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'tidy this page' }] },
      stashed,
    ]
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()

    const applySetMessages = () => {
      type Thread = typeof mockMessages
      for (const [update] of mockSetMessages.mock.calls as [Thread | ((prev: Thread) => Thread)][]) {
        if (typeof update !== 'function') continue
        mockMessages = update(mockMessages)
      }
      mockSetMessages.mockClear()
    }

    await user.click(screen.getByRole('button', { name: 'reject' }))
    await user.click(await screen.findByRole('button', { name: 'ask again' }))

    // regenerate() drops the answer and starts a replacement, which then fails.
    mockMessages = [
      mockMessages[0],
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'half an ans' }] },
    ]
    mockStatus = 'error'
    mockError = new Error('boom')
    rerender(<AITerminal />)
    applySetMessages()

    expect(mockMessages.map((m) => m.id)).toEqual(['u1', 'm1'])
    expect(mockMessages[1]).toBe(stashed)
    expect(mockMessages[1].metadata?.earlier).toBeUndefined()

    // The stash is spent: a later settle must not fold anything onto the restored answer.
    mockError = undefined
    mockStatus = 'ready'
    rerender(<AITerminal />)
    expect(mockSetMessages).not.toHaveBeenCalled()
  })

  it('stopping an ask again before its first chunk puts the replaced answer back, unfolded', async () => {
    const user = userEvent.setup()
    const stashed = {
      id: 'm1',
      role: 'assistant',
      metadata: { sentAt: '2026-10-01T07:12:00.000Z', read: ['life'] },
      parts: [batch('pc1')],
    }
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'tidy this page' }] },
      stashed,
    ]
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()

    const applySetMessages = () => {
      type Thread = typeof mockMessages
      for (const [update] of mockSetMessages.mock.calls as [Thread | ((prev: Thread) => Thread)][]) {
        if (typeof update !== 'function') continue
        mockMessages = update(mockMessages)
      }
      mockSetMessages.mockClear()
    }

    await user.click(screen.getByRole('button', { name: 'reject' }))
    await user.click(await screen.findByRole('button', { name: 'ask again' }))

    // regenerate() slices the answer out and submits; stop lands before any chunk.
    mockMessages = mockMessages.slice(0, 1)
    mockStatus = 'submitted'
    rerender(<AITerminal />)
    mockStatus = 'ready'
    rerender(<AITerminal />)
    applySetMessages()
    rerender(<AITerminal />)

    expect(mockMessages.map((m) => m.id)).toEqual(['u1', 'm1'])
    expect(mockMessages[1]).toBe(stashed)
    expect(mockMessages[1].metadata?.earlier).toBeUndefined()
    expect(screen.queryByRole('button', { name: /^earlier answer/ })).not.toBeInTheDocument()
    expect(mockSetMessages).not.toHaveBeenCalled()
  })

  it('two ask agains leave two fold lines, newest nearest the answer, each opening on its own', async () => {
    const user = userEvent.setup()
    // Like the real route: an answer arrives with no metadata, so the terminal stamps its time.
    const answer = (id: string, text: string) => ({
      id,
      role: 'assistant',
      parts: [{ type: 'text', text }],
    })
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'tidy this page' }] },
      answer('m1', 'first answer'),
    ]
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()

    const applySetMessages = () => {
      type Thread = typeof mockMessages
      for (const [update] of mockSetMessages.mock.calls as [Thread | ((prev: Thread) => Thread)][]) {
        if (typeof update !== 'function') continue
        mockMessages = update(mockMessages)
      }
      mockSetMessages.mockClear()
    }
    const regenerateInto = (replacement: (typeof mockMessages)[number]) => {
      mockMessages = mockMessages.slice(0, 1)
      mockStatus = 'streaming'
      rerender(<AITerminal />)
      mockMessages = [...mockMessages, replacement]
      mockStatus = 'ready'
      rerender(<AITerminal />)
      applySetMessages()
      rerender(<AITerminal />)
    }

    // setMessages is a spy here, so the stamp an answer gets on landing is folded in by hand.
    const landStamps = () => {
      applySetMessages()
      rerender(<AITerminal />)
    }

    landStamps()
    await user.click(await screen.findByRole('button', { name: 'ask again' }))
    regenerateInto(answer('m2', 'second answer'))
    landStamps()
    await user.click(await screen.findByRole('button', { name: 'ask again' }))
    regenerateInto(answer('m3', 'third answer'))

    const folds = await screen.findAllByRole('button', { name: /^earlier answer/ })
    expect(folds).toHaveLength(2)
    for (const fold of folds) expect(fold).toHaveTextContent(/^earlier answer · \d{2}:\d{2}$/)
    expect(screen.getByText('third answer')).toBeInTheDocument()
    expect(screen.queryByText('second answer')).not.toBeInTheDocument()
    expect(screen.queryByText('first answer')).not.toBeInTheDocument()

    await user.click(folds[1])
    expect(folds[1]).toHaveAttribute('aria-expanded', 'true')
    expect(folds[0]).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('first answer')).toBeInTheDocument()
    expect(screen.queryByText('second answer')).not.toBeInTheDocument()

    await user.click(folds[0])
    expect(screen.getByText('second answer')).toBeInTheDocument()
    expect(screen.getByText('first answer')).toBeInTheDocument()
  })

  it('two cards in one message offer accept all; one does not (C10)', async () => {
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1'), batch('pc2')] }]
    renderWithQuery(<AITerminal />)
    await ready()
    expect(screen.getAllByRole('button', { name: 'accept' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'accept all' })).toBeInTheDocument()
  })

  it('a revised card arriving after a request-changes note is labelled revised', async () => {
    const user = userEvent.setup()
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'request changes' }))
    await user.type(screen.getByRole('textbox', { name: 'note to pond' }), 'shorter')
    await user.click(within(noteBox()).getByRole('button', { name: 'send' }))
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))

    // Pond answers with a new batch.
    mockMessages = [...mockMessages, { id: 'm2', role: 'assistant', parts: [batch('pc2')] }]
    rerender(<AITerminal />)
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /revised edit/ })).toBeInTheDocument()
    )
    const revised = screen.getByRole('group', { name: /revised edit/ })
    expect(within(revised).getByText('first line of pc2')).toBeInTheDocument()
  })

  // #98 review. The "this is a revision of X" ref was set on send and cleared
  // ONLY when a propose_changes batch arrived. A revision turn that answers with
  // prose — a clarifying question, a refusal — left it set indefinitely, and the
  // next unrelated batch, however many turns later, was stamped as a revision of
  // that long-settled card and linked to it in the change log.
  it('a revision turn that answers with PROSE does not label a later unrelated batch', async () => {
    const user = userEvent.setup()
    const { rerender } = renderWithQuery(<AITerminal />)
    await ready()
    await user.click(screen.getByRole('button', { name: 'request changes' }))
    await user.type(screen.getByRole('textbox', { name: 'note to pond' }), 'shorter')
    await user.click(within(noteBox()).getByRole('button', { name: 'send' }))
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))

    // The turn runs and comes back as prose — no batch at all.
    mockStatus = 'streaming'
    rerender(<AITerminal />)
    mockMessages = [
      ...mockMessages,
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'which part did you mean?' }] },
    ]
    mockStatus = 'ready'
    rerender(<AITerminal />)

    // Much later, an unrelated question produces its own batch.
    mockMessages = [...mockMessages, { id: 'm3', role: 'assistant', parts: [batch('pc9')] }]
    rerender(<AITerminal />)

    await waitFor(() => expect(screen.getByText('first line of pc9')).toBeInTheDocument())
    const groups = screen.getAllByRole('group', { name: /edit/ })
    const stamped = groups.find((g) => within(g).queryByText('first line of pc9'))
    expect(stamped).toHaveAttribute('aria-label', expect.stringContaining('proposed edit'))
    expect(screen.queryByRole('group', { name: /revised edit/ })).not.toBeInTheDocument()
  })

  // KAN-267 — a card that needsPlace and has nothing picked yet has no target:
  // it must not claim the pond ("life") as its target while also saying it
  // needs a place. Once a place is picked, the target names that page instead.
  it('with needsPlace and nothing picked, the card names no target — not the pond', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => ({
      id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    }))

    renderWithQuery(<AITerminal />)
    await ready()

    const card = screen.getByRole('group', { name: 'proposed edit' })
    expect(within(card).queryByText('life')).not.toBeInTheDocument()
    expect(within(card).queryByText(/— life/)).not.toBeInTheDocument()

    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)

    expect(await within(card).findByText('Page B')).toBeInTheDocument()
  })

  // KAN-267 — PATH_STEPS 1-5: no page open, an unstamped batch offers no live
  // accept; picking a page in the place row offers one, and accepting writes to
  // the chosen page, naming it in the receipt.
  it('with no page open, picking a place in the card offers accept and writes there (KAN-267)', async () => {
    const user = userEvent.setup()
    const pageA = { id: 'page-a', parentId: null, type: 'page', title: 'Page A' }
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageA, pageB])
    mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => ({
      id,
      parentId: null,
      type: 'page',
      title: id === pageB.id ? pageB.title : pageA.title,
      blocks: [],
      props: {},
      order: 0,
    }))

    renderWithQuery(<AITerminal />)
    await ready()

    // Nothing is stamped and no page is open: accept cannot land, so the card
    // says so before any click, and offers a place instead.
    expect(screen.getByText('these changes need a place to accept to')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'accept' })).toBeDisabled()

    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)

    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'accept' }))

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1))
    const [, , committedTargetId, committedBlocks] = mockCommitBlocks.mock.calls[0] as [
      unknown,
      unknown,
      string,
      Array<{ content?: string }>,
    ]
    expect(committedTargetId).toBe(pageB.id)
    expect(committedBlocks.map((b) => b.content)).toEqual(
      expect.arrayContaining(['first line of pc1', 'second line of pc1'])
    )

    await waitFor(() =>
      expect(mockRequestNotify).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining(pageB.title) })
      )
    )
  })

  // KAN-267 — "accept all" must never reproduce the defect through the group
  // bar: with no page open and nothing stamped, neither pending card can land,
  // so accept all is withheld rather than silently writing nothing.
  it('two unstamped cards with no page open: accept all is withheld, not a silent no-op write', async () => {
    const user = userEvent.setup()
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1'), batch('pc2')] }]
    renderWithQuery(<AITerminal />)
    await ready()

    expect(screen.getAllByText('these changes need a place to accept to')).toHaveLength(2)
    const acceptAll = screen.getByRole('button', { name: 'accept all' })
    expect(acceptAll).toBeDisabled()
    expect(screen.getByRole('button', { name: 'reject all' })).toBeEnabled()

    await user.click(acceptAll)

    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  // KAN-302 — a card's header must read the target page's CURRENT title, not
  // the name frozen in `changeTargets[toolCallId]?.nodeName` at proposal time.
  it("a card header follows the target page's title after a rename (KAN-302)", async () => {
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1', pageB.id)] }]

    const { queryClient } = renderWithQuery(<AITerminal />)
    await ready()

    const head = () => document.querySelector('[data-part="head"]')
    await waitFor(() => expect(head()?.textContent).toContain('Page B'))

    queryClient.setQueryData(
      [...pagesKey('pond-7'), 'full'],
      [{ ...pageB, title: 'Renamed Page' }]
    )

    await waitFor(() => expect(head()?.textContent).toContain('Renamed Page'))
    expect(head()?.textContent).not.toContain('Page B')
  })
})

// KAN-93 — a single card's accept remembers one step; accept-all remembers the
// whole batch as ONE step after its loop, never one `remember` call per card.
describe('AITerminal — accept hands its record to sessionUndo (KAN-93)', () => {
  it('a single accept remembers one step with that one record id', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockGetRecordByToolCall.mockResolvedValue(fakeRecord('rec-1', 'pc1', pageB.id))

    renderWithQuery(<AITerminal />)
    await ready()
    await screen.findByRole('option', { name: 'Page B' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'under' }), pageB.id)
    await waitFor(() => expect(screen.getByRole('button', { name: 'accept' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'accept' }))

    await waitFor(() => expect(mockAcceptRecord).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockRemember).toHaveBeenCalledTimes(1))
    expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-7', recordIds: ['rec-1'] })
  })

  it('accept all remembers every card together, once, never per card', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1'), batch('pc2')] }]
    mockListPages.mockResolvedValue([pageB])
    mockGetPage.mockResolvedValue({
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    })
    mockGetRecordByToolCall.mockImplementation(
      async (_supabase: unknown, opts: { toolCallId: string }) =>
        fakeRecord(`rec-${opts.toolCallId}`, opts.toolCallId, pageB.id)
    )

    renderWithQuery(<AITerminal />)
    await ready()
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'under' })).toHaveLength(2))
    for (const box of screen.getAllByRole('combobox', { name: 'under' })) {
      await waitFor(() => expect(within(box).getByRole('option', { name: 'Page B' })).toBeInTheDocument())
      await user.selectOptions(box, pageB.id)
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'accept all' })).toBeEnabled()
    )

    await user.click(screen.getByRole('button', { name: 'accept all' }))

    await waitFor(() => expect(mockAcceptRecord).toHaveBeenCalledTimes(2))
    expect(mockRemember).toHaveBeenCalledTimes(1)
    expect(mockRemember).toHaveBeenCalledWith({
      pondId: 'pond-7',
      recordIds: ['rec-pc1', 'rec-pc2'],
    })
  })

  it('accept all still remembers the cards that already landed when a later card throws partway', async () => {
    const user = userEvent.setup()
    const pageB = { id: 'page-b', parentId: null, type: 'page', title: 'Page B' }
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [batch('pc1'), batch('pc2')] }]
    mockListPages.mockResolvedValue([pageB])
    const pageBDoc = {
      id: pageB.id,
      parentId: null,
      type: 'page',
      title: pageB.title,
      blocks: [],
      props: {},
      order: 0,
    }
    // The first card's accept reads the target page and lands; the second card's
    // read throws, so its write never happens — proving the first card's id is
    // still remembered rather than lost with the batch.
    mockGetPage.mockResolvedValueOnce(pageBDoc).mockRejectedValueOnce(new Error('read failed'))
    mockGetRecordByToolCall.mockImplementation(
      async (_supabase: unknown, opts: { toolCallId: string }) =>
        fakeRecord(`rec-${opts.toolCallId}`, opts.toolCallId, pageB.id)
    )

    renderWithQuery(<AITerminal />)
    await ready()
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'under' })).toHaveLength(2))
    for (const box of screen.getAllByRole('combobox', { name: 'under' })) {
      await waitFor(() => expect(within(box).getByRole('option', { name: 'Page B' })).toBeInTheDocument())
      await user.selectOptions(box, pageB.id)
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'accept all' })).toBeEnabled()
    )

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'accept all' }))

    await waitFor(() => expect(mockRemember).toHaveBeenCalledTimes(1))
    expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-7', recordIds: ['rec-pc1'] })
    expect(mockAcceptRecord).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})
