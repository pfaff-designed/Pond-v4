/**
 * KAN-99 fix — the whole-page/passage discriminator is `blockId`, never
 * `range` (`isWholePageReference`, `src/lib/references/reference.ts`): a
 * passage reference can itself carry `range: null` when `SelectionBar`
 * couldn't resolve the selection's editor positions, but it always sets a
 * non-null `blockId`. Mocks `editorForSelection` to always return null, so a
 * real selection here reproduces exactly that shape (`blockId` set, `range`
 * null) without needing a non-editor block fixture.
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

// `SelectionBar` resolves a selection's editor positions through
// `editorForSelection` — returning null here keeps `blockId` (resolved
// separately, off the DOM's own `data-block-id` ancestor) set while `from`/
// `to` (and so `range`) stay undefined/null, exactly a real "position
// unavailable" passage selection.
jest.mock('@/lib/modules/text/active-editor', () => ({
  registerTextEditor: () => () => {},
  onTextEditorRegistered: () => () => {},
  editorForBlock: () => null,
  editorForSelection: () => null,
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

function renderSurface() {
  mockGetPage.mockResolvedValue(PAGE)
  mockListPages.mockResolvedValue([PAGE])
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

const flushAskFocus = () =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

describe('a passage reference with no resolvable range (KAN-99 discriminator fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendMessage.mockClear()
    mockMessages = []
  })
  afterEach(() => clearSelection())

  it('still shows its quoted label, is never deduped against the current-page chip, and sends as a passage', async () => {
    const user = userEvent.setup()
    renderSurface()
    await waitComposerReady()
    const field = await findTextBlock()

    // The current page auto-references itself as a whole-page chip first.
    expect(screen.getByRole('button', { name: 'remove reference: Workshop' })).toBeInTheDocument()

    selectWord(field, 'wild')
    await user.click(await screen.findByRole('button', { name: 'ask pond' }))
    await flushAskFocus()

    // Quoted label, not a title-only chip — `isWholePageReference` reads
    // `blockId`, which this selection still set, not the (here null) `range`.
    expect(await screen.findByText('Workshop — “wild”')).toBeInTheDocument()
    // Never deduped away: the redundant whole-page chip for the same page is
    // dropped instead.
    expect(
      screen.queryByRole('button', { name: 'remove reference: Workshop' })
    ).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'what does this mean?')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))
    const [, { body }] = mockSendMessage.mock.calls[0]
    // Sent as a passage: a non-null `blockId` survives alongside `range: null`.
    expect(body.references).toEqual([
      expect.objectContaining({ pageId: 'page-1', blockId: 'b-text', range: null, quotedText: 'wild' }),
    ])
  })
})
