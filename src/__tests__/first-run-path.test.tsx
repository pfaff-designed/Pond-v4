/**
 * KAN-195 — the person's path, PATH_STEPS 1–6, end to end through the real
 * surfaces (not `FirstRunHints` or `Cover` in isolation):
 *
 *   - the real workspace shell (`WorkspaceShell`, `shell-reskin.test.tsx`'s
 *     full-shell mock pattern), with the signed-in person's `first_run_done_at`
 *     null, renders the empty-shell hints at the root; choosing a card lands
 *     its copy in the REAL composer (`AITerminal`'s textarea) — prefilled,
 *     unsent, and nothing created (no page, no sent message);
 *   - `Cover`, typed and ↵'d, carries that text across to `/workspace?ask=`
 *     rather than sending it.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = jest.fn()
const replace = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: () => '/workspace',
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}))

let firstRunDoneAt: string | null = null
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    // Only `users` (read by `useFirstRunPending`) is given a real chain; every
    // other table (ponds, palette records, …) gets a harmless, awaitable empty
    // result — these surfaces already tolerate a missing/error read (#318,
    // `listPonds`'s PGRST205 branch), so this is not special test-only leniency.
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { first_run_done_at: firstRunDoneAt }, error: null }),
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
import { FIRST_RUN_HEADING } from '@/components/organisms/FirstRunHints'
import { Cover } from '@/components/organisms/Cover'

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceShell>{null}</WorkspaceShell>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  firstRunDoneAt = null
  push.mockClear()
  replace.mockClear()
  mockCreatePage.mockClear()
  mockSendMessage.mockClear()
})

describe('PATH_STEPS 2 & 4 — the real workspace root, hints, and the composer they fill', () => {
  it('renders the empty-shell hints, and choosing a card lands its copy in the real composer, unsent and creating nothing', async () => {
    renderShell()

    expect(await screen.findByText(FIRST_RUN_HEADING)).toBeInTheDocument()

    const textarea = await screen.findByPlaceholderText(/ask pond, or \/ for blocks/i)
    await waitFor(() => expect(textarea).toBeEnabled())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /a project/i }))

    await waitFor(() =>
      expect(textarea).toHaveValue('a project, something with a finish line')
    )
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockCreatePage).not.toHaveBeenCalled()
  })
})

describe('PATH_STEPS 1 & 3 — the cover carries typed text across, unsent', () => {
  it('opens the shell bare on an empty ↵', async () => {
    const user = userEvent.setup()
    render(<Cover />)

    await user.click(screen.getByLabelText('ask pond'))
    await user.keyboard('{Enter}')

    expect(push).toHaveBeenCalledWith('/workspace')
  })

  it('types then ↵s, and the text rides the navigation unsent', async () => {
    const user = userEvent.setup()
    render(<Cover />)

    await user.type(screen.getByLabelText('ask pond'), 'plan a garden')
    await user.keyboard('{Enter}')

    expect(push).toHaveBeenCalledWith('/workspace?ask=plan%20a%20garden')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})
