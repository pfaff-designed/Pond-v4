/**
 * #97 — make-this-a-page from a streamed answer (`Pond 06.01` board 6a).
 *
 * The flow, end to end in the AITerminal: the question sits in mono and the
 * answer in the sans (never the serif); read chips sit under every answer (S8);
 * **make this a page** opens the `new page — proposed` card (name · under ·
 * kind editable; make page / change place / cancel); make page writes the page
 * with the prose word for word, the made-from stamp, a change-log record and a
 * rail entry; cancel makes nothing; a pending card re-seeds from the envelope
 * (6d closing); Esc stops a stream; an error keeps nothing; and no "keep as
 * note" / "keep in thread" exists anywhere (W4).
 *
 * Integration-style RTL tests with jest mocks for Supabase, @ai-sdk/react,
 * next/navigation, the pages client and the change-log store.
 */

import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks ──────────────────────────────────────────────────────────

const mockRouterPush = jest.fn()
let mockNodeId: string | null = 'kr-1'
let mockNodeName: string | null = 'Kitchen renovation'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({
    get: (key: string) =>
      key === 'nodeId' ? mockNodeId : key === 'nodeName' ? mockNodeName : null,
  }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  }),
}))

const PAGES = [
  {
    id: 'cre-1',
    parentId: null,
    type: 'page',
    title: 'Creativity',
    blocks: [],
    props: {},
    order: 0,
  },
  {
    id: 'kr-1',
    parentId: 'cre-1',
    type: 'page',
    title: 'Kitchen renovation',
    blocks: [],
    props: {},
    order: 0,
  },
  { id: 'bud-1', parentId: null, type: 'page', title: 'Budget', blocks: [], props: {}, order: 1 },
]

const mockCreatePage = jest.fn()
const mockGetPage = jest.fn()
const mockListPages = jest.fn()
// A page `createPage` just made is live (not trashed) until a test says
// otherwise — `listPages` must see it too, or every freshly-made page would
// read as "in trash" the instant it lands.
let createdPages: Array<Record<string, unknown>> = []
jest.mock('@/lib/pages/client', () => ({
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: (...args: unknown[]) => mockListPages(...args),
}))

const mockInsertPageOptimistic = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: (...args: unknown[]) => mockInsertPageOptimistic(...args),
}))

const mockAppendProposal = jest.fn().mockResolvedValue({ id: 'rec-1', status: 'proposed' })
const mockAdvanceStatus = jest.fn().mockResolvedValue({ id: 'rec-1' })
const mockGetRecordByToolCall = jest.fn().mockResolvedValue({ id: 'rec-1', status: 'proposed' })
const mockAcceptCreatePageRecord = jest.fn().mockResolvedValue({ id: 'rec-1', status: 'accepted' })
jest.mock('@/lib/change-log/store', () => ({
  appendProposal: (...args: unknown[]) => mockAppendProposal(...args),
  getRecordByToolCall: (...args: unknown[]) => mockGetRecordByToolCall(...args),
  advanceStatus: (...args: unknown[]) => mockAdvanceStatus(...args),
  acceptRecord: jest.fn(),
  acceptCreatePageRecord: (...args: unknown[]) => mockAcceptCreatePageRecord(...args),
  markOutdated: jest.fn(),
}))

// `sessionUndo` (a real singleton) calls through `undoStep`/`redoStep` for its
// RPC — mocked here so the KAN-179 undo-chip test drives the real session-undo
// queue/stack without reaching Supabase; the RPC's own behaviour is proven by
// `change-log-undo-trash.pglite.test.ts`, not this file.
const mockUndoStep = jest.fn()
jest.mock('@/lib/change-log/undo', () => ({
  undoStep: (...args: unknown[]) => mockUndoStep(...args),
  redoStep: jest.fn(),
}))

let mockLoadedResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
let mockLoadedMessages: unknown[] = []
const mockSaveTranscript = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: mockLoadedMessages,
    resolutions: mockLoadedResolutions,
  })),
  saveTranscript: (...args: unknown[]) => mockSaveTranscript(...args),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
const mockStop = jest.fn()
const mockSetMessages = jest.fn()
type MockMessage = { id: string; role: string; parts: unknown[]; metadata?: unknown }
let mockMessages: MockMessage[] = []
let mockStatus = 'ready'
let mockError: Error | undefined

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
    addToolOutput: jest.fn(),
    setMessages: mockSetMessages,
    status: mockStatus,
    stop: mockStop,
    error: mockError,
    clearError: jest.fn(),
  })),
}))

// The real write path, wrapped so a test can inspect what reached it (KAN-308)
// without changing its behaviour for every other test in this file.
const mockMakePageFromAnswer = jest.fn()
jest.mock('@/lib/pages/make-page', () => {
  const actual = jest.requireActual('@/lib/pages/make-page')
  return {
    ...actual,
    makePageFromAnswer: (...args: unknown[]) => {
      mockMakePageFromAnswer(...args)
      return actual.makePageFromAnswer(...args)
    },
  }
})

import { AITerminal } from '@/components/organisms/AITerminal'
import { ANSWER_PROSE_CLASS } from '@/components/molecules/Markdown'
import { readStamp } from '@/lib/conversation/page-proposals'
import { machineEyebrowClass, pageEyebrowClass } from '@/components/atoms/kicker'
import { changeLogKey } from '@/lib/change-log/keys'
import { pagesKey } from '@/lib/pages/keys'
import { PondContext } from '@/lib/pond/context'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { COMPOSER_HEIGHT_KEY } from '@/lib/layout/composer-height'
import type { PageProposal } from '@/lib/conversation/page-proposals'

// ── Fixtures ──────────────────────────────────────────────────────────────

const QUESTION = 'what is actually blocking the renovation?'
const PROSE =
  'One thing: the cabinet quote. The worktop template cannot be booked until the carcasses are measured, and the electrician wants a date before he holds the week. Everything else on the board is downstream of that.'

function answeredThread(): MockMessage[] {
  return [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: QUESTION }],
      metadata: { sentAt: '2026-09-22T07:12:00' },
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-read_page',
          toolCallId: 'rp1',
          state: 'output-available',
          input: { pageId: 'bud-1' },
        },
        { type: 'text', text: PROSE },
      ],
      // The read chips are STAMPED on the message when the answer lands (S8) — an
      // answered thread is one that already carries them.
      metadata: { read: ['Kitchen renovation', 'Budget'] },
    },
  ]
}

