/**
 * KAN-415: accepting a `create_page` tool proposal (`AITerminal`'s
 * `acceptCreatePage`) appends a page-link block to the resolved parent — but
 * only when the proposed `type` is `'page'`; a database/record made this way
 * is not a "page under a parent" for this rule (orchestrator note).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { appendChildLinkUnder } from '@/lib/pages/child-links'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest
    .fn()
    .mockResolvedValue([
      { id: 'kr-1', parentId: null, type: 'page', title: 'Kitchen renovation', blocks: [], props: {}, order: 0 },
    ]),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

const mockCreatePageFromProposal = jest.fn()
jest.mock('@/lib/pages/create-page', () => ({
  createPageFromProposal: (...args: unknown[]) => mockCreatePageFromProposal(...args),
  defineSchemaFromProposal: jest.fn(),
  addRowFromProposal: jest.fn(),
  collectionTitleResolver: () => () => undefined,
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  listRecordsByToolCalls: jest.fn().mockResolvedValue([]),
  getRecordByToolCall: jest.fn().mockResolvedValue(null),
  advanceStatus: jest.fn(),
  acceptRecord: jest.fn(),
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

jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

type ToolPart = {
  type: string
  toolCallId: string
  state: string
  input: Record<string, unknown>
}
type MockMessage = { id: string; role: string; parts: ToolPart[] }

function createPagePart(toolCallId: string, type: string): ToolPart {
  return {
    type: 'tool-create_page',
    toolCallId,
    state: 'input-available',
    input: {
      type,
      title: 'Spice rack',
      parentTitle: 'Kitchen renovation',
      blocks: [],
    },
  }
}

let mockMessages: MockMessage[] = []

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

function renderTerminal() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AITerminal />
    </QueryClientProvider>
  )
}

it('accepting a page create_page proposal with a parent appends a link', async () => {
  mockMessages = [
    { id: 'a1', role: 'assistant', parts: [createPagePart('call-1', 'page')] },
  ]
  mockCreatePageFromProposal.mockResolvedValue({
    id: 'spice-1',
    parentId: 'kr-1',
    type: 'page',
    title: 'Spice rack',
    blocks: [],
  })

  renderTerminal()
  await ready()

  const card = await screen.findByRole('group', { name: /proposed new page: spice rack/i })
  fireEvent.click(within(card).getByRole('button', { name: 'Create page' }))

  await waitFor(() => expect(appendChildLinkUnder).toHaveBeenCalledTimes(1))
  expect(appendChildLinkUnder).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'kr-1',
    'spice-1',
    null,
    'life'
  )
})

it('accepting a non-page create_page proposal (a database/record) does not append a link', async () => {
  mockMessages = [
    { id: 'a1', role: 'assistant', parts: [createPagePart('call-2', 'routine')] },
  ]
  mockCreatePageFromProposal.mockResolvedValue({
    id: 'routine-1',
    parentId: 'kr-1',
    type: 'routine',
    title: 'Spice rack',
    blocks: [],
  })

  renderTerminal()
  await ready()

  const card = await screen.findByRole('group', { name: /proposed new page: spice rack/i })
  fireEvent.click(within(card).getByRole('button', { name: 'Create page' }))

  await waitFor(() => expect(mockCreatePageFromProposal).toHaveBeenCalledTimes(1))
  expect(appendChildLinkUnder).not.toHaveBeenCalled()
})
