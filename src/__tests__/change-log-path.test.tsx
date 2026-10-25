/**
 * KAN-94 path test — PATH_STEPS 1–5 end to end, against the real hosting
 * surfaces (not the internal helpers directly):
 *
 *  1–4. The real `Rail` beside the real `DocumentPanel`, sharing one
 *       navigable URL (a stateful `next/navigation` fake, not a static one):
 *       clicking `databases` reveals `change log`; clicking that row pushes
 *       the rail's own workspace URL, which the panel reads back through its
 *       own `useSearchParams()` — exactly as the running app's address bar
 *       would — and swaps in `ChangeLogPage`, breadcrumb included.
 *  5.   Separately, the composer's `open_change_log` tool arriving fires the
 *       identical navigation (see `rail-change-log-row.test.tsx`'s and
 *       `open-change-log-composer.test.tsx`'s own, narrower assertions).
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { CHANGE_LOG_NODE_ID } from '@/lib/change-log/log-page'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { workspaceHref, WORKSPACE_PATH } from '@/lib/pages/nav'
import type { Pond } from '@/lib/pond/client'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { withPathProbe } from './helpers/command-path-probe'

// A stateful fake of the two hooks every real nav mock in this repo otherwise
// stubs statically: `push` here actually advances the URL and notifies every
// mounted `useSearchParams()`, the same way the real router's address change
// does — Rail's click and DocumentPanel's read need to see the SAME URL.
jest.mock('next/navigation', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react')
  let current = new URLSearchParams()
  const listeners = new Set<(params: URLSearchParams) => void>()
  const push = jest.fn((href: string) => {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
    current = new URLSearchParams(qs)
    listeners.forEach((listener) => listener(current))
  })
  return {
    __push: push,
    __reset: () => {
      current = new URLSearchParams()
    },
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => {
      const [params, setParams] = useState(current)
      useEffect(() => {
        listeners.add(setParams)
        return () => {
          listeners.delete(setParams)
        }
      }, [])
      return params
    },
  }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
  }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue(null),
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(2),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
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

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [OPEN_CHANGE_LOG_MESSAGE],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

// Imported after the mocks above so AITerminal picks up the mocked `useChat`.
import { AITerminal } from '@/components/organisms/AITerminal'

const mockFetchPages = jest.fn()
const mockListRecords = jest.fn()

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'create_page',
    actor: 'pond',
    targetPageId: null,
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

const AT = '2026-01-01T00:00:00Z'
const ROWS = [
  { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
  { id: 'db-1', parent_id: 'root-db', type: 'page', title: 'ingredients', order: 0, updated_at: AT },
]

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(jest.requireMock('next/navigation') as { __reset: () => void }).__reset()
  mockFetchPages.mockResolvedValue(ROWS)
  mockListRecords.mockResolvedValue([record()])
})

describe('PATH_STEPS 1–4 — the rail opens the change log in the real panel', () => {
  it('clicking databases then change log shows the breadcrumb, title, figure and table', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // Seeded synchronously (not just through the mocked `fetchPages`) so the
    // tree already has `databases` on first paint — the real app's own first
    // render, once the rail's own query has ever resolved once this session.
    client.setQueryData(pagesKey('pond-1'), ROWS)
    render(
      <QueryClientProvider client={client}>
        <PondContext.Provider value={PROVIDER_VALUE}>
          <DeletionUndoProvider>
            <Rail />
            <div data-testid="document-panel">{withPathProbe(<DocumentPanel />)}</div>
          </DeletionUndoProvider>
        </PondContext.Provider>
      </QueryClientProvider>
    )

    const foot = screen.getByRole('tree', { name: 'Databases' })
    fireEvent.click(within(foot).getByRole('treeitem', { name: 'databases' }))
    const changeLogRow = await within(foot).findByRole('treeitem', { name: 'change log' })
    fireEvent.click(changeLogRow)

    const panel = screen.getByTestId('document-panel')
    expect(await screen.findByTestId('command-path')).toHaveTextContent('life › databases › change log')
    expect(within(panel).getByText('change log')).toBeInTheDocument()
    expect(await within(panel).findByTestId('change-log-waiting-count')).toHaveTextContent('2')
    for (const column of ['time', 'what', 'page', 'by', 'status']) {
      expect(within(panel).getByText(column)).toBeInTheDocument()
    }
    expect(await within(panel).findByTestId('change-log-status-rec-1')).toHaveTextContent('accepted')
  })
})

describe('PATH_STEPS 5 — the composer opens the change log', () => {
  // KAN-449: on `/workspace`, this fires `openWorkspaceUrl`, which pushes
  // history shallowly rather than through the mocked router's `push`.
  beforeEach(() => {
    window.history.replaceState(null, '', WORKSPACE_PATH)
  })

  it('"open the change log" fires the same navigation, shallowly', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    render(
      <QueryClientProvider client={queryClient}>
        <AITerminal />
      </QueryClientProvider>
    )

    await waitFor(() =>
      expect(pushStateSpy).toHaveBeenCalledWith(
        null,
        '',
        workspaceHref({ id: CHANGE_LOG_NODE_ID, type: 'page', title: 'change log' })
      )
    )
    const push = (jest.requireMock('next/navigation') as { __push: jest.Mock }).__push
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})