// A FRESH element each call (React bails out of re-rendering an identical one), on
// the SAME client — so a rerender really re-reads the mocked navigation state.
function terminalTree(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <AITerminal />
    </QueryClientProvider>
  )
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// `sessionUndo.remember` only fires once `pondId` is non-null — the rest of
// this file leaves the pond context unset, so this is the one tree that
// scopes the terminal to a real pond.
function terminalTreeForPond(qc: QueryClient, pondId: string) {
  return (
    <QueryClientProvider client={qc}>
      <PondContext.Provider
        value={{
          pond: { id: pondId, name: 'Life', glyph: null, theme: 'light', order: 0 },
          ponds: [],
          loading: false,
          reload: () => {},
          addPond: () => {},
        }}
      >
        <AITerminal />
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

function renderTerminal() {
  return render(terminalTree(newQueryClient()))
}

function readChipLabels(): string[] {
  return within(screen.getByTestId('read-chips'))
    .getAllByTestId('read-chip')
    .map((c) => c.textContent)
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

beforeEach(() => {
  jest.clearAllMocks()
  // The drawer remembers collapse in localStorage; a test that collapses it must
  // not hand the next test a collapsed composer.
  window.localStorage.clear()
  mockNodeId = 'kr-1'
  mockNodeName = 'Kitchen renovation'
  mockMessages = answeredThread()
  mockStatus = 'ready'
  mockError = undefined
  mockLoadedMessages = []
  mockLoadedResolutions = { changes: {}, creates: {}, skipped: {} }
  // Every "make this a page" fires the propose-page route in the background
  // (KAN-172). Most of these tests don't care about it, so the default
  // rejects — the fallback name/parent it already shows must stand untouched.
  global.fetch = jest.fn().mockRejectedValue(new Error('propose-page not mocked in this test'))
  mockGetPage.mockImplementation(
    async (_sb: unknown, id: string) => PAGES.find((p) => p.id === id) ?? null
  )
  createdPages = []
  mockListPages.mockImplementation(async () => [...PAGES, ...createdPages])
  mockCreatePage.mockImplementation(
    async (_sb: unknown, _uid: string, input: { title: string; parentId: string | null }) => {
      const page = {
        id: 'new-page-1',
        parentId: input.parentId,
        type: 'page',
        title: input.title,
        blocks: [],
        props: {},
        order: 99,
      }
      createdPages.push(page)
      return page
    }
  )
})

// ── The thread: mono question, sans answer, read chips ─────────────────────

describe('the answer in the thread (6a frames 2–3)', () => {
  it('sets the question in mono and the answer in the sans at 15px / 1.6 — never the serif', async () => {
    renderTerminal()
    await ready()

    const question = screen.getByText(QUESTION)
    const youRow = question.closest('[data-part="you-row"]')!
    expect(youRow).toBeInTheDocument()
    expect(question.className).toMatch(/font-mono/)
    expect(within(youRow as HTMLElement).getByText('you').className).toMatch(/font-sans/)
    expect(within(youRow as HTMLElement).getByText('07:12')).toBeInTheDocument()

    // jest stubs react-markdown (the real renderer is covered in Storybook), so
    // the voice is pinned two ways: the answer's paragraph is set in the answer
    // voice, and that voice IS the sans at 15px (16 on mobile) / 1.6.
    const answer = screen.getByText(PROSE)
    expect(answer.tagName).toBe('P')
    expect(answer.className).toContain(ANSWER_PROSE_CLASS)
    expect(ANSWER_PROSE_CLASS).toMatch(/font-sans/)
    expect(ANSWER_PROSE_CLASS).toMatch(/md:text-\[15px\]/)
    expect(ANSWER_PROSE_CLASS).toMatch(/\btext-\[16px\]/)
    expect(ANSWER_PROSE_CLASS).toMatch(/leading-\[1\.6\]/)
    expect(ANSWER_PROSE_CLASS).not.toMatch(/serif/)
    const answerBlock = answer.closest('[data-part="answer"]')!
    expect(answerBlock.querySelector('.font-serif')).toBeNull()
    expect(within(answerBlock as HTMLElement).getByText('pond')).toBeInTheDocument()
  })

  it('always renders read chips under the answer — the context page first, then what it read (S8)', async () => {
    renderTerminal()
    await ready()
    expect(within(screen.getByTestId('read-chips')).getByText('read')).toBeInTheDocument()
    expect(readChipLabels()).toEqual(['Kitchen renovation', 'Budget'])
  })

  it('stamps the read chips onto the answer as it lands, beside sentAt', async () => {
    const thread = answeredThread()
    delete thread[1].metadata
    mockMessages = thread
    renderTerminal()
    await ready()

    await waitFor(() => expect(mockSetMessages).toHaveBeenCalled())
    const stamp = mockSetMessages.mock.calls
      .map((c) => c[0])
      .filter((arg): arg is (m: MockMessage[]) => MockMessage[] => typeof arg === 'function')
      .at(-1)!
    const stamped = stamp(thread)
    expect(readStamp(stamped[1].metadata)).toEqual(['Kitchen renovation', 'Budget'])
    // The stamp rides beside what metadata already carried; the question is untouched.
    expect(stamped[0].metadata).toEqual({ sentAt: '2026-09-22T07:12:00' })
  })

  it('stamps a whole-page @-reference it fenced, and withholds the open page once that turn withheld it (KAN-99)', async () => {
    const thread = answeredThread()
    // This turn's question dismissed the current-page chip (`openPageContext:
    // false`) and carried a whole-page `@`-reference to Budget — the shape
    // `sendText` stamps onto the question's own metadata at send time.
    thread[0].metadata = {
      sentAt: '2026-09-22T07:12:00',
      openPageContext: false,
      wholePageRefPageIds: ['bud-1'],
    }
    thread[1].parts = [{ type: 'text', text: PROSE }]
    delete thread[1].metadata
    mockMessages = thread
    renderTerminal()
    await ready()

    await waitFor(() => expect(mockSetMessages).toHaveBeenCalled())
    const stamp = mockSetMessages.mock.calls
      .map((c) => c[0])
      .filter((arg): arg is (m: MockMessage[]) => MockMessage[] => typeof arg === 'function')
      .at(-1)!
    const stamped = stamp(thread)
    // Budget (the fenced whole-page reference) is listed; Kitchen renovation
    // (the open page, withheld this turn) is not.
    expect(readStamp(stamped[1].metadata)).toEqual(['Budget'])
  })

  it('an answer’s read chips never change when the person walks to another page', async () => {
    const qc = newQueryClient()
    const { rerender } = render(terminalTree(qc))
    await ready()
    expect(readChipLabels()).toEqual(['Kitchen renovation', 'Budget'])

    // Off to another page. The chips above are a record of what Pond read when it
    // answered — they must not start claiming it read wherever we are standing now.
    mockNodeId = 'cre-1'
    mockNodeName = 'Creativity'
    rerender(terminalTree(qc))
    await act(async () => {})

    expect(readChipLabels()).toEqual(['Kitchen renovation', 'Budget'])
  })

  it('offers make this a page and ask again, and nothing called keep as note / keep in thread (W4)', async () => {
    renderTerminal()
    await ready()
    expect(screen.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ask again' })).toBeInTheDocument()
    expect(screen.queryByText(/keep as note/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/keep in thread/i)).not.toBeInTheDocument()
  })

  it('ask again regenerates the answer under the same question — no new turn, same request context', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'ask again' }))
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockSetMessages).not.toHaveBeenCalled()
    // The route needs the same scoping sendText gives it.
    expect(mockRegenerate.mock.calls[0][0].body).toMatchObject({
      nodeId: 'kr-1',
      resolutions: expect.any(Object),
    })
    expect(mockRegenerate.mock.calls[0][0].body).toHaveProperty('pondId')
    expect(mockRegenerate.mock.calls[0][0].body).toHaveProperty('research')
  })

  it('ask again while streaming does nothing', async () => {
    mockStatus = 'streaming'
    renderTerminal()
    await ready()
    expect(screen.queryByRole('button', { name: 'ask again' })).not.toBeInTheDocument()
    expect(mockRegenerate).not.toHaveBeenCalled()
  })

  it('sends with a timestamp so the thread can show when a line was said', async () => {
    renderTerminal()
    await ready()
    const textarea = screen.getByPlaceholderText(/reply, or ask something else/i)
    fireEvent.change(textarea, { target: { value: 'and the budget?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const sent = mockSendMessage.mock.calls[0][0] as { metadata?: { sentAt?: string } }
    expect(typeof sent.metadata?.sentAt).toBe('string')
  })

  it('an empty send does nothing', async () => {
    renderTerminal()
    await ready()
    const textarea = screen.getByPlaceholderText(/reply, or ask something else/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

// ── Streaming: stop and Esc keep what arrived; an error keeps nothing ────────

describe('streaming (6a frame 2)', () => {
  it('shows a stop control while streaming, and Esc in the composer stops the stream', async () => {
    mockStatus = 'streaming'
    renderTerminal()
    await ready()
    expect(screen.getByRole('button', { name: 'stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'make this a page' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'stop' }))
    expect(mockStop).toHaveBeenCalledTimes(1)

    const textarea = screen.getByPlaceholderText(/reply, or ask something else/i)
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(mockStop).toHaveBeenCalledTimes(2)
    // Esc never clears what was typed (2f's rule, G1).
    fireEvent.change(textarea, { target: { value: 'kept' } })
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect((textarea as HTMLTextAreaElement).value).toBe('kept')
  })

  it('an error drops the answer it belongs to — and only that one', async () => {
    // A turn can leave two assistant messages in a row: a tool-only one, then the
    // text. One error must take the message that was in flight, not the complete
    // answer before it.
    const thread: MockMessage[] = [
      answeredThread()[0],
      {
        id: 'a0',
        role: 'assistant',
        parts: [
          {
            type: 'tool-read_page',
            toolCallId: 'rp0',
            state: 'output-available',
            input: { pageId: 'bud-1' },
          },
        ],
        metadata: { read: ['Kitchen renovation', 'Budget'] },
      },
      { ...answeredThread()[1], id: 'a1' },
    ]
    mockMessages = thread
    mockError = new Error('boom')
    const qc = newQueryClient()
    const { rerender } = render(terminalTree(qc))
    await ready()

    await waitFor(() => expect(mockSetMessages).toHaveBeenCalledTimes(1))
    const drop = mockSetMessages.mock.calls[0][0] as (m: MockMessage[]) => MockMessage[]
    const kept = drop(thread)
    expect(kept.map((m) => m.id)).toEqual(['u1', 'a0'])

    // The state update lands; the SAME error must not go on eating messages.
    mockMessages = kept
    rerender(terminalTree(qc))
    await act(async () => {})
    expect(mockSetMessages).toHaveBeenCalledTimes(1)
  })

  it('an error keeps nothing: the error line replaces the answer and offers ask again', async () => {
    mockError = new Error('boom')
    mockMessages = [answeredThread()[0]]
    renderTerminal()
    await ready()
    expect(
      screen.getByText('pond couldn’t finish this answer. nothing was kept.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ask again' }))
    expect(mockRegenerate).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

// ── The proposal card (6a frame 4) ──────────────────────────────────────────

describe('make this a page → the `new page — proposed` card', () => {
  it('opens the card with name, under and kind editable and the three controls — and makes nothing yet', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))

    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    expect(within(card).getByText('new page — proposed')).toBeInTheDocument()
    expect(within(card).getByText('3 fields')).toBeInTheDocument()

    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    expect(name.value).toBe('what is actually blocking the renovation')
    const under = within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement
    // Placement defaults to the page the answer was about.
    expect(under.value).toBe('kr-1')
    const kind = within(card).getByRole('textbox', { name: 'kind' }) as HTMLInputElement
    expect(kind.value).toBe('page')

    expect(within(card).getByRole('button', { name: 'make page' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'change place' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'cancel' })).toBeInTheDocument()

    expect(mockCreatePage).not.toHaveBeenCalled()
    // The proposal is born as a `proposed` change-log record, keyed by its id.
    await waitFor(() => expect(mockAppendProposal).toHaveBeenCalledTimes(1))
    expect(mockAppendProposal.mock.calls[0][1]).toMatchObject({
      action: 'create_page',
      sourceThreadId: 'conv-1',
      read: ['Kitchen renovation', 'Budget'],
    })
    // The card is a machine surface: mono, lowercase.
    expect(card.className).toMatch(/font-mono/)
    expect(card.className).toMatch(/lowercase/)
  })

  it('invalidates changeLogKey() once the proposal record write resolves — never before', async () => {
    const qc = newQueryClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    render(terminalTree(qc))
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    await screen.findByRole('group', { name: /new page — proposed/i })

    await waitFor(() => expect(mockAppendProposal).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() }))
  })

  it('the under select shows the full ancestor path for a parent two levels deep, never the disambiguated single title', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    const under = within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement
    // kr-1's own title is unique, so the shared, disambiguated `parentOptions`
    // would show just "Kitchen renovation" — the proposal card's own list
    // must show the full path regardless (6a f4).
    expect(under.selectedOptions[0].textContent).toBe('Creativity › Kitchen renovation')
  })

  it('one card per answer: while a card is open the chip steps aside, and only one card exists', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    await screen.findByRole('group', { name: /new page — proposed/i })
    expect(screen.queryByRole('button', { name: 'make this a page' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /new page — proposed/i })).toHaveLength(1)
    // ask again is still there — the thread keeps going around the card.
    expect(screen.getByRole('button', { name: 'ask again' })).toBeInTheDocument()
  })

  it('the page made: "make this a page" never comes back once the card is accepted', async () => {
    mockLoadedMessages = answeredThread()
    mockLoadedResolutions = {
      changes: {},
      creates: {},
      skipped: {},
      pageProposals: {
        'pp-made': {
          id: 'pp-made',
          messageId: 'a1',
          question: QUESTION,
          askedAt: '2026-09-22T07:12:00',
          prose: PROSE,
          read: ['Kitchen renovation'],
          name: 'renovation blockers',
          parentId: 'kr-1',
          kind: 'page',
          status: 'accepted',
          pageId: 'new-page-1',
        },
      },
    }
    renderTerminal()
    await ready()
    expect(screen.queryByRole('button', { name: 'make this a page' })).not.toBeInTheDocument()
  })

  it('an accepted proposal whose page is gone from allPages renders no card (the "page made"/"in trash" states moved to the composer chip row)', async () => {
    mockLoadedMessages = answeredThread()
    mockLoadedResolutions = {
      changes: {},
      creates: {},
      skipped: {},
      pageProposals: {
        'pp-made': {
          id: 'pp-made',
          messageId: 'a1',
          question: QUESTION,
          askedAt: '2026-09-22T07:12:00',
          prose: PROSE,
          read: ['Kitchen renovation'],
          name: 'renovation blockers',
          parentId: 'kr-1',
          kind: 'page',
          status: 'accepted',
          // Not one of PAGES's ids — the made page has been trashed.
          pageId: 'gone-page-1',
        },
      },
    }
    renderTerminal()
    await ready()
    expect(screen.queryByText(/page made/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
  })

  it('an accepted proposal whose page is still in allPages renders no card either (the chip row owns "open", gated on a pond)', async () => {
    mockLoadedMessages = answeredThread()
    mockLoadedResolutions = {
      changes: {},
      creates: {},
      skipped: {},
      pageProposals: {
        'pp-made': {
          id: 'pp-made',
          messageId: 'a1',
          question: QUESTION,
          askedAt: '2026-09-22T07:12:00',
          prose: PROSE,
          read: ['Kitchen renovation'],
          name: 'renovation blockers',
          parentId: 'kr-1',
          kind: 'page',
          status: 'accepted',
          // 'bud-1' is in PAGES — the made page is still live.
          pageId: 'bud-1',
        },
      },
    }
    renderTerminal()
    await ready()
    expect(screen.queryByText(/page made/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
  })

  it('while the pages list is still loading, an accepted proposal never reads "in trash"', async () => {
    // Never resolves within the test — `allPages` stays `[]`, `pagesLoaded` stays false.
    mockListPages.mockImplementation(() => new Promise(() => {}))
    mockLoadedMessages = answeredThread()
    mockLoadedResolutions = {
      changes: {},
      creates: {},
      skipped: {},
      pageProposals: {
        'pp-made': {
          id: 'pp-made',
          messageId: 'a1',
          question: QUESTION,
          askedAt: '2026-09-22T07:12:00',
          prose: PROSE,
          read: ['Kitchen renovation'],
          name: 'renovation blockers',
          parentId: 'kr-1',
          kind: 'page',
          status: 'accepted',
          // Would read as gone if `allPages`'s still-empty default were trusted.
          pageId: 'gone-page-1',
        },
      },
    }
    renderTerminal()
    await ready()
    expect(screen.queryByText(/in trash/)).not.toBeInTheDocument()
  })

  it('right after make page, with a listPages mock that stays stale, no card reads "in trash" (there is no card at all)', async () => {
    // Simulates insertPageOptimistic writing a cache `allPages` doesn't read,
    // with the refetch also never catching up — the made page must still
    // read as live off the session's own `madePageIds` set.
    mockListPages.mockImplementation(async () => [...PAGES])
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('new-page-1')))
    expect(screen.queryByText(/in trash/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
  })

  it('cancel returns to the thread and makes nothing; the record is rejected', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'cancel' }))

    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /new page — proposed/i })).not.toBeInTheDocument()
    )
    expect(mockCreatePage).not.toHaveBeenCalled()
    expect(screen.getByText(PROSE)).toBeInTheDocument()
    await waitFor(() =>
      expect(mockAdvanceStatus).toHaveBeenCalledWith(expect.anything(), 'rec-1', 'rejected', 'you')
    )
  })

  it('make page writes the page — prose word for word, kind, made-from stamp — then the record, the rail and the route', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const nameField = within(card).getByRole('textbox', { name: 'name' })
    fireEvent.change(nameField, { target: { value: 'renovation blockers' } })
    // DraftInput commits on blur, not per keystroke (KAN-290).
    fireEvent.blur(nameField)
    const kindField = within(card).getByRole('textbox', { name: 'kind' })
    fireEvent.change(kindField, { target: { value: 'project' } })
    fireEvent.blur(kindField)
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    const input = mockCreatePage.mock.calls[0][2] as {
      title: string
      parentId: string | null
      type: string
      blocks: { type: string; content: string }[]
      props: Record<string, unknown>
    }
    expect(input.title).toBe('renovation blockers')
    expect(input.parentId).toBe('kr-1')
    expect(input.type).toBe('page')
    expect(input.blocks[0]).toMatchObject({ type: 'text', content: PROSE })
    expect(input.props.kind).toBe('project')
    expect(input.props.madeFromThread).toMatchObject({
      threadId: 'conv-1',
      messageId: 'a1',
      question: QUESTION,
    })

    // Rail entry + navigation + the record advances to accepted.
    expect(mockInsertPageOptimistic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'new-page-1', parentId: 'kr-1', title: 'renovation blockers' }),
      null
    )
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('nodeId=new-page-1'))
    )
    // create_page records go through acceptCreatePageRecord (not the generic
    // advanceStatus) so the record remembers the made page's id.
    await waitFor(() =>
      expect(mockAcceptCreatePageRecord).toHaveBeenCalledWith(expect.anything(), 'rec-1', 'new-page-1')
    )
    // The card settles: no second make page is possible, and (per the KAN-179
    // chip-row move) the card itself renders nothing for the accepted state.
    expect(screen.queryByRole('button', { name: 'make page' })).not.toBeInTheDocument()
    expect(screen.queryByText(/page made/)).not.toBeInTheDocument()
  })

  it('make page clicked straight after an edit, with no manual blur, uses the latest typed name (PATH step 5)', async () => {
    const user = userEvent.setup()
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const nameField = within(card).getByRole('textbox', { name: 'name' })
    await user.clear(nameField)
    await user.type(nameField, 'kan290 throwaway')
    await user.click(within(card).getByRole('button', { name: 'make page' }))

    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    const input = mockCreatePage.mock.calls[0][2] as { title: string }
    expect(input.title).toBe('kan290 throwaway')
  })

  it('a double ↵ on make page makes ONE page (G9)', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    const make = within(card).getByRole('button', { name: 'make page' })
    fireEvent.click(make)
    fireEvent.click(make)
    fireEvent.keyDown(make, { key: 'Enter' })
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(mockCreatePage).toHaveBeenCalledTimes(1)
  })

  it('change place lets the person pick another parent, and make page writes there', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'change place' }))
    const under = within(card).getByRole('combobox', { name: 'under' })
    fireEvent.change(under, { target: { value: 'bud-1' } })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    expect((mockCreatePage.mock.calls[0][2] as { parentId: string }).parentId).toBe('bud-1')
  })

  it('when the parent was deleted between proposal and make page, nothing is written and the card asks for another place', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    mockGetPage.mockResolvedValue(null)
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByText('that place was deleted — pick another')
    expect(mockCreatePage).not.toHaveBeenCalled()
    // Re-find the card: the optimistic `accepted` dispatch (reverted here by
    // the ParentGoneError catch) passes `PageProposalCard` through its
    // accepted-status null render (KAN-179) before landing back on
    // `proposed`, so the DOM node captured above is stale by now.
    const revertedCard = await screen.findByRole('group', { name: /new page — proposed/i })
    expect(within(revertedCard).getByRole('button', { name: 'make page' })).toBeInTheDocument()
    expect(
      (within(revertedCard).getByRole('combobox', { name: 'under' }) as HTMLSelectElement).value
    ).toBe('')
  })

  it('Esc inside the card’s fields leaves the field — it never collapses the composer (C8)', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    name.focus()
    fireEvent.keyDown(name, { key: 'Escape' })
    // Esc steps back one rung: out of the field, with the card still standing.
    expect(document.activeElement).not.toBe(name)
    expect(screen.queryByRole('button', { name: 'Open composer' })).toBeNull()
    expect(within(card).getByRole('button', { name: 'make page' })).toBeInTheDocument()
    expect(name.value).not.toBe('')

    // The next Esc, with focus back on the body, takes the next rung: the close is
    // asked for, but an open proposal holds the composer open until it is decided.
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Open composer' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'cancel' }))
    expect(await screen.findByRole('button', { name: 'Open composer' })).toBeInTheDocument()
  })

  it('a very long typed name is written clamped, never raw', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const nameField = within(card).getByRole('textbox', { name: 'name' })
    fireEvent.change(nameField, { target: { value: long } })
    // DraftInput commits on blur, not per keystroke (KAN-290).
    fireEvent.blur(nameField)
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    const title = (mockCreatePage.mock.calls[0][2] as { title: string }).title
    expect(title.length).toBeLessThanOrEqual(120)
    expect(long.startsWith(title)).toBe(true)
  })

  // ── KAN-172: Pond's own name and placement, asked for in the background ───

  it('fills the open card’s name and parent once the propose-page route resolves', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'renovation blockers',
        parentId: 'bud-1',
        mentioned: [{ title: 'Budget', ref: 'bud-1', note: 'the one everything waits on' }],
      }),
    })
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    // The fallback stands the instant the card opens.
    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    expect(name.value).toBe('what is actually blocking the renovation')

    // Pond's own name and parent replace it once the route resolves.
    await waitFor(() => expect(name.value).toBe('renovation blockers'))
    const under = within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement
    expect(under.value).toBe('bud-1')

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/chat/propose-page',
      expect.objectContaining({ method: 'POST' })
    )
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string)
    expect(sent).toMatchObject({
      question: QUESTION,
      prose: PROSE,
      openPageId: 'kr-1',
      // Ids (the open page plus the tool-read_page call's pageId), not the
      // chip display titles ('Kitchen renovation', 'Budget').
      read: ['kr-1', 'bud-1'],
      pondId: null,
    })
  })

  it('carries the route’s leadIn/signOff onto the proposal record (KAN-308)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'renovation blockers',
        parentId: 'bud-1',
        mentioned: [],
        leadIn: 'Sure — here’s the blocker:',
        signOff: 'Want me to draft the email?',
      }),
    })
    const thread = answeredThread()
    thread[1].metadata = { ...(thread[1].metadata as object), sentAt: '2026-09-22T07:14:00' }
    mockMessages = thread
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    // The route's reply lands — the same sync point the name/parent tests use.
    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    await waitFor(() => expect(name.value).toBe('renovation blockers'))

    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))
    await waitFor(() => expect(mockMakePageFromAnswer).toHaveBeenCalledTimes(1))
    const sentProposal = mockMakePageFromAnswer.mock.calls[0][1].proposal as PageProposal
    expect(sentProposal).toMatchObject({
      leadIn: 'Sure — here’s the blocker:',
      signOff: 'Want me to draft the email?',
    })
    // The answer's own sentAt rides to the write, not the question's or a fresh one.
    expect(mockMakePageFromAnswer.mock.calls[0][1].answerSentAt).toBe('2026-09-22T07:14:00')
  })

  it("fills in Pond's chosen name and the full ancestor path once resolved, and a double click still makes one page (path test)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'renovation blockers',
        parentId: 'kr-1',
        mentioned: [],
      }),
    })
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    // The card stands at once with the fallback fields.
    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    expect(name.value).toBe('what is actually blocking the renovation')

    // Pond's own name lands once the route resolves — never the question cut short.
    await waitFor(() => expect(name.value).toBe('renovation blockers'))
    const under = within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement
    expect(under.value).toBe('kr-1')
    // `under` shows the full ancestor path, not a bare title (6a f4).
    expect(under.selectedOptions[0].textContent).toBe('Creativity › Kitchen renovation')

    // G9 regression: a double click on make page still makes exactly one page.
    const make = within(card).getByRole('button', { name: 'make page' })
    fireEvent.click(make)
    fireEvent.click(make)
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(mockCreatePage).toHaveBeenCalledTimes(1)
  })

  it('a name typed before the route resolves survives the reply', async () => {
    let resolveFetch!: (value: { ok: true; json: () => Promise<unknown> }) => void
    global.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      })
    )
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    expect(name.value).toBe('what is actually blocking the renovation')

    // The person types their own name while the route is still in flight.
    // Once typed into, DraftInput holds its draft against an incoming `value`.
    name.focus()
    fireEvent.change(name, { target: { value: 'my own name' } })

    resolveFetch({
      ok: true,
      json: async () => ({
        name: 'renovation blockers',
        parentId: 'kr-1',
        mentioned: [],
      }),
    })
    await act(async () => {})
    // The typed name must stand — a late reply never overwrites an edit.
    expect(name.value).toBe('my own name')
  })

  it('a name field merely focused, never typed into, still takes Pond’s placement name, and make page uses it (KAN-290)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'renovation blockers',
        parentId: 'kr-1',
        mentioned: [],
      }),
    })
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    expect(name.value).toBe('what is actually blocking the renovation')

    // The person clicks into the field but never types before the route resolves.
    name.focus()
    await waitFor(() => expect(name.value).toBe('renovation blockers'))

    fireEvent.blur(name)
    // The placement name must stand — a stale, untyped draft must not revert it.
    expect(name.value).toBe('renovation blockers')

    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    const input = mockCreatePage.mock.calls[0][2] as { title: string }
    expect(input.title).toBe('renovation blockers')
  })

  it('a route reply with parentId null leaves the fallback parent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'renovation blockers',
        parentId: null,
        mentioned: [],
      }),
    })
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    const under = within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement
    expect(under.value).toBe('kr-1')

    // The name still lands — only parentId is withheld for a null reply.
    await waitFor(() => expect(name.value).toBe('renovation blockers'))
    expect(under.value).toBe('kr-1')
  })

  it('leaves the fallback name and parent exactly as before when the propose-page route rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'))
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })

    const name = within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement
    const under = within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement
    expect(name.value).toBe('what is actually blocking the renovation')
    expect(under.value).toBe('kr-1')

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // Give the rejected call's microtask a turn to (not) land anything.
    await act(async () => {})
    expect(name.value).toBe('what is actually blocking the renovation')
    expect(under.value).toBe('kr-1')
  })
})

