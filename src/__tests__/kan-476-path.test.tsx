/**
 * KAN-476 path test — PATH_STEPS walked against the real `WorkspaceShell`
 * (Rail + DocumentPanel + ShellCommands together, exactly as `AppLayout`
 * mounts them), driven by the real `window.history` like
 * `workspace-shell-shallow-nav-path.test.tsx`: gutters is open under house ›
 * roof. With the caret in the real text block, ⌘⇧↑ selects text and does not
 * navigate; leaving the editor, ⌘⇧↑ opens roof; the rail-focus chord (⌘⇧\)
 * then focuses roof's row (no `isEditableField` guard — it fires from the
 * editor too, and Esc returns the caret there); ↓ moves to its child row
 * (gutters, still revealed from the original open); ↵ opens it.
 *
 * SCOPE CUT (orchestrator split): the ⌘K back/forward rows are a child
 * ticket — not walked or built here.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { homeQueryKey, pagesKey } from '@/lib/pages/keys'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import type { PageRow } from '@/lib/pages/tree'

// Jest hoists `jest.mock` factories above these — any fixture a factory below
// reads must be a literal, not a reference to one of these `const`s.
const HOUSE = { id: 'house', title: 'house' }
const ROOF = { id: 'roof', title: 'roof' }
const GUTTERS = { id: 'gutters', title: 'gutters' }
const POND_ID = 'pond-1'

// A reactive `next/navigation` mock driven by the REAL `window.history`, same
// shape as `workspace-shell-shallow-nav-path.test.tsx`: the production code
// (`openWorkspaceUrl`) calls the real `pushState` directly, so this mock only
// needs to notice it fired and re-render `useSearchParams`' readers.
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
    if (id === 'house')
      return { id: 'house', parentId: null, type: 'page', title: 'house', blocks: [], order: 0, props: {} }
    if (id === 'roof')
      return {
        id: 'roof',
        parentId: 'house',
        type: 'page',
        title: 'roof',
        blocks: [{ id: 'b-roof', type: 'text', content: 'shingles' }],
        order: 0,
        props: {},
      }
    if (id === 'gutters')
      return {
        id: 'gutters',
        parentId: 'roof',
        type: 'page',
        title: 'gutters',
        blocks: [{ id: 'b-caret', type: 'text', content: 'flashing' }],
        order: 0,
        props: {},
      }
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
    { id: 'house', parent_id: null, type: 'page', title: 'house', order: 0, updated_at: '' },
    { id: 'roof', parent_id: 'house', type: 'page', title: 'roof', order: 0, updated_at: '' },
    { id: 'gutters', parent_id: 'roof', type: 'page', title: 'gutters', order: 0, updated_at: '' },
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
    { id: HOUSE.id, parent_id: null, type: 'page', title: HOUSE.title, order: 0, updated_at: '' },
    { id: ROOF.id, parent_id: HOUSE.id, type: 'page', title: ROOF.title, order: 0, updated_at: '' },
    { id: GUTTERS.id, parent_id: ROOF.id, type: 'page', title: GUTTERS.title, order: 0, updated_at: '' },
  ])
  client.setQueryData(homeQueryKey(POND_ID), { id: 'home-1', title: 'life', blocks: [] })
  client.setQueryData(['page', HOUSE.id], {
    id: HOUSE.id,
    parentId: null,
    type: 'page',
    title: HOUSE.title,
    blocks: [],
    order: 0,
    props: {},
  })
  client.setQueryData(['page', ROOF.id], {
    id: ROOF.id,
    parentId: HOUSE.id,
    type: 'page',
    title: ROOF.title,
    blocks: [{ id: 'b-roof', type: 'text', content: 'shingles' }],
    order: 0,
    props: {},
  })
  client.setQueryData(['page', GUTTERS.id], {
    id: GUTTERS.id,
    parentId: ROOF.id,
    type: 'page',
    title: GUTTERS.title,
    blocks: [{ id: 'b-caret', type: 'text', content: 'flashing' }],
    order: 0,
    props: {},
  })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceShell>{null}</WorkspaceShell>
    </QueryClientProvider>
  )
}

const pressGoToParent = () => fireEvent.keyDown(document, { key: 'ArrowUp', metaKey: true, shiftKey: true })
const pressRailFocus = () => fireEvent.keyDown(document, { key: '\\', metaKey: true, shiftKey: true })
const nodeIdInUrl = () => new URLSearchParams(window.location.search).get('nodeId')

describe('KAN-476 path test — go-to-parent and the rail-focus chord, walked on the real workspace shell', () => {
  const push = (jest.requireMock('next/navigation') as { __push: jest.Mock }).__push

  beforeEach(() => {
    push.mockClear()
    window.history.replaceState(null, '', `${WORKSPACE_PATH}?nodeId=${GUTTERS.id}`)
    onPlatform('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('walks PATH_STEPS: caret ⌘⇧↑ does not navigate, leaving it does, the rail chord focuses the row, ↓ then ↵ opens the next page', async () => {
    renderShell()

    const title = () => screen.getByRole('textbox', { name: 'Page title' })
    expect(await screen.findByDisplayValue(GUTTERS.title)).toBe(title())

    // Caret in the real text block: ⌘⇧↑ keeps its native "select to start"
    // meaning — Pond must not navigate.
    const field = await screen.findByRole('textbox', { name: 'text block' })
    act(() => field.focus())
    await waitFor(() => expect(field).toHaveFocus())

    pressGoToParent()

    expect(nodeIdInUrl()).toBe(GUTTERS.id)
    expect(push).not.toHaveBeenCalled()

    // Leave the editor (the ticket's "Esc/click chrome" step).
    act(() => field.blur())
    expect(field).not.toHaveFocus()

    pressGoToParent()

    await waitFor(() => expect(nodeIdInUrl()).toBe(ROOF.id))
    expect(push).not.toHaveBeenCalled()
    expect(await screen.findByDisplayValue(ROOF.title)).toBe(title())

    // The rail-focus chord focuses roof's row — re-asserted from the editor too
    // (no `isEditableField` guard), and Esc returns the caret there.
    const roofField = await screen.findByRole('textbox', { name: 'text block' })
    act(() => roofField.focus())
    await waitFor(() => expect(roofField).toHaveFocus())

    pressRailFocus()

    const tree = screen.getByRole('tree', { name: 'Workspace' })
    const roofRow = within(tree).getByRole('treeitem', { name: ROOF.title })
    await waitFor(() => expect(roofRow).toHaveFocus())

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(roofField).toHaveFocus()

    // Press the chord again (not from the editor this time) and walk the rail:
    // ↓ to gutters' row — still revealed from the original open — then ↵ opens it.
    pressRailFocus()
    await waitFor(() => expect(within(tree).getByRole('treeitem', { name: ROOF.title })).toHaveFocus())

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    const guttersRow = within(tree).getByRole('treeitem', { name: GUTTERS.title })
    expect(guttersRow).toHaveFocus()

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

    await waitFor(() => expect(nodeIdInUrl()).toBe(GUTTERS.id))
    expect(await screen.findByDisplayValue(GUTTERS.title)).toBe(title())
  })
})
