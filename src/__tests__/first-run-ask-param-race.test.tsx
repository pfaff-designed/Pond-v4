/**
 * KAN-195 fix — `WorkspaceShell` renders `DocumentPanel` before `AITerminal`
 * (tree order), so `DocumentPanel`'s mount effect used to call
 * `requestTerminalFocus` before `AITerminal`'s `FOCUS_TERMINAL_EVENT` listener
 * had attached, and the cover's carried text was lost. Proves the pending
 * slot (`terminal-focus.ts`) closes that race: starting at
 * `/workspace?ask=plan%20a%20garden`, the real composer textarea ends up
 * holding the carried text, unsent.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = jest.fn()
const replace = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: () => '/workspace',
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams('ask=plan%20a%20garden'),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { first_run_done_at: null }, error: null }),
            }),
          }),
        }
      }
      const empty = { data: [], error: null }
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        is: () => chain,
        limit: () => chain,
        maybeSingle: async () => empty,
        single: async () => empty,
        then: (resolve: (v: typeof empty) => unknown) => resolve(empty),
      }
      return chain
    },
  }),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
}))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))
const mockCreatePage = jest.fn()
jest.mock('@/lib/pages/client', () => ({
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  deletePage: jest.fn(),
  movePage: jest.fn(),
  getPage: jest.fn().mockResolvedValue({
    id: 'home-1',
    parentId: null,
    type: 'home',
    title: 'Life',
    blocks: [],
    props: {},
  }),
  listPages: jest.fn().mockResolvedValue([]),
  setProperty: jest.fn(),
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
const mockSendMessage = jest.fn()
jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: mockSendMessage,
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  }),
}))

import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  mockCreatePage.mockClear()
  mockSendMessage.mockClear()
})

describe('DocumentPanel vs AITerminal mount race (KAN-195)', () => {
  it('carries the `?ask=` text into the real composer even though DocumentPanel mounts first', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <WorkspaceShell>{null}</WorkspaceShell>
      </QueryClientProvider>
    )

    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    await waitFor(() => expect(textarea).toHaveValue('plan a garden'))
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