// ── The person's path, end to end: ask → make → made → trashed (KAN-308) ────

describe('the person’s path: make this a page → made → trashed (PATH_STEPS 2, 4, 5, 6)', () => {
  it('drops "make this a page" once the page is made, and renders no card either before or after the page is trashed', async () => {
    const qc = newQueryClient()
    render(terminalTree(qc))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))
    await waitFor(() => expect(mockCreatePage).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockAcceptCreatePageRecord).toHaveBeenCalledWith(expect.anything(), 'rec-1', 'new-page-1')
    )

    // The action never comes back for this answer, and the card (deleted in
    // KAN-179 — that state now lives in the composer's own chip row, which
    // this test's bare `terminalTree` has no pond to gate on) renders nothing.
    expect(screen.queryByRole('button', { name: 'make this a page' })).not.toBeInTheDocument()
    expect(screen.queryByText(/page made/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()

    // The page is deleted (trashed) — `allPages` no longer carries it.
    createdPages = createdPages.filter((p) => p.id !== 'new-page-1')
    await act(async () => {
      await qc.invalidateQueries({ queryKey: pagesKey() })
    })

    expect(screen.queryByText(/page made/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
  })
})

// ── KAN-179: the make-page step is remembered for session undo ─────────────

describe('KAN-179 — make page remembers its undo step', () => {
  it('calls sessionUndo.remember exactly once, with the made record’s id, per successful make page', async () => {
    const rememberSpy = jest.spyOn(sessionUndo, 'remember').mockImplementation(() => {})
    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await waitFor(() =>
      expect(mockAcceptCreatePageRecord).toHaveBeenCalledWith(expect.anything(), 'rec-1', 'new-page-1')
    )
    await waitFor(() => expect(rememberSpy).toHaveBeenCalledTimes(1))
    expect(rememberSpy).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['rec-1'] })

    rememberSpy.mockRestore()
  })
})

