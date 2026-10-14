/**
 * KAN-98 path test — PATH_STEPS 1-6 walked end to end: a person selects a
 * passage, asks pond, sees its chip and the passage highlighted, sends (the
 * body carries the reference as structured data and both clear), makes a
 * second reference and removes it (only its own highlight goes), then types
 * before the surviving passage and its highlight re-anchors onto the same
 * words.
 *
 * Renders the real `DocumentPanel` (the page, its live Tiptap block) beside
 * the real `AITerminal` (which mounts `SelectionBar` and the references row
 * itself) — same harness as `selection-bar-path.test.tsx`, plus the
 * `AITerminal.test.tsx` mocks it needs to reach `isReady`. A selection is a
 * real `Range` (`selectWord`), not a `userEvent` drag — ProseMirror's
 * mousedown handler calls `document.elementFromPoint`, which jsdom lacks —
 * and typing before the passage is a direct editor command for the same
 * reason real typing can't be driven through a ProseMirror contenteditable
 * in jsdom. Everything else (ask pond / send / remove, the composer's own
 * textarea) is driven by real `userEvent`.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'
import { clearSelection, selectWord } from './helpers/selection'
import { findTextBlock, textEditorOf } from './helpers/text-block'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
  }),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
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

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

let mockMessages: unknown[] = []
const mockSendMessage = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

import { getPage, listPages } from '@/lib/pages/client'

const mockGetPage = getPage as jest.Mock
const mockListPages = listPages as jest.Mock

const SENTENCE = 'the wild places keep their old paths'
const blocks: Block[] = [{ id: 'b-text', type: 'text', content: SENTENCE }]
const PAGE = {
  id: 'page-1',
  parentId: null,
  type: 'page',
  title: 'Workshop',
  blocks,
  order: 0,
  props: {},
} as PondPage
const PAGE2 = {
  id: 'page-2',
  parentId: null,
  type: 'page',
  title: 'Kitchen renovation',
  blocks: [],
  order: 1,
  props: {},
} as PondPage

function renderSurface(extraPages: PondPage[] = []) {
  mockGetPage.mockResolvedValue(PAGE)
  mockListPages.mockResolvedValue([PAGE, ...extraPages])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <AITerminal />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const waitComposerReady = () =>
  waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).not.toBeDisabled())

/**
 * `handleAskFromSelection` refocuses the composer on a `requestAnimationFrame`
 * — flushed before the next selection, or its stolen focus clears the
 * editor's real DOM `Selection` out from under the word picked just after.
 */
const flushAskFocus = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

