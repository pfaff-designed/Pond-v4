/**
 * KAN-415: make page (the make-this-a-page accept path, `AITerminal`'s
 * `makePage`) appends a page-link block to the made page's parent, the same
 * write seam the rail's ＋ uses (`rail-add-child-link.test.tsx`).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { appendChildLinkToParent } from '@/lib/pages/child-links'

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'kr-1' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => {
  const pages = [
    { id: 'kr-1', parentId: null, type: 'page', title: 'Kitchen renovation', blocks: [], props: {}, order: 0 },
  ]
  return {
    createPage: jest
      .fn()
      .mockImplementation(
        async (_sb: unknown, _uid: string, input: { title: string; parentId: string | null }) => ({
          id: 'new-page-1',
          parentId: input.parentId,
          type: 'page',
          title: input.title,
          blocks: [],
          props: {},
          order: 99,
        })
      ),
    getPage: jest.fn().mockImplementation(async (_sb: unknown, id: string) => pages.find((p) => p.id === id) ?? null),
    listPages: jest.fn().mockResolvedValue(pages),
  }
})

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkToParent: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendProposal: jest.fn().mockResolvedValue({ id: 'rec-1', status: 'proposed' }),
  getRecordByToolCall: jest.fn().mockResolvedValue({ id: 'rec-1', status: 'proposed' }),
  advanceStatus: jest.fn().mockResolvedValue({ id: 'rec-1' }),
  acceptRecord: jest.fn(),
  acceptCreatePageRecord: jest.fn().mockResolvedValue({ id: 'rec-1', status: 'accepted' }),
  markOutdated: jest.fn(),
}))

jest.mock('@/lib/change-log/undo', () => ({
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const QUESTION = 'what is actually blocking the renovation?'
const PROSE = 'the cabinet quote is what everything else is downstream of.'

type MockMessage = { id: string; role: string; parts: unknown[]; metadata?: unknown }
const mockMessages: MockMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: QUESTION }], metadata: { sentAt: '2026-09-22T07:12:00' } },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: PROSE }], metadata: { read: ['Kitchen renovation'] } },
]

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: jest.fn(),
    regenerate: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
    stop: jest.fn(),
    error: undefined,
    clearError: jest.fn(),
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  global.fetch = jest.fn().mockRejectedValue(new Error('propose-page not mocked in this test'))
})

async function ready() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

it('make page appends a page-link block to the made page’s parent', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AITerminal />
    </QueryClientProvider>
  )
  await ready()

  fireEvent.click(screen.getByRole('button', { name: 'make this a page' }))
  const card = await screen.findByRole('group', { name: /new page — proposed/i })
  fireEvent.click(within(card).getByRole('button', { name: 'make page' }))

  await waitFor(() => expect(appendChildLinkToParent).toHaveBeenCalledTimes(1))
  expect(appendChildLinkToParent).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'kr-1',
    'new-page-1',
    null
  )
})
