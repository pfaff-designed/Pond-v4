/**
 * KAN-568 path test — PATH_STEPS walked against the real `WorkspaceShell`
 * (rail + `DocumentPanel` + `ShellCommands` together, exactly as `AppLayout`
 * mounts them), driven by the real `window.history` like
 * `kan-476-path.test.tsx`/`workspace-shell-shallow-nav-path.test.tsx`: open A,
 * a rail click navigates to B (a real navigation, recorded onto the session's
 * history stack), ⌘K `back` ↵ lands on A, ⌘K `forward` ↵ lands back on B. The
 * two standing rows also carry the platform's own ⌘[ / ⌘] glyph.
 */

import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { homeQueryKey, pagesKey } from '@/lib/pages/keys'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import { formatChord } from '@/lib/shell-commands'
import type { PageRow } from '@/lib/pages/tree'

// Jest hoists `jest.mock` factories above these — any fixture a factory below
// reads must be a literal, not a reference to one of these `const`s.
const PAGE_A = { id: 'page-a', title: 'Page A' }
const PAGE_B = { id: 'page-b', title: 'Page B' }
const POND_ID = 'pond-1'

// A reactive `next/navigation` mock driven by the REAL `window.history`, same
// shape as `kan-476-path.test.tsx`: the production code (`openWorkspaceUrl`)
// calls the real `pushState` directly, so this mock only needs to notice it
// fired and re-render `useSearchParams`' readers.
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
    if (id === 'page-a')
      return { id: 'page-a', parentId: null, type: 'page', title: 'Page A', blocks: [], order: 0, props: {} }
    if (id === 'page-b')
      return { id: 'page-b', parentId: null, type: 'page', title: 'Page B', blocks: [], order: 1, props: {} }
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

jest.mock('@/lib/pages/child-links', () => ({
  ...jest.requireActual('@/lib/pages/child-links'),
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
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

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(pagesKey(POND_ID), [
    { id: PAGE_A.id, parent_id: null, type: 'page', title: PAGE_A.title, order: 0, updated_at: '' },
    { id: PAGE_B.id, parent_id: null, type: 'page', title: PAGE_B.title, order: 1, updated_at: '' },
  ])
  client.setQueryData(homeQueryKey(POND_ID), { id: 'home-1', title: 'life', blocks: [] })
  client.setQueryData(['page', PAGE_A.id], {
    id: PAGE_A.id,
    parentId: null,
    type: 'page',
    title: PAGE_A.title,
    blocks: [],
    order: 0,
    props: {},
  })
  client.setQueryData(['page', PAGE_B.id], {
    id: PAGE_B.id,
    parentId: null,
    type: 'page',
    title: PAGE_B.title,
    blocks: [],
    order: 1,
    props: {},
  })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceShell>{null}</WorkspaceShell>
    </QueryClientProvider>
  )
}

const openPalette = () => fireEvent.keyDown(document, { key: 'k', metaKey: true })
// `getByText` with a `selector` can't tell "back" from "back to…" by exact label —
// an exact-text filter over every row's own label span can.
const paletteRowLabelled = (label: string): HTMLElement => {
  const span = Array.from(document.querySelectorAll('[data-part="label"]')).find(
    (el) => el.textContent === label
  )
  if (!span) throw new Error(`no palette row labelled "${label}"`)
  return span.closest('[role="option"]') as HTMLElement
}

describe('KAN-568 path test — ⌘K back/forward step the session’s own navigation history', () => {
  const push = (jest.requireMock('next/navigation') as { __push: jest.Mock }).__push

  beforeEach(() => {
    push.mockClear()
    window.history.replaceState(null, '', `${WORKSPACE_PATH}?nodeId=${PAGE_A.id}`)
    onPlatform('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('walks PATH_STEPS: open A, navigate to B, ⌘K back → A, ⌘K forward → B — both rows carry ⌘[/⌘]', async () => {
    renderShell()

    const title = () => screen.getByRole('textbox', { name: 'Page title' })
    expect(await screen.findByDisplayValue(PAGE_A.title)).toBe(title())

    // Open page B — a real navigation, recorded onto the session's history stack.
    const tree = screen.getByRole('tree', { name: 'Workspace' })
    fireEvent.click(within(tree).getByRole('treeitem', { name: PAGE_B.title }))
    expect(await screen.findByDisplayValue(PAGE_B.title)).toBe(title())

    // ⌘K, the actions-only list: neither standing row is the active row here
    // (it lands on the first action), so both still show their own hint —
    // the live `formatChord('mod+[')`/`formatChord('mod+]')` read, not a
    // hardcoded glyph.
    openPalette()
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: '>' } })
    const backRow = paletteRowLabelled('back')
    const forwardRow = paletteRowLabelled('forward')
    expect(within(backRow).getByText(formatChord('mod+['))).toBeInTheDocument()
    expect(within(forwardRow).getByText(formatChord('mod+]'))).toBeInTheDocument()

    // ⌘K → back → lands on A.
    fireEvent.change(input, { target: { value: 'back' } })
    expect(await screen.findByRole('option', { name: /^>\s*back\s/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByDisplayValue(PAGE_A.title)).toBe(title())
    expect(push).not.toHaveBeenCalled()

    // ⌘K → forward → lands back on B.
    openPalette()
    const input2 = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input2, { target: { value: 'forward' } })
    expect(await screen.findByRole('option', { name: /^>\s*forward\s/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input2, { key: 'Enter' })

    expect(await screen.findByDisplayValue(PAGE_B.title)).toBe(title())
    expect(push).not.toHaveBeenCalled()
  })
})
