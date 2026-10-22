/**
 * KAN-451 — opening trash (`?nodeId=__trash__`) must never fire `getPage`
 * against the virtual node: it has no `pages` row, so Supabase 400s. Mirrors
 * `ai-terminal-change-log-node.test.tsx`'s guard for the same `['page', nodeId]`
 * query (AITerminal.tsx `currentPage`), via `isVirtualNodeId`.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TRASH_NODE_ID } from '@/lib/change-log/trash-view'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'nodeId' ? TRASH_NODE_ID : null),
  }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    storage: {
      from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })),
    },
  }),
}))

const mockGetPage = jest.fn().mockResolvedValue(null)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
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

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AITerminal />
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('AITerminal — the virtual trash node', () => {
  it('never calls getPage for the virtual id', async () => {
    renderTerminal()
    openComposerIfClosed()
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled())
    expect(mockGetPage).not.toHaveBeenCalled()
  })
})
