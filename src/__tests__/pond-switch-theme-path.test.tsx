/**
 * KAN-503 — the path test. The real hosting surface (`WorkspaceShell`, which
 * mounts `Rail`'s `PondSwitcher` and `ShellCommands` together over ONE real
 * `PondProvider`, exactly as `AppLayout` does) on `/workspace`, with
 * `next/navigation`'s `useSearchParams` wired to the real `pushState`/
 * `popstate` (the `workspace-shell-shallow-nav-path.test.tsx` mock pattern)
 * and two fixture ponds: PAPER (`theme: 'paper'`, the column default — no
 * chosen theme) and INK (`theme: 'ink'`, explicit).
 *
 * Walks PATH_STEPS from the paper pond: switch to ink via the switcher →
 * dark; switch to paper via the switcher → stays dark (paper has no chosen
 * theme, so the person's mode stands); toggle light via `useMode`; switch to
 * ink again via ⌘K → dark (⌘K applies it too, not just the switcher). Also
 * confirms `listPonds` never refetches across any switch — a full reload
 * would.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceShell } from '@/components/organisms/WorkspaceShell'
import { useMode } from '@/lib/theme/mode'
import { pagesKey, homeQueryKey } from '@/lib/pages/keys'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import type { PageRow } from '@/lib/pages/tree'

const HOME = { id: 'home-1', title: 'Home' }
const PAPER = { id: 'pond-paper', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0, lastPageId: HOME.id }
const INK = { id: 'pond-ink', name: 'studio', glyph: 'star-01', theme: 'ink', order: 1, lastPageId: HOME.id }

// Same reactive mock as `workspace-shell-shallow-nav-path.test.tsx`: the
// production code (`openWorkspaceUrl`) calls the real `pushState` directly,
// so this only wraps it once (inside the factory, which runs before any of
// the file's own `const`s exist) to notice a push, and listens for
// `popstate` too. `__push` lets the test assert the (unused, off-/workspace)
// `router.push` fallback never fires.
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

// The real `PondProvider` reads `listPonds` from here — only it is mocked;
// `@/lib/pond/context` itself is the real module, so the switcher's row
// click, ⌘K's pond row, and `applyPondTheme` all run for real.
jest.mock('@/lib/pond/client', () => ({
  listPonds: jest.fn(),
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
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
    if (id === 'home-1') return { id: 'home-1', parentId: null, type: 'page', title: 'Home', blocks: [], props: {} }
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
    { id: 'home-1', parent_id: null, type: 'page', title: 'Home', order: 0, updated_at: '' },
  ]
  return {
    ...actual,
    fetchPages: jest.fn().mockResolvedValue(rows),
    insertPageOptimistic: jest.fn(),
  }
})

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Home', blocks: [] }),
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
    regenerate: jest.fn(),
    stop: jest.fn(),
    error: undefined,
    clearError: jest.fn(),
  })),
}))

global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)

import { listPonds } from '@/lib/pond/client'

// Exposes `useMode`'s own toggle as a button — the item's named alternative
// to the (not mounted here) breadcrumb mode control, so the test flips the
// person's own choice through the SAME engine `applyPondTheme` writes into.
function ModeToggleProbe() {
  const { mode, toggleMode } = useMode()
  return (
    <button type="button" onClick={toggleMode}>
      mode: {mode}
    </button>
  )
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  for (const pond of [PAPER, INK]) {
    client.setQueryData(pagesKey(pond.id), [
      { id: HOME.id, parent_id: null, type: 'page', title: HOME.title, order: 0, updated_at: '' },
    ])
    client.setQueryData(homeQueryKey(pond.id), { id: HOME.id, title: HOME.title, blocks: [] })
  }
  client.setQueryData(['page', HOME.id], {
    id: HOME.id,
    parentId: null,
    type: 'page',
    title: HOME.title,
    blocks: [],
    props: {},
  })
  return render(
    <QueryClientProvider client={client}>
      <ModeToggleProbe />
      <WorkspaceShell>{null}</WorkspaceShell>
    </QueryClientProvider>
  )
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('switching into a pond applies its theme (KAN-503 PATH_STEPS, path test)', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    window.history.replaceState(null, '', `${WORKSPACE_PATH}?pond=${PAPER.id}&nodeId=${HOME.id}`)
    jest.mocked(listPonds).mockResolvedValue([PAPER, INK])
  })

  it('switcher: ink → dark; paper → stands dark; toggle → light; ⌘K ink → dark; one listPonds call throughout', async () => {
    const user = userEvent.setup()
    renderShell()

    const switcher = await screen.findByRole('button', { name: /life/ })
    expect(isDark()).toBe(false)

    // Step 1: switch to ink via the switcher.
    await user.click(switcher)
    await user.click(await screen.findByRole('menuitem', { name: /studio/ }))
    await screen.findByRole('button', { name: /studio/ })
    await waitFor(() => expect(isDark()).toBe(true))

    // Step 2: switch to paper (no chosen theme) via the switcher — stands dark.
    await user.click(await screen.findByRole('button', { name: /studio/ }))
    await user.click(await screen.findByRole('menuitem', { name: /life/ }))
    await screen.findByRole('button', { name: /life/ })
    expect(isDark()).toBe(true)

    // Step 3: the person's own mode toggle — light.
    await user.click(screen.getByRole('button', { name: /mode: dark/ }))
    await waitFor(() => expect(isDark()).toBe(false))

    // Step 4: switch to ink again, this time via ⌘K — proves it applies too.
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: 'studio' } })
    await screen.findByRole('option', { name: /^studio pond · switch/ })
    fireEvent.keyDown(input, { key: 'Enter' })

    await screen.findByRole('button', { name: /studio/ })
    await waitFor(() => expect(isDark()).toBe(true))

    // No full reload anywhere in the walk: the provider fetched ponds once.
    expect(listPonds).toHaveBeenCalledTimes(1)
  })
})