// ── KAN-179: the composer collapses to undo/open-parent chips (frame 5) ────

describe('KAN-179 — the composer collapses to the undo/open-parent chips once a page is made', () => {
  afterEach(() => {
    act(() => {
      sessionUndo.clear()
    })
  })

  it('a parented proposal hides the thread and offers undo + open <parent>, with the ask-about-this-page placeholder', async () => {
    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-collapse-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    // `sessionCanUndo` only flips once the real `sessionUndo.remember` call
    // (fired after `acceptCreatePageRecord` resolves) lands, so the chips
    // arrive a tick after the navigation does.
    await screen.findByRole('button', { name: 'undo' })
    expect(screen.getByRole('button', { name: 'open Kitchen renovation' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ask about this page')).toBeInTheDocument()

    // The thread is replaced, not folded alongside the chips.
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument()
    expect(screen.queryByText(PROSE)).not.toBeInTheDocument()
  })

  it('a top-level proposal (no parent) offers only undo', async () => {
    mockNodeId = null
    mockNodeName = null
    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-collapse-2'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('ask about this page')).toBeInTheDocument()
  })

  it('no reference chip names the new page, but an @-added reference from before make page still shows', async () => {
    const qc = newQueryClient()
    const { rerender } = render(terminalTreeForPond(qc, 'pond-collapse-refs'))
    await ready()

    // An @-added whole-page reference, added before make page, must survive
    // the fold (KAN-99) — only the auto current-page chip is stopped.
    const textarea = screen.getByRole('textbox', { name: 'Message Pond' }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '@Budget' } })
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.keyUp(textarea, { key: 't' })
    fireEvent.click(await screen.findByRole('option', { name: /Budget/i }))
    expect(screen.getByRole('group', { name: 'references' })).toHaveTextContent('Budget')

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))
    await screen.findByRole('button', { name: 'undo' })

    const madeTitle = (mockCreatePage.mock.calls[0][2] as { title: string }).title

    // The real app's `router.push` updates `nodeId` in place — the composer
    // is layout-level, not per-page — which would otherwise reseed the
    // current-page chip for the page just made. Simulated here by bumping
    // the mocked search params the same way the "navigate to another page"
    // path test does, and re-rendering the same instance.
    mockNodeId = 'new-page-1'
    mockNodeName = madeTitle
    rerender(terminalTreeForPond(qc, 'pond-collapse-refs'))

    const refs = screen.getByRole('group', { name: 'references' })
    expect(within(refs).queryByText(madeTitle)).not.toBeInTheDocument()
    expect(within(refs).getByText('Budget')).toBeInTheDocument()
  })

  it('folds only until the next send — a later question and its answer render normally, with the chip still above the line', async () => {
    const qc = newQueryClient()
    const { rerender } = render(terminalTreeForPond(qc, 'pond-collapse-3'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })
    expect(screen.queryByText(QUESTION)).not.toBeInTheDocument()
    const textarea = screen.getByPlaceholderText('ask about this page')

    fireEvent.change(textarea, { target: { value: 'and the electrician?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    // The mocked `useChat` doesn't append on its own send — mirror what a real
    // send does to `messages` before re-reading the hook.
    mockMessages = [
      ...answeredThread(),
      {
        id: 'u2',
        role: 'user',
        parts: [{ type: 'text', text: 'and the electrician?' }],
        metadata: { sentAt: '2026-09-22T07:20:00' },
      },
      {
        id: 'a2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'he can hold next week.' }],
        metadata: {},
      },
    ]
    rerender(terminalTreeForPond(qc, 'pond-collapse-3'))

    expect(screen.getByText('and the electrician?')).toBeInTheDocument()
    expect(screen.getByText('he can hold next week.')).toBeInTheDocument()
    // The chip row may stay above the line while its step is still on top.
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
  })

  it('folded, the card sizes to its content, not a saved drag height — the drag height returns once the thread renders again', async () => {
    window.localStorage.setItem(COMPOSER_HEIGHT_KEY, '616')
    const qc = newQueryClient()
    const { rerender } = render(terminalTreeForPond(qc, 'pond-collapse-4'))
    await ready()
    const card = () => screen.getByRole('region', { name: 'composer' })

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const proposedCard = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(proposedCard).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })
    expect(card().hasAttribute('data-sized')).toBe(false)
    expect(card().style.height).toBe('')
    expect(screen.queryByRole('separator', { name: 'Resize composer' })).toBeNull()

    const textarea = screen.getByPlaceholderText('ask about this page')
    fireEvent.change(textarea, { target: { value: 'and the electrician?' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    mockMessages = [
      ...answeredThread(),
      {
        id: 'u3',
        role: 'user',
        parts: [{ type: 'text', text: 'and the electrician?' }],
        metadata: { sentAt: '2026-09-22T07:20:00' },
      },
      {
        id: 'a3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'he can hold next week.' }],
        metadata: {},
      },
    ]
    rerender(terminalTreeForPond(qc, 'pond-collapse-4'))

    expect(card().hasAttribute('data-sized')).toBe(true)
    expect(card().style.height).toBe('616px')
  })
})

// ── KAN-179: the undo chip takes the made page back ──────────────────────────

describe('KAN-179 — the undo chip', () => {
  afterEach(() => {
    act(() => {
      sessionUndo.clear()
    })
  })

  it('click → the record is undone, the asking page opens, and make this a page is offered again', async () => {
    const undoRecord = {
      id: 'undo-rec-1',
      userId: 'user-1',
      pondId: 'pond-undo-1',
      status: 'undone' as const,
      action: 'create_page' as const,
      actor: 'you',
      targetPageId: null,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: { undoOf: 'rec-1' },
      transitions: [],
      createdAt: '2026-10-14T00:00:00.000Z',
      statusAt: '2026-10-14T00:00:00.000Z',
    }
    mockUndoStep.mockResolvedValue({ outcome: 'done', records: [undoRecord] })

    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-undo-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })
    mockRouterPush.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'undo' }))

    await waitFor(() => expect(mockUndoStep).toHaveBeenCalledTimes(1))
    // Back on the page the question was asked from — the proposal's own
    // parentId, stamped from the node open when make this a page was pressed.
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('kr-1'))
    )

    // The thread un-collapses: the chips are gone, the answer is back in the
    // thread unfiled, and make this a page is offered again.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'undo' })).not.toBeInTheDocument()
    )
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText(PROSE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
  })
})