describe('a reference survives a send, a removal and an edit (KAN-98 path test)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendMessage.mockClear()
    mockMessages = []
  })
  afterEach(() => clearSelection())

  it('walks select → ask pond → send → remove a second reference → re-anchor', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()
    const field = await findTextBlock()

    // 1-3: select "wild", ask pond — a chip appears, the words stay
    // highlighted, and no quote text lands in the composer input.
    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))

    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()
    expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(1)
    expect(field.querySelector('.mn-reference-highlight')?.textContent).toBe('wild')
    const composerInput = screen.getByRole('textbox', { name: 'Message Pond' })
    expect(composerInput).toHaveValue('')

    // 4: type a question and send — the request body carries the reference
    // as structured data, and the reference (board 6e frame 4: the refs row
    // still holds it beside the "make page" chip) survives the send — the
    // chip and highlight both stay.
    await user.type(composerInput, 'what does this mean?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    expect(body.references).toEqual([
      expect.objectContaining({ pageId: 'page-1', blockId: 'b-text', quotedText: 'wild' }),
    ])
    expect(screen.getByText('Workshop — “wild”')).toBeInTheDocument()
    expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(1)

    // 5: make a second reference, then remove it — only its own highlight
    // (and chip) goes; the first reference (still live from the send) stays.
    clearSelection()
    selectWord(field, 'paths')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()

    await waitFor(() => expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'remove reference: Workshop — “paths”' }))

    await waitFor(() => expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(1))
    expect(field.querySelector('.mn-reference-highlight')?.textContent).toBe('wild')
    expect(screen.getByText('Workshop — “wild”')).toBeInTheDocument()
    expect(screen.queryByText('Workshop — “paths”')).not.toBeInTheDocument()

    // 6: type new words before the passage — the highlight re-anchors onto
    // the same words, and the chip still carries the same quoted passage.
    act(() => {
      textEditorOf(field).commands.insertContentAt(1, 'deep in ')
    })

    expect(field.querySelector('.mn-reference-highlight')?.textContent).toBe('wild')
    expect(screen.getByText('Workshop — “wild”')).toBeInTheDocument()
  })

  it('keeps an earlier reference re-anchored after a later one is added in the same block', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()
    const field = await findTextBlock()

    // Reference A: "wild".
    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()
    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()

    // Type new words before passage A — its highlight re-anchors forward,
    // off the range it was created with.
    clearSelection()
    act(() => {
      textEditorOf(field).commands.insertContentAt(1, 'deep in ')
    })
    expect(field.querySelector('.mn-reference-highlight')?.textContent).toBe('wild')

    // THEN ask pond on a second passage ("paths") in the same block. This is
    // the regression: adding a reference re-renders the refs row, which used
    // to re-push A's STALE, pre-edit range into the editor and jump its
    // highlight off "wild" entirely.
    selectWord(field, 'paths')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()

    await waitFor(() => expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(2))
    const texts = Array.from(field.querySelectorAll('.mn-reference-highlight')).map((el) => el.textContent)
    expect(texts).toContain('wild')
    expect(texts).toContain('paths')

    // The sent body carries A's re-anchored range (shifted forward by the
    // 8 characters of "deep in " inserted before it), not its original one.
    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'what does this mean?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    expect(body.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: 'page-1',
          blockId: 'b-text',
          quotedText: 'wild',
          range: { from: 13, to: 17 },
        }),
      ])
    )
  })

  it('restores a reference highlight after its page remounts (rail navigation away and back)', async () => {
    const user = userEvent.setup()
    mockGetPage.mockResolvedValue(PAGE)
    mockListPages.mockResolvedValue([PAGE])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const surface = (showPage: boolean) => (
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          {showPage && <DocumentPanel />}
          <AITerminal />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    const { rerender } = render(surface(true))
    await waitComposerReady()
    const field = await findTextBlock()

    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()
    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()
    expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(1)

    // Navigate away: the page's DocumentPanel (and its text block's editor) unmounts.
    rerender(surface(false))
    expect(screen.queryByRole('textbox', { name: 'text block' })).not.toBeInTheDocument()

    // Navigate back: a fresh editor mounts for the same block, with no
    // plugin state of its own — the highlight must be restored, not lost.
    rerender(surface(true))
    const newField = await findTextBlock()
    await waitFor(() => expect(newField.querySelectorAll('.mn-reference-highlight')).toHaveLength(1))
    expect(newField.querySelector('.mn-reference-highlight')?.textContent).toBe('wild')
    expect(screen.getByText('Workshop — “wild”')).toBeInTheDocument()
  })

  it('a new thread clears a reference — no chip, no highlight', async () => {
    const user = userEvent.setup()
    // A thread head (and its "new thread" control) only draws past one turn.
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'question 1' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'answer 1' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'question 2' }] },
      { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'answer 2' }] },
    ]
    renderSurface()
    await waitComposerReady()
    const field = await findTextBlock()

    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()
    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()
    expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'new thread' }))

    await waitFor(() => expect(screen.queryByText('Workshop — “wild”')).not.toBeInTheDocument())
    expect(field.querySelectorAll('.mn-reference-highlight')).toHaveLength(0)
  })
})

