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
jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: (...args: unknown[]) => mockListByCalls(...args),
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn(),
  markOutdated: jest.fn(),
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

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  )
  const result = render(wrap(ui))
  return { ...result, rerender: (node: React.ReactElement) => result.rerender(wrap(node)) }
}

function batch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
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

beforeEach(() => {
  jest.clearAllMocks()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockListByCalls.mockResolvedValue([])
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
})