// ── KAN-179: the undo chip is bound to its own step, not the whole stack ────

describe('KAN-179 — the undo chip is bound to its own step', () => {
  afterEach(() => {
    act(() => {
      sessionUndo.clear()
    })
  })

  it('is absent once a later, unrelated step lands on top of the stack', async () => {
    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-top-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })

    // A later, unrelated diff is accepted in the same pond and remembered —
    // its own step is now the top of the stack. The chip must not offer to
    // undo THAT: it is bound to its own made-page step, never whichever step
    // happens to be on top.
    act(() => {
      sessionUndo.remember({ pondId: 'pond-top-1', recordIds: ['rec-unrelated'] })
    })

    expect(screen.queryByRole('button', { name: 'undo' })).not.toBeInTheDocument()
  })

  it('⌘Z of the made step — not a click on this chip — re-offers make this a page', async () => {
    const undoRecord = {
      id: 'undo-rec-cmdz',
      userId: 'user-1',
      pondId: 'pond-cmdz-1',
      status: 'undone' as const,
      action: 'create_page' as const,
      actor: 'you',
      targetPageId: null,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: { undoOf: 'rec-1' },
      transitions: [],
      createdAt: '2026-10-14T00:00:00.000Z',
      statusAt: '2026-10-14T00:00:00.000Z',
    }
    mockUndoStep.mockResolvedValue({ outcome: 'done', records: [undoRecord] })

    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-cmdz-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })

    // ⌘Z reaches the session-undo engine directly, the same way ShellCommands'
    // own `runUndoStep` does — never through this chip's own onClick. The made
    // record lands on redo; the composer has to notice that on its own.
    await act(async () => {
      await sessionUndo.undo('pond-cmdz-1')
    })

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'undo' })).not.toBeInTheDocument()
    )
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText(PROSE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
  })

  it('double press undoes exactly one step', async () => {
    const undoRecord = {
      id: 'undo-rec-double',
      userId: 'user-1',
      pondId: 'pond-double-1',
      status: 'undone' as const,
      action: 'create_page' as const,
      actor: 'you',
      targetPageId: null,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: { undoOf: 'rec-1' },
      transitions: [],
      createdAt: '2026-10-14T00:00:00.000Z',
      statusAt: '2026-10-14T00:00:00.000Z',
    }
    mockUndoStep.mockResolvedValue({ outcome: 'done', records: [undoRecord] })

    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-double-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    const undoButton = await screen.findByRole('button', { name: 'undo' })
    fireEvent.click(undoButton)
    fireEvent.click(undoButton)

    await waitFor(() => expect(mockUndoStep).toHaveBeenCalledTimes(1))
  })

  it('double press with an earlier step underneath only takes back the made-page step, not the one beneath it', async () => {
    const undoRecord = {
      id: 'undo-rec-under',
      userId: 'user-1',
      pondId: 'pond-under-1',
      status: 'undone' as const,
      action: 'create_page' as const,
      actor: 'you',
      targetPageId: null,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: { undoOf: 'rec-1' },
      transitions: [],
      createdAt: '2026-10-14T00:00:00.000Z',
      statusAt: '2026-10-14T00:00:00.000Z',
    }
    mockUndoStep.mockResolvedValue({ outcome: 'done', records: [undoRecord] })

    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-under-1'))
    await ready()

    // An earlier, unrelated step (a diff accepted before this question was
    // ever asked) sits beneath where the made-page step will land.
    act(() => {
      sessionUndo.remember({ pondId: 'pond-under-1', recordIds: ['rec-earlier'] })
    })

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    const undoButton = await screen.findByRole('button', { name: 'undo' })
    fireEvent.click(undoButton)
    fireEvent.click(undoButton)

    await waitFor(() => expect(mockUndoStep).toHaveBeenCalledTimes(1))
    // The second press must not have reached the earlier step: it is still
    // the only thing left on the undo stack.
    expect(sessionUndo.getSnapshot('pond-under-1').topUndoRecordIds).toEqual(['rec-earlier'])
  })

  it('a "done" undo invalidates pagesKey() and changeLogKey() — the chip settles the same caches ⌘Z does', async () => {
    const undoRecord = {
      id: 'undo-rec-invalidate',
      userId: 'user-1',
      pondId: 'pond-invalidate-1',
      status: 'undone' as const,
      action: 'create_page' as const,
      actor: 'you',
      targetPageId: null,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: { undoOf: 'rec-1' },
      transitions: [],
      createdAt: '2026-10-14T00:00:00.000Z',
      statusAt: '2026-10-14T00:00:00.000Z',
    }
    mockUndoStep.mockResolvedValue({ outcome: 'done', records: [undoRecord] })

    const qc = newQueryClient()
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')
    render(terminalTreeForPond(qc, 'pond-invalidate-1'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    fireEvent.click(await screen.findByRole('button', { name: 'undo' }))

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: pagesKey() }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: changeLogKey() })
  })
})

