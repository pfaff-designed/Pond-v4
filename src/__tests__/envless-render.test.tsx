/**
 * Issue #38 — envless CI/Storybook must be able to MOUNT the surfaces that talk
 * to Supabase. The REAL `@/lib/supabase/client` is used here (not mocked): with
 * NEXT_PUBLIC_SUPABASE_* deleted, `createClient()` throws at construction, so
 * these tests fail if any of the five formerly-eager sites still constructs the
 * client at render:
 *
 *   - use-collection-rows.ts   (useCollectionRows)
 *   - use-capabilities.ts      (usePageLinkCapabilities)
 *   - AITerminal.tsx
 *   - OverviewSurface.tsx      (LifeHomeCanvas, via LifeOverviewPanel)
 *   - DocumentPanel.tsx
 *
 * Construction is deferred into the queryFn / handler: a query that actually
 * RUNS envless settles as a query error (not a render crash), and a handler
 * invoked envless rejects — the failure surfaces at use-time, exactly like prod.
 */
import React from 'react'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/workspace/context', () => ({ useWorkspace: () => 'main' }))

// The flat page tree read by the rail/overview/capabilities surfaces. Mocked so
// these tests exercise ONLY the supabase-construction seam, not fetchPages' own
// (also envless-failing) client.
const mockFetchPages = jest.fn().mockResolvedValue([])
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...a: unknown[]) => mockFetchPages(...a),
  insertPageOptimistic: jest.fn(),
}))

// AITerminal's chat transport + stream hook (same stubs as handoff-terminal).
jest.mock('@/lib/ai/transports', () => ({
  createMainTransport: () => ({ api: '/api/chat' }),
}))
jest.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  }),
}))

import { useCollectionRows } from '@/lib/modules/view/use-collection-rows'
import { usePageLinkCapabilities } from '@/lib/modules/page-link/use-capabilities'
import { AITerminal } from '@/components/organisms/AITerminal'
import { LifeOverviewPanel } from '@/components/organisms/OverviewSurface'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeAll(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key]
  }
})

// Envless queries/effects log their construction failure (query errors are
// silent; the terminal's conversation-load effect catches to console.error).
let consoleError: jest.SpyInstance
beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => consoleError.mockRestore())

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('envless mounts (#38): no render-time createClient()', () => {
  it('useCollectionRows renders with queries disabled (no collection host)', () => {
    const { result } = renderHook(() => useCollectionRows(undefined), {
      wrapper: wrapper(freshClient()),
    })
    expect(result.current.rows).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('useCollectionRows renders with queries ENABLED — construction fails inside the queryFn, not at render', async () => {
    const { result } = renderHook(() => useCollectionRows('col-1'), {
      wrapper: wrapper(freshClient()),
    })
    // The enabled queries run, fail on client construction, and settle as
    // errors — the hook lands on its empty, not-loading shape without throwing.
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toEqual([])
  })

  it('usePageLinkCapabilities renders; the supabase-using handler rejects at use-time', async () => {
    const { result } = renderHook(() => usePageLinkCapabilities('page-1'), {
      wrapper: wrapper(freshClient()),
    })
    expect(result.current.searchPages('anything')).toEqual([])
    // Deferral, not tolerance: actually USING the client still fails loudly.
    await expect(result.current.createLinkedPage('New page')).rejects.toThrow(
      /URL and API key are required/
    )
  })

  it('AITerminal mounts (conversation load fails into console.error, not a crash)', async () => {
    render(<AITerminal />, { wrapper: wrapper(freshClient()) })
    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(String(consoleError.mock.calls.flat()[0])).toMatch(/URL and API key are required/)
  })

  it('LifeOverviewPanel mounts past loading — LifeHomeCanvas home-row query fails as a query error, not a crash', async () => {
    render(<LifeOverviewPanel />, { wrapper: wrapper(freshClient()) })
    // Past the loading gate: the overview surface (and the LifeHomeCanvas child,
    // whose ['home'] query fails on envless construction) has mounted.
    await screen.findByText(/That’s the whole of it/)
  })

  it('DocumentPanel mounts with no node selected', async () => {
    const { container } = render(
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>,
      { wrapper: wrapper(freshClient()) }
    )
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
