/**
 * KAN-449 — the path test, PATH_STEPS 1–5 end to end: the real `WorkspaceShell`
 * (rail + `DocumentPanel` together, exactly as `AppLayout` mounts them), a rail
 * row click switches the open page with no `router.push` call, and a browser
 * back (`popstate`) restores the page that was open before the click — all
 * driven by the real `window.history`, not a stand-in `nodeId` ref.
 */

import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { pagesKey, homeQueryKey } from '@/lib/pages/keys'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import type { PageRow } from '@/lib/pages/tree'

const PAGE_A = { id: 'page-a', title: 'Page A' }
const PAGE_B = { id: 'page-b', title: 'Page B' }
const POND_ID = 'pond-1'

// A reactive `next/navigation` mock driven by the REAL `window.history`: the
// production code (`openWorkspaceUrl`) calls the real `pushState` directly, so
// this mock only needs to notice it fired (by wrapping it once, inside the
// factory itself — a jest.mock factory runs before any of the file's own
// `const`s are initialized, so it cannot close over them) and notice a
// `popstate` (the browser's own back/forward signal) — it never stands in its
// own copy of the URL the way other suites' `mockNodeId` do, because this is
// the one test proving back through the real API.
// `__push` is exposed on the mocked module so the test can assert on it.
jest.mock('next/navigation', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react')
  const push = jest.fn()
  const navListeners = new Set<() => void>()
  function notifyNav() {
    navListeners.forEach((listener) => listener())
  }
  const realPushState = window.history.pushState.bind(window.history)
  window.history.pushState = function pushStateAndNotify(...args: Parameters<typeof realPushState>) {
    realPushState(...args)
    notifyNav()
  }
  window.addEventListener('popstate', notifyNav)
  return {
    __push: push,
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => {
      const [, forceRender] = useState(0)
      useEffect(() => {
        const listener = () => forceRender((n: number) => n + 1)
        navListeners.add(listener)
        return () => {
          navListeners.delete(listener)
        }
      }, [])
      return new URLSearchParams(window.location.search)
    },
  }
})

jest.mock('@/lib/pond/context', () => ({
  PondProvider: ({ children }: { children: React.ReactNode }) => children,
  usePond: () => ({
    pond: { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] },
    ponds: [],
    loading: false,
    reload: () => {},
    addPond: () => {},
  }),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'life' }))
jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
  listPonds: jest.fn().mockResolvedValue([]),
  setPondLastPage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    // Only `markChildLinksMigrated`'s `pages` read/update reaches this in the
    // path test, for every page it opens — a no-op chain is enough. `eq()` is
    // the chain's one shared tail: `.select().eq().maybeSingle()` and
    // `.update().eq()` (awaited directly, no `.maybeSingle()`) both end there.
    from: jest.fn(() => {
      const tail = Object.assign(Promise.resolve({ data: null, error: null }), {
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      })
      const chain = {
        select: () => chain,
        update: () => chain,
        eq: () => tail,
      }
      return chain
    }),
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async (_supabase: unknown, id: string) => {
    if (id === 'page-a') return { id: 'page-a', parentId: null, type: 'page', title: 'Page A', blocks: [], props: {} }
    if (id === 'page-b') return { id: 'page-b', parentId: null, type: 'page', title: 'Page B', blocks: [], props: {} }
    return null
  }),
  listPages: jest.fn().mockResolvedValue([]),
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => {
  const actual = jest.requireActual('@/lib/pages/tree')
  const rows: PageRow[] = [
    { id: 'page-a', parent_id: null, type: 'page', title: 'Page A', order: 0, updated_at: '' },
    { id: 'page-b', parent_id: null, type: 'page', title: 'Page B', order: 1, updated_at: '' },
  ]
  return {
    ...actual,
    fetchPages: jest.fn().mockResolvedValue(rows),
    insertPageOptimistic: jest.fn(),
  }
})

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'life', blocks: [] }),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/lib/templates/instantiate', () => ({
  instantiateTemplate: jest.fn(),
}))

jest.mock('@/lib/change-log/store', () => {
  const actual = jest.requireActual('@/lib/change-log/store')
  return {
    ...actual,
    getRecord: jest.fn().mockResolvedValue(null),
    markOutdated: jest.fn().mockResolvedValue([]),
    appendOwnEdit: jest.fn().mockResolvedValue(undefined),
    listRecords: jest.fn().mockResolvedValue([]),
    countWaiting: jest.fn().mockResolvedValue(0),
  }
})
jest.mock('@/lib/change-log/revert', () => ({
  acceptRevert: jest.fn(),
  proposeRevert: jest.fn(),
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

jest.mock('@/lib/deletion/notify-bridge', () => {
  const actual = jest.requireActual('@/lib/deletion/notify-bridge')
  return { ...actual, requestNotify: jest.fn() }
})

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  // Pre-warmed so switching the open page reads from cache, same as the real
  // app once the rail's own query has resolved once this session — proving the
  // click repaints with no round trip, not just a slower eventual load.
  client.setQueryData(pagesKey(POND_ID), [
    { id: PAGE_A.id, parent_id: null, type: 'page', title: PAGE_A.title, order: 0, updated_at: '' },
    { id: PAGE_B.id, parent_id: null, type: 'page', title: PAGE_B.title, order: 1, updated_at: '' },
  ])
  client.setQueryData(homeQueryKey(POND_ID), { id: 'home-1', title: 'life', blocks: [] })
  client.setQueryData(['page', PAGE_A.id], { id: PAGE_A.id, parentId: null, type: 'page', title: PAGE_A.title, blocks: [], props: {} })
  client.setQueryData(['page', PAGE_B.id], { id: PAGE_B.id, parentId: null, type: 'page', title: PAGE_B.title, blocks: [], props: {} })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceShell>{null}</WorkspaceShell>
    </QueryClientProvider>
  )
}

describe('WorkspaceShell — a rail click switches pages with no RSC round trip (KAN-449 PATH_STEPS 1–5)', () => {
  const push = (jest.requireMock('next/navigation') as { __push: jest.Mock }).__push

  beforeEach(() => {
    push.mockClear()
    window.history.replaceState(null, '', `${WORKSPACE_PATH}?nodeId=${PAGE_A.id}`)
  })

  it('rail click paints page B with no router.push, and browser back restores page A', async () => {
    renderShell()

    const title = () => screen.getByRole('textbox', { name: 'Page title' })
    expect(await screen.findByDisplayValue(PAGE_A.title)).toBe(title())
    // The address the browser would return to on back — captured before the
    // click, exactly what it would hold in the entry below the one the click
    // pushes.
    const hrefForA = window.location.pathname + window.location.search

    const tree = screen.getByRole('tree', { name: 'Workspace' })
    fireEvent.click(within(tree).getByRole('treeitem', { name: PAGE_B.title }))

    expect(await screen.findByDisplayValue(PAGE_B.title)).toBe(title())
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(within(tree).getByRole('treeitem', { name: PAGE_B.title })) // no-op guard: still on B
    expect(title()).toHaveValue(PAGE_B.title)

    // Browser back: jsdom's own `history.back()` does not traverse entries
    // (confirmed: the location never moves), so this mirrors what the real
    // browser does instead — restore the entry's address, then fire the
    // `popstate` the browser fires for you, with no `pushState` in between
    // (back never pushes a new entry).
    window.history.replaceState(null, '', hrefForA)
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(await screen.findByDisplayValue(PAGE_A.title)).toBe(title())
    expect(push).not.toHaveBeenCalled()
  })
})