// ── KAN-179: PATH_STEPS 1–8, walked for real ────────────────────────────────

describe('KAN-179 — the person’s path: ask → make page → navigate away → undo → back', () => {
  afterEach(() => {
    act(() => {
      sessionUndo.clear()
    })
  })

  it('walks PATH_STEPS 1–7: make page, navigate away and back, undo twice (one record), land back on the asking page with the answer unfiled', async () => {
    const qc = newQueryClient()

    // 1–2: a page with a parent, already carrying the answered thread (the
    // fixture) — make this a page → the proposed card → make page.
    const askingPage = render(terminalTreeForPond(qc, 'pond-path-1'))
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    // 3: the thread collapses to the chips + placeholder — no "page made" card.
    await screen.findByRole('button', { name: 'undo' })
    expect(screen.getByRole('button', { name: 'open Kitchen renovation' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('ask about this page')).toBeInTheDocument()
    expect(screen.queryByText('page made')).not.toBeInTheDocument()

    // 4: open <parent> navigates to the parent; undo stays offered.
    mockRouterPush.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'open Kitchen renovation' }))
    expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('kr-1'))
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()

    // 5: navigate to another page in the rail. This composer instance is this
    // page's own — it unmounts, the same way a route change would — but the
    // session's undo stack is a module-level singleton keyed by pond, not by
    // this component, so it survives the trip.
    expect(sessionUndo.getSnapshot('pond-path-1').canUndo).toBe(true)
    askingPage.unmount()

    mockNodeId = 'bud-1'
    mockNodeName = 'Budget'
    mockMessages = []
    const anotherPage = render(terminalTreeForPond(qc, 'pond-path-1'))
    await ready()
    // Budget's own thread never made a page — no chip here — but the session
    // undo stack this pond carries is untouched by visiting it.
    expect(screen.queryByRole('button', { name: 'undo' })).not.toBeInTheDocument()
    expect(sessionUndo.getSnapshot('pond-path-1').canUndo).toBe(true)
    anotherPage.unmount()

    // Back on the asking page — the real app reloads the made-page card from
    // its own saved transcript; the undo chip is offered again.
    mockNodeId = 'kr-1'
    mockNodeName = 'Kitchen renovation'
    mockMessages = answeredThread()
    mockLoadedResolutions = {
      changes: {},
      creates: {},
      skipped: {},
      pageProposals: {
        'pp-made': {
          id: 'pp-made',
          messageId: 'a1',
          question: QUESTION,
          askedAt: '2026-09-22T07:12:00',
          prose: PROSE,
          read: ['Kitchen renovation'],
          name: 'renovation blockers',
          parentId: 'kr-1',
          kind: 'page',
          status: 'accepted',
          pageId: 'new-page-1',
          recordId: 'rec-1',
        },
      },
    }
    render(terminalTreeForPond(qc, 'pond-path-1'))
    await ready()
    const undoButton = await screen.findByRole('button', { name: 'undo' })

    // 6: undo, pressed twice in quick succession — the session queue pops its
    // one step on the first call and finds nothing left for the second, so
    // exactly one RPC call reaches the engine (one undone record, one trash
    // move — proven at the engine level by change-log-undo-trash.pglite.test.ts).
    const undoRecord = {
      id: 'undo-rec-1',
      userId: 'user-1',
      pondId: 'pond-path-1',
      status: 'undone' as const,
      action: 'create_page' as const,
      actor: 'you',
      targetPageId: null,
      targetBlockId: null,
      before: null,
      after: null,
      sourceThreadId: null,
      toolCallId: null,
      read: null,
      links: { undoOf: 'rec-1' },
      transitions: [],
      createdAt: '2026-10-14T00:00:00.000Z',
      statusAt: '2026-10-14T00:00:00.000Z',
    }
    mockUndoStep.mockResolvedValue({ outcome: 'done', records: [undoRecord] })
    mockRouterPush.mockClear()
    fireEvent.click(undoButton)
    fireEvent.click(undoButton)

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(expect.stringContaining('kr-1'))
    )
    expect(mockUndoStep).toHaveBeenCalledTimes(1)

    // 7 (and the redone-answer half of the acceptance criteria): the thread
    // un-collapses — back on the asking page, the answer is unfiled, and make
    // this a page is offered again.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'undo' })).not.toBeInTheDocument()
    )
    expect(screen.getByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText(PROSE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'make this a page' })).toBeInTheDocument()
  })

  it('PATH_STEPS 8: a top-level proposal (no parent) offers only undo — exercised separately', async () => {
    mockNodeId = null
    mockNodeName = null
    const qc = newQueryClient()
    render(terminalTreeForPond(qc, 'pond-path-2'))
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

    await screen.findByRole('button', { name: 'undo' })
    expect(screen.queryByRole('button', { name: /^open /i })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('ask about this page')).toBeInTheDocument()
  })
})

