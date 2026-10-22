/**
 * KAN-186 path test — PATH_STEPS 1-8 walked end to end, the ticket's own
 * acceptance: enter zen, the pill's six items (accessible names, the four
 * `aria-disabled` ones inert), the Pond mark opens the composer card over the
 * pill (active state, type + send, the answer renders, the page underneath
 * doesn't change), "close" returns to the text, Esc closes the card before a
 * second Esc leaves zen, "ask pond" from a selection on the bar opens the
 * card with the passage attached, and zen-entry alone opens nothing.
 *
 * Same harness as `references-path.test.tsx`'s own KAN-186 describe (real
 * `DocumentPanel` + `AITerminal` + `ZenPill` under one `ZenProvider`, mocked
 * `@ai-sdk/react`) — the nearest integration host these tests already use.
 */

import { createRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'
import { ZenPill } from '@/components/organisms/ZenPill'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { useZen, ZenComposerChrome, ZenProvider } from '@/lib/layout/zen'
import type { Block } from '@/lib/documents/types'
import type { PondPage } from '@/lib/pages/client'
import { clearSelection, selectWord } from './helpers/selection'
import { findTextBlock } from './helpers/text-block'

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

const waitComposerReady = () => {
  openComposerIfClosed()
  return waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Message Pond' })).not.toBeDisabled()
  )
}

function ZenSurfaceBody() {
  const { enterZen } = useZen()
  return (
    <>
      <button onClick={() => enterZen({ onInk: false })}>enter</button>
      <DocumentPanel />
      <ZenComposerChrome>
        <AITerminal />
      </ZenComposerChrome>
      <ZenPill />
    </>
  )
}

function ZenSurfaceHost({
  root,
  client,
}: {
  root: RefObject<HTMLDivElement | null>
  client: QueryClient
}): ReactNode {
  return (
    <div ref={root}>
      <QueryClientProvider client={client}>
        <DeletionUndoProvider>
          <ZenProvider scrollRoot={root}>
            <ZenSurfaceBody />
          </ZenProvider>
        </DeletionUndoProvider>
      </QueryClientProvider>
    </div>
  )
}

function renderZenSurface() {
  mockGetPage.mockResolvedValue(PAGE)
  mockListPages.mockResolvedValue([PAGE])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRef<HTMLDivElement>()
  const view = render(<ZenSurfaceHost root={root} client={client} />)
  return { ...view, root, client }
}

describe('KAN-186 — the zen pill path test (PATH_STEPS 1-8)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendMessage.mockClear()
    mockMessages = []
  })
  afterEach(() => clearSelection())

  it('walks the pill, ask pond, send, close, Esc Esc, and ask from a selection', async () => {
    const user = userEvent.setup()
    const { rerender, root, client } = renderZenSurface()
    await waitComposerReady()
    const field = await findTextBlock()
    const pageTextBefore = field.textContent

    fireEvent.click(screen.getByRole('button', { name: 'enter' }))

    // STEP 1/2 — one pill, its six items in 2t's order, every one with an
    // accessible name; the four unwired items are inert.
    const pill = document.querySelector('[data-part="zen-pill"]') as HTMLElement
    expect(pill).not.toBeNull()
    const items = within(pill).getAllByRole('button')
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual([
      'ask pond',
      'editor',
      'attach',
      'type',
      'ground',
      'leave',
    ])
    for (const name of ['editor', 'attach', 'type', 'ground']) {
      const button = within(pill).getByRole('button', { name })
      button.focus()
      expect(document.activeElement).toBe(button)
      expect(button).toHaveAttribute('aria-disabled', 'true')
      await user.click(button)
      expect(button).toHaveAttribute('aria-disabled', 'true')
    }

    // STEP 1 — zen starts quiet: the mark is at rest, nothing asked.
    const askPond = within(pill).getByRole('button', { name: 'ask pond' })
    expect(askPond).toHaveAttribute('aria-pressed', 'false')

    // STEP 3/8 — the first Pond-mark press is what opens the card.
    await user.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))
    expect(askPond.className).toContain('bg-mn-text text-raw-paper')

    const textbox = await screen.findByRole('textbox', { name: 'Message Pond' })
    await user.type(textbox, 'what should i cook')
    await user.keyboard('{Enter}')
    expect(mockSendMessage).toHaveBeenCalledTimes(1)

    mockMessages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'what should i cook' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'try the roasted carrots' }] },
    ]
    rerender(<ZenSurfaceHost root={root} client={client} />)

    expect(await screen.findByText('pond')).toBeInTheDocument()
    expect(screen.getByText('try the roasted carrots')).toBeInTheDocument()
    expect(field.textContent).toBe(pageTextBefore)

    // STEP 4 — "close": the card goes, the mark returns to rest.
    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))
    expect(askPond.className).not.toContain('bg-mn-text text-raw-paper')

    // STEP 5 — reopen; Esc closes the card first, a second Esc leaves zen.
    await user.click(askPond)
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'true'))
    const reopenedTextbox = screen.getByRole('textbox', { name: 'Message Pond' })
    reopenedTextbox.focus()
    fireEvent.keyDown(reopenedTextbox, { key: 'Escape' })
    await waitFor(() => expect(askPond).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.getByRole('button', { name: 'leave' })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('[data-part="zen-pill"]')).toBeNull())

    // STEP 6 — re-enter zen, select a passage, ask pond from the bar.
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    const pill2 = document.querySelector('[data-part="zen-pill"]') as HTMLElement
    const askPond2 = within(pill2).getByRole('button', { name: 'ask pond' })
    expect(askPond2).toHaveAttribute('aria-pressed', 'false')

    selectWord(field, 'wild')
    const toolbar = await screen.findByRole('toolbar', { name: 'selection' })
    const askPondOnBar = within(toolbar).getByRole('button', { name: 'ask pond' })
    await user.click(askPondOnBar)

    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()
    await waitFor(() => expect(askPond2).toHaveAttribute('aria-pressed', 'true'))
  })

  it('zen-entry alone opens nothing: no composer, no proposal, no notice unless asked', async () => {
    renderZenSurface()
    await waitComposerReady()

    // STEP 1/8 — entering zen from the default state (the composer starts
    // open on every mount, unrelated to zen) shows no card: the ancestor
    // `ZenComposerChrome` stays hidden and the mark stays at rest until asked.
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    let pill = document.querySelector('[data-part="zen-pill"]') as HTMLElement
    expect(within(pill).getByRole('button', { name: 'ask pond' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(document.querySelector('[data-part="answer"]')).toBeNull()
    expect(document.querySelector('[data-part="zen-chrome"]')).toHaveClass('hidden')

    fireEvent.click(within(pill).getByRole('button', { name: 'leave' }))
    fireEvent.click(screen.getByRole('button', { name: 'enter' }))
    pill = document.querySelector('[data-part="zen-pill"]') as HTMLElement
    expect(within(pill).getByRole('button', { name: 'ask pond' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(document.querySelector('[data-part="zen-chrome"]')).toHaveClass('hidden')
  })
})
