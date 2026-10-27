/**
 * KAN-473 path test — PATH_STEPS end to end, the real `WorkspaceShell` (same
 * mount `WorkspaceShellShallowNav`'s KAN-449 test uses: rail + `DocumentPanel`
 * + `ShellCommands`/`PondCommand` together). ⌘K → type a phrase that only
 * lives in a block's body → the `in pages` group appears below the title
 * groups, path + underlined snippet → ↵ opens that page at the matched
 * block's hash, scrolled and selected — the same ring `kan-367-path.test.tsx`
 * and `kan-473-arrival-selected.test.tsx` assert for `selectBlockAt`.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { pagesKey, homeQueryKey } from '@/lib/pages/keys'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import { blockDomId } from '@/lib/modules/block-dom'
import type { PageRow } from '@/lib/pages/tree'

// A reactive `next/navigation` mock driven by the REAL `window.history`
// (`workspace-shell-shallow-nav-path.test.tsx`'s own rig) — `openWorkspaceUrl`
// calls the real `pushState` directly, including the block's `#block-<id>`
// hash, so `useSearchParams` needs to notice that and re-render.
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

// `jest.mock` factories below are hoisted above every `const` in this file —
// each one uses its own literal ids rather than closing over these.
const KITCHEN = { id: 'kitchen', title: 'kitchen' }
const ELECTRICIAN = { id: 'electrician', title: 'electrician' }
const JOURNAL = { id: 'journal', title: 'journal' }
const BLOCK_ID = 'b1'
const SNIPPET = 'call the electrician for the second fix'

// Named `mockRpc` (not `rpc`) so babel-plugin-jest-hoist hoists this
// declaration alongside the `jest.mock` calls above, which are themselves
// hoisted above every `import` — the module graph `import { WorkspaceShell }`
// pulls in requires `@/lib/supabase/client` before an ordinarily-named
// `const` below it would exist yet.
const mockRpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
  if (
    fn === 'search_page_blocks' &&
    typeof args.p_query === 'string' &&
    args.p_query.includes('second fix')
  ) {
    return { data: [{ page_id: 'electrician', block_id: 'b1', snippet: SNIPPET }], error: null }
  }
  return { data: [], error: null }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
    rpc: mockRpc,
    // Only `markChildLinksMigrated`'s `pages` read/update reaches this in the
    // path test, for every page it opens — a no-op chain is enough.
    from: jest.fn(() => {
      const tail = Object.assign(Promise.resolve({ data: null, error: null }), {
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
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
  // Literal ids/titles — this factory is hoisted above the file's own
  // `const`s (`workspace-shell-shallow-nav-path.test.tsx`'s same rig), so it
  // cannot close over `JOURNAL`/`KITCHEN`/`ELECTRICIAN` below.
  getPage: jest.fn(async (_supabase: unknown, id: string) => {
    if (id === 'journal')
      return { id: 'journal', parentId: null, type: 'page', title: 'journal', blocks: [], props: {} }
    if (id === 'kitchen')
      return { id: 'kitchen', parentId: null, type: 'page', title: 'kitchen', blocks: [], props: {} }
    if (id === 'electrician')
      return {
        id: 'electrician',
        parentId: 'kitchen',
        type: 'page',
        title: 'electrician',
        blocks: [{ id: 'b1', type: 'text', content: 'call the electrician for the second fix' }],
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

jest.mock('@/lib/pages/palette-records', () => ({
  ...jest.requireActual('@/lib/pages/palette-records'),
  searchRecords: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/pages/tree', () => {
  const actual = jest.requireActual('@/lib/pages/tree')
  const rows: PageRow[] = [
    { id: 'journal', parent_id: null, type: 'page', title: 'journal', order: 0, updated_at: '' },
    { id: 'kitchen', parent_id: null, type: 'page', title: 'kitchen', order: 1, updated_at: '' },
    {
      id: 'electrician',
      parent_id: 'kitchen',
      type: 'page',
      title: 'electrician',
      order: 0,
      updated_at: '',
    },
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
  client.setQueryData(pagesKey('pond-1'), [
    { id: JOURNAL.id, parent_id: null, type: 'page', title: JOURNAL.title, order: 0, updated_at: '' },
    { id: KITCHEN.id, parent_id: null, type: 'page', title: KITCHEN.title, order: 1, updated_at: '' },
    {
      id: ELECTRICIAN.id,
      parent_id: KITCHEN.id,
      type: 'page',
      title: ELECTRICIAN.title,
      order: 0,
      updated_at: '',
    },
  ])
  client.setQueryData(homeQueryKey('pond-1'), { id: 'home-1', title: 'life', blocks: [] })
  client.setQueryData(['page', JOURNAL.id], {
    id: JOURNAL.id,
    parentId: null,
    type: 'page',
    title: JOURNAL.title,
    blocks: [],
    props: {},
  })
  client.setQueryData(['page', ELECTRICIAN.id], {
    id: ELECTRICIAN.id,
    parentId: KITCHEN.id,
    type: 'page',
    title: ELECTRICIAN.title,
    blocks: [{ id: BLOCK_ID, type: 'text', content: SNIPPET }],
    props: {},
  })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceShell>{null}</WorkspaceShell>
    </QueryClientProvider>
  )
}

const groups = () =>
  [...document.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)

describe('KAN-473 path test — ⌘K finds a block\'s text and ↵ opens the page selected there', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (
        fn === 'search_page_blocks' &&
        typeof args.p_query === 'string' &&
        args.p_query.includes('second fix')
      ) {
        return {
          data: [{ page_id: ELECTRICIAN.id, block_id: BLOCK_ID, snippet: SNIPPET }],
          error: null,
        }
      }
      return { data: [], error: null }
    })
    window.history.replaceState({}, '', `${WORKSPACE_PATH}?nodeId=${JOURNAL.id}&pond=pond-1`)
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('walks PATH_STEPS: types a block-only phrase, opens the `in pages` row, lands on the block selected', async () => {
    const user = userEvent.setup()
    renderShell()

    const title = () => screen.getByRole('textbox', { name: 'Page title' })
    expect(await screen.findByDisplayValue(JOURNAL.title)).toBe(title())

    // ⌘K → type a phrase that only lives in the block body, never a page
    // title: no `pages`/`records` group competes for the same row.
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'second fix')

    // An option's accessible name is its label AND sub text together
    // (`palette-records-ponds.test.tsx`'s own `rowNamed` is a regex for the
    // same reason) — match the path only, as a substring.
    const row = await screen.findByRole('option', {
      name: new RegExp(`${KITCHEN.title} › ${ELECTRICIAN.title}`),
    })
    expect(groups()).toEqual(['in pages', 'actions'])
    expect(row.getAttribute('data-kind')).toBe('block')
    expect(row.getAttribute('aria-selected')).toBe('true')

    const hits = [...row.querySelectorAll('[data-part="sub"] span')].filter((s) =>
      s.className.includes('underline')
    )
    expect(hits.map((h) => h.textContent)).toEqual(['second fix'])

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(window.location.search).toContain(`nodeId=${ELECTRICIAN.id}`)
    )
    expect(window.location.hash).toBe(`#${blockDomId(BLOCK_ID)}`)
    expect(await screen.findByDisplayValue(ELECTRICIAN.title)).toBe(title())
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())

    const blockRoot = document.getElementById(blockDomId(BLOCK_ID))!
    await waitFor(() => expect(blockRoot).toHaveFocus())
    const prose = blockRoot.querySelector('[data-part="prose"]')!
    // The same ring `kan-367-path.test.tsx` and `kan-473-arrival-selected.test.tsx`
    // assert for an explicit `selectBlockAt` selection.
    expect(prose).toHaveClass('ring-2', 'ring-mn-text', 'rounded-[20px]')
  }, 10000)

  it('selecting an in-pages row for a block on the page already open still lands on it', async () => {
    // KAN-473 regression: `openWorkspaceUrl`'s same-path/same-search no-op
    // guard used to swallow this open outright — no hash, no pushState — so
    // ⌘K → an `in pages` match on the open page → ↵ did nothing.
    window.history.replaceState(
      {},
      '',
      `${WORKSPACE_PATH}?nodeType=page&nodeId=${ELECTRICIAN.id}&nodeName=${ELECTRICIAN.title}&pond=pond-1`
    )
    const user = userEvent.setup()
    renderShell()

    const title = () => screen.getByRole('textbox', { name: 'Page title' })
    expect(await screen.findByDisplayValue(ELECTRICIAN.title)).toBe(title())

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'second fix')

    const row = await screen.findByRole('option', {
      name: new RegExp(`${KITCHEN.title} › ${ELECTRICIAN.title}`),
    })
    expect(row.getAttribute('data-kind')).toBe('block')

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(window.location.hash).toBe(`#${blockDomId(BLOCK_ID)}`))
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())

    const blockRoot = document.getElementById(blockDomId(BLOCK_ID))!
    await waitFor(() => expect(blockRoot).toHaveFocus())
  }, 10000)
})