// ── 6d closing: a pending proposal survives a reload ─────────────────────────

describe('closing Pond with a proposal open (6d)', () => {
  it('re-seeds a pending card from the envelope with its controls live — nothing made, nothing discarded', async () => {
    mockLoadedMessages = answeredThread()
    mockLoadedResolutions = {
      changes: {},
      creates: {},
      skipped: {},
      pageProposals: {
        'pp-saved': {
          id: 'pp-saved',
          messageId: 'a1',
          question: QUESTION,
          askedAt: '2026-09-22T07:12:00',
          prose: PROSE,
          read: ['Kitchen renovation'],
          name: 'renovation blockers',
          parentId: 'kr-1',
          kind: 'page',
          status: 'proposed',
        },
      },
    }
    renderTerminal()
    await ready()
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    expect((within(card).getByRole('textbox', { name: 'name' }) as HTMLInputElement).value).toBe(
      'renovation blockers'
    )
    expect(within(card).getByRole('button', { name: 'make page' })).toBeInTheDocument()
    expect(mockCreatePage).not.toHaveBeenCalled()
    // Re-seeding is not re-proposing: no second record.
    expect(mockAppendProposal).not.toHaveBeenCalled()
  })

  it('persists the pending proposal with the transcript as soon as the card opens', async () => {
    renderTerminal()
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    await screen.findByRole('group', { name: /new page — proposed/i })
    await waitFor(() => {
      const last = mockSaveTranscript.mock.calls.at(-1)
      const resolutions = last?.[3] as { pageProposals?: Record<string, { status: string }> }
      expect(Object.values(resolutions?.pageProposals ?? {})[0]?.status).toBe('proposed')
    })
  })
})

