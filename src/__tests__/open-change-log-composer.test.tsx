/**
 * KAN-94 — the composer's `open_change_log` entry point. Client-resolved (no
 * execute): the moment the call streams in as `input-available`, AITerminal
 * pushes the same workspace URL the rail's change-log row pushes (see
 * `rail-change-log-row.test.tsx`'s sibling assertion), with no card and no
 * user decision in between.
 *
 * Same minimal harness as `AITerminal.test.tsx` (useChat, supabase client,
 * pages client, conversation client, a query client) — `next/navigation`'s
 * push is captured so the test can assert on it, and `useChat` returns a
 * fixed thread carrying the tool call.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { workspaceHref } from '@/lib/pages/nav'

const mockRouterPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => ({ get: jest.fn().mockReturnValue(null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn().mockResolvedValue(null),
  listPages: jest.fn().mockResolvedValue([]),
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

const OPEN_CHANGE_LOG_MESSAGE = {
  id: 'a1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-open_change_log',
      toolCallId: 'call-1',
      state: 'input-available',
      input: {},
    },
  ],
}

// Stateful, unlike the repo's usual static useChat stub: the restored-transcript
// test below needs `messages` to reflect AITerminal's own `setMessages(conversation.messages)`
// call on the SAME render as `initialMessageIds` updates (both are set together in the
// mount effect), not a value fixed before the conversation ever resolves.
let mockMessages: unknown[] = [OPEN_CHANGE_LOG_MESSAGE]
const mockSetMessages = jest.fn((next: unknown[] | ((prev: unknown[]) => unknown[])) => {
  mockMessages = typeof next === 'function' ? next(mockMessages) : next
})

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: mockSetMessages,
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { getOrCreateConversation } from '@/lib/conversation/client'
const mockGetOrCreateConversation = getOrCreateConversation as jest.Mock

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

describe('AITerminal — open_change_log navigates on arrival (KAN-94)', () => {
  afterEach(() => {
    mockRouterPush.mockClear()
    mockSetMessages.mockClear()
    mockMessages = [OPEN_CHANGE_LOG_MESSAGE]
    mockGetOrCreateConversation.mockReset().mockResolvedValue({
      id: 'conv-1',
      messages: [],
      resolutions: { changes: {}, creates: {}, skipped: {} },
    })
  })

  it('pushes the change log workspace URL, with no card and no user decision', async () => {
    renderTerminal()

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(
        workspaceHref({ id: CHANGE_LOG_NODE_ID, type: 'page', title: 'change log' })
      )
    )
  })

  it('does not re-navigate for a call restored from a saved transcript', async () => {
    // The message does not exist until the saved thread loads — unlike the
    // "fresh call" case above, it must not be present from the first render.
    mockMessages = []
    mockGetOrCreateConversation.mockReset().mockResolvedValue({
      id: 'conv-1',
      messages: [OPEN_CHANGE_LOG_MESSAGE],
      resolutions: { changes: {}, creates: {}, skipped: {} },
    })

    renderTerminal()

    // The mount effect seeds `setMessages` and `initialMessageIds` together;
    // wait for that restore to land before asserting nothing navigated.
    await waitFor(() => expect(mockSetMessages).toHaveBeenCalledWith([OPEN_CHANGE_LOG_MESSAGE]))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})