describe('the open page auto-references itself, deduped against a passage (KAN-99)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendMessage.mockClear()
    mockMessages = []
  })
  afterEach(() => clearSelection())

  it('shows the current page first and lets it be removed', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()

    expect(screen.getByRole('button', { name: 'remove reference: Workshop' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'remove reference: Workshop' }))

    expect(screen.queryByRole('group', { name: 'references' })).not.toBeInTheDocument()
  })

  it('removing the current page drops it from the next send', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()

    await user.click(screen.getByRole('button', { name: 'remove reference: Workshop' }))

    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'hello?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    expect(body.references).toEqual([])
    expect(body.openPageContext).toBe(false)
  })

  it('sends openPageContext: true while the current-page chip is still showing', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()

    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'hello?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    expect(body.openPageContext).toBe(true)
  })

  it('walks the @ picker end to end: open, narrow, Escape, pick and send alongside the current page (PATH_STEPS 1-5)', async () => {
    const user = userEvent.setup()
    renderSurface([PAGE2])
    await waitComposerReady()
    const textbox = screen.getByRole('textbox', { name: 'Message Pond' })

    // 1: the open page is already the first, removable chip.
    expect(screen.getByRole('button', { name: 'remove reference: Workshop' })).toBeInTheDocument()

    // 2: @ opens the popover headed "pages", rows for every pickable page —
    // Workshop itself is excluded, since it's already the current-page
    // whole-page reference (no duplicate pick) — first row highlighted.
    await user.type(textbox, 'a page on floorboards, with @')
    expect(await screen.findByText('pages')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Kitchen renovation/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Workshop/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    // 3: typing narrows the rows; Escape closes the popover and leaves the
    // typed text in the composer.
    await user.type(textbox, 'Kit')
    expect(screen.getByRole('option', { name: /Kitchen renovation/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('pages')).not.toBeInTheDocument()
    expect(textbox).toHaveValue('a page on floorboards, with @Kit')

    // 4: typing again re-opens the glass on the still-active @-token; Enter
    // picks the row — the typed query becomes the inline mention and the
    // page joins the references row as a whole-page chip.
    await user.type(textbox, 'c')
    await screen.findByRole('option', { name: /Kitchen renovation/ })
    await user.keyboard('{Enter}')
    await flushAskFocus()

    expect(screen.queryByText('pages')).not.toBeInTheDocument()
    expect(textbox).toHaveValue('a page on floorboards, with @Kitchen renovation')
    const refs = screen.getByRole('group', { name: 'references' })
    expect(refs).toHaveTextContent('Kitchen renovation')

    // 5: sending carries both the chosen page and the current page as
    // whole-page references.
    await user.type(textbox, ' does it fit?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    expect(body.references).toEqual([
      expect.objectContaining({ pageId: 'page-1', range: null }),
      expect.objectContaining({ pageId: 'page-2', range: null }),
    ])
  })

  it('anchors the @ picker to the visible composer card, not a transparent child of it', async () => {
    const user = userEvent.setup()
    renderSurface([PAGE2])
    await waitComposerReady()

    // The card (`TerminalDrawer`'s `[data-part="composer-card"]`) is the one
    // element that carries the glass — a distinctive rect here, left at
    // jsdom's all-zero default on every other element, proves the popover's
    // position comes from the card and not the footer's own (invisible) wrap.
    const card = document.querySelector('[data-part="composer-card"]') as HTMLElement
    jest.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      bottom: 240,
      left: 40,
      right: 400,
      width: 360,
      height: 40,
      x: 40,
      y: 200,
      toJSON: () => {},
    })

    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), '@')
    await screen.findByText('pages')

    const popover = document.querySelector('[data-part="popover"]') as HTMLElement
    expect(popover.style.top).toBe('250px') // the card's bottom (240) + the DC's 10px gap
    expect(popover.style.left).toBe('52px') // the card's left (40) + the DC's 12px inset
    expect(popover.style.width).toBe('336px') // the card's width (360) − 12px off each side
  })

  it('a passage ask on the current page suppresses its whole-page chip without removing the passage chip', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()
    const field = await findTextBlock()

    expect(screen.getByRole('button', { name: 'remove reference: Workshop' })).toBeInTheDocument()

    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))

    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'remove reference: Workshop' })
    ).not.toBeInTheDocument()
  })

  it('a new thread re-seeds exactly the current-page chip, dropping a passage reference', async () => {
    const user = userEvent.setup()
    mockMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'question 1' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'answer 1' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'question 2' }] },
      { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'answer 2' }] },
    ]
    renderSurface()
    await waitComposerReady()
    const field = await findTextBlock()

    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()
    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'new thread' }))

    await waitFor(() =>
      expect(screen.queryByText('Workshop — “wild”')).not.toBeInTheDocument()
    )
    const refs = screen.getByRole('group', { name: 'references' })
    expect(refs).toHaveTextContent('Workshop')
    expect(screen.getByRole('button', { name: 'remove reference: Workshop' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /remove reference/ })).toHaveLength(1)
  })
})