// ── The eyebrow's medium (PROJECT_RULES § two registers) ─────────────────────

describe('the eyebrow splits by medium, not by author', () => {
  // PROJECT_RULES § Design language: "two registers, split by medium, not by
  // author" — the machine surface (composer, palette, @-picker, diff cards,
  // provenance chips) is PP Neue Montreal MONO; anything living on a page is the
  // SANS. Board 6a measures all four of its eyebrows at 10.5px / 500 / .1em /
  // uppercase / ink .68, differing in that one thing: `PondComposer.dc.html`'s
  // own `card` head is sans by default (its `headSt` only forces mono for a head
  // starting `pond — ` or an explicit `label: 'mono'`), so `pond` and `new page —
  // proposed` are sans (composer) same as `made from` and `mentioned` (page).
  //
  // One shared eyebrow constant therefore sets two registers, and the wrong family
  // on half of them — a correct-LOOKING constant applied across both registers.
  // These pin the two apart, and pin everything else together so they cannot drift
  // into two different sizes.
  it('is mono on the machine surface and sans on a page', () => {
    expect(machineEyebrowClass).toMatch(/\bfont-mono\b/)
    expect(machineEyebrowClass).not.toMatch(/\bfont-sans\b/)
    expect(pageEyebrowClass).toMatch(/\bfont-sans\b/)
    expect(pageEyebrowClass).not.toMatch(/\bfont-mono\b/)
  })

  it('is otherwise one recipe — the family is the only difference (6a: 10.5px / 500 / .1em / uppercase / ink .68)', () => {
    const withoutFamily = (c: string) => c.replace(/\bfont-(mono|sans)\b/, '').trim()
    expect(withoutFamily(machineEyebrowClass)).toBe(withoutFamily(pageEyebrowClass))
    for (const value of [
      'text-[10.5px]',
      'font-medium',
      'tracking-[0.1em]',
      'uppercase',
      'text-mn-text-secondary',
    ])
      expect(machineEyebrowClass).toContain(value)
  })

  it('sets both the card head and the pond attribution in the sans, over the answer', async () => {
    renderTerminal()
    await ready()
    const answer = screen.getByText(PROSE).closest('[data-part="answer"]')!
    expect(within(answer as HTMLElement).getByText('pond').className).toBe(pageEyebrowClass)

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    expect(within(card).getByText('new page — proposed').className).toBe(pageEyebrowClass)
  })
})

// ── W4 — the strings do not exist in the product ─────────────────────────────

describe('W4 — no "keep as note" / "keep in thread" anywhere in the source', () => {
  it('finds neither string in src/ (outside tests)', () => {
    const root = path.join(process.cwd(), 'src')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === '__mocks__') continue
          walk(p)
        } else if (/\.(tsx?|css|md)$/.test(entry.name) && !/\.stories\.tsx$/.test(entry.name)) {
          const text = fs.readFileSync(p, 'utf8')
          if (/keep as (a )?note|keep in thread/i.test(text)) offenders.push(path.relative(root, p))
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
