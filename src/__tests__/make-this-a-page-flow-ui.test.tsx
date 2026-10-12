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
jest.mock('@/lib/pages/client', () => ({
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  listPages: jest.fn(async () => PAGES),
}))

const mockInsertPageOptimistic = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: (...args: unknown[]) => mockInsertPageOptimistic(...args),
}))

const mockAppendProposal = jest.fn().mockResolvedValue({ id: 'rec-1', status: 'proposed' })
const mockAdvanceStatus = jest.fn().mockResolvedValue({ id: 'rec-1' })
jest.mock('@/lib/change-log/store', () => ({
  appendProposal: (...args: unknown[]) => mockAppendProposal(...args),
  getRecordByToolCall: jest.fn().mockResolvedValue({ id: 'rec-1', status: 'proposed' }),
  advanceStatus: (...args: unknown[]) => mockAdvanceStatus(...args),
  acceptRecord: jest.fn(),
  markOutdated: jest.fn(),
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

import { AITerminal } from '@/components/organisms/AITerminal'
import { ANSWER_PROSE_CLASS } from '@/components/molecules/Markdown'
import { readStamp } from '@/lib/conversation/page-proposals'
import { machineEyebrowClass, pageEyebrowClass } from '@/components/atoms/kicker'

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
  mockCreatePage.mockImplementation(
    async (_sb: unknown, _uid: string, input: { title: string }) => ({
      id: 'new-page-1',
      title: input.title,
    })
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

    fireEvent.change(within(card).getByRole('textbox', { name: 'name' }), {
      target: { value: 'renovation blockers' },
    })
    fireEvent.change(within(card).getByRole('textbox', { name: 'kind' }), {
      target: { value: 'project' },
    })
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
    await waitFor(() =>
      expect(mockAdvanceStatus).toHaveBeenCalledWith(expect.anything(), 'rec-1', 'accepted', 'you')
    )
    // The card settles: no second make page is possible.
    expect(screen.queryByRole('button', { name: 'make page' })).not.toBeInTheDocument()
    expect(screen.getByText('page made')).toBeInTheDocument()
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
    expect(within(card).getByRole('button', { name: 'make page' })).toBeInTheDocument()
    expect((within(card).getByRole('combobox', { name: 'under' }) as HTMLSelectElement).value).toBe(
      ''
    )
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
    fireEvent.change(within(card).getByRole('textbox', { name: 'name' }), {
      target: { value: long },
    })
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
      read: ['Kitchen renovation', 'Budget'],
      pondId: null,
    })
  })

  it('fills in Pond\'s chosen name and the full ancestor path once resolved, and a double click still makes one page (path test)', async () => {
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
  // uppercase / ink .68, differing in that one thing: `pond` and `new page —
  // proposed` are mono (composer), `made from` and `mentioned` sans (page).
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

  it('sets the card head in the mono and the pond attribution in the sans, over the answer', async () => {
    renderTerminal()
    await ready()
    const answer = screen.getByText(PROSE).closest('[data-part="answer"]')!
    expect(within(answer as HTMLElement).getByText('pond').className).toBe(pageEyebrowClass)

    fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
    const card = await screen.findByRole('group', { name: /new page — proposed/i })
    expect(within(card).getByText('new page — proposed').className).toBe(machineEyebrowClass)
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
