/**
 * KAN-475's own PATH_STEPS, end to end, against the real composed surface: the
 * real `Rail` and the real `ShellCommands` mounted together (same seam as
 * `kan-474-path.test.tsx`), under the real `PondProvider` (same seam as
 * `shell-commands-favourite-page-path.test.tsx`) so the optimistic
 * `patchPond` write is the one both surfaces actually read, not a stub — the
 * band appearing/disappearing is the proof the toggle landed, not that a
 * click handler ran. `next/navigation` is the reactive mock from
 * `workspace-shell-shallow-nav-path.test.tsx`, driven by the real
 * `window.history`, so opening a different page and clicking back through the
 * band are real `pushState` navigations, not a stand-in `nodeId` ref.
 *
 * "After reload" is stood in for by the still-mounted tree still carrying the
 * favourite through an unrelated navigation (PLAN.md's own words for this
 * item) — a real reload would need `fetchPages`/`listPonds` to answer a fresh
 * mount with the same ids, which is exactly what the earlier optimistic write
 * already proved without one.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { PondProvider } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { WORKSPACE_PATH } from '@/lib/pages/nav'
import type { PageRow } from '@/lib/pages/tree'

// A reactive `next/navigation` mock driven by the REAL `window.history` (same
// technique as `workspace-shell-shallow-nav-path.test.tsx`): production code
// calls `window.history.pushState` directly off `/workspace`
// (`openWorkspaceUrl`), so this only needs to notice it fired and re-render
// every `useSearchParams()` reader — never a stand-in copy of the URL.
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
  return {
    useRouter: () => ({ push }),
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

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { undo: jest.fn(), redo: jest.fn() },
}))
jest.mock('@/lib/pages/palette-records', () => ({
  ...jest.requireActual('@/lib/pages/palette-records'),
  searchRecords: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))
jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(),
}))
jest.mock('@/lib/pond/client', () => ({
  ...jest.requireActual('@/lib/pond/client'),
  listPonds: jest.fn(),
  setPondLastPage: jest.fn().mockResolvedValue(undefined),
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
  setPondFavourites: jest.fn().mockResolvedValue(undefined),
}))

import { fetchPages } from '@/lib/pages/tree'
import { listPonds, setPondFavourites, type Pond } from '@/lib/pond/client'

const POND_ID = 'pond-1'
const GROCERIES_ID = 'groceries'
const RECIPES_ID = 'recipes'
const AT = '2026-01-01T00:00:00Z'
const PAGES: PageRow[] = [
  { id: GROCERIES_ID, parent_id: null, type: 'page', title: 'groceries', order: 0, updated_at: AT },
  { id: RECIPES_ID, parent_id: null, type: 'page', title: 'recipes', order: 1, updated_at: AT },
]

function renderPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PondProvider>
        <DeletionUndoProvider>
          <ShellCommands />
          <Rail />
        </DeletionUndoProvider>
      </PondProvider>
    </QueryClientProvider>
  )
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Meta>}k{/Meta}')
  return screen.findByRole('combobox', { name: 'command palette' })
}

async function findFavouriteRow(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  const input = await openPalette(user)
  await user.type(input, 'favourite')
  const options = await screen.findAllByRole('option')
  return options.find((o) => label.test(o.textContent ?? ''))
}

function favouritesBand(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-part="favourites-band"]')
}

describe("KAN-475's PATH_STEPS, end to end", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.replaceState(null, '', `${WORKSPACE_PATH}?nodeId=${GROCERIES_ID}`)
    jest.mocked(fetchPages).mockResolvedValue(PAGES.map((r) => ({ ...r })))
    jest.mocked(listPonds).mockResolvedValue([
      { id: POND_ID, name: 'life', glyph: null, theme: 'light', order: 0 } as Pond,
    ])
    jest.mocked(setPondFavourites).mockResolvedValue(undefined)
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('favourites "groceries", finds it in the band from another page, opens it, then unfavourites it', async () => {
    const user = userEvent.setup()
    const { container } = renderPath()

    const tree = await screen.findByRole('tree', { name: 'Workspace' })
    await within(tree).findByRole('treeitem', { name: 'groceries' })
    expect(favouritesBand(container)).toBeNull()

    // ⌘K → "favourite this page" → ↵ → "groceries" appears in the band.
    const favouriteRow = await findFavouriteRow(user, /^>favourite this page/)
    expect(favouriteRow).not.toBeUndefined()
    await user.click(favouriteRow!)

    await waitFor(() => expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [GROCERIES_ID]))
    await waitFor(() => expect(favouritesBand(container)).not.toBeNull())
    const bandRow = () =>
      within(favouritesBand(container)!).getByRole('listitem', { name: 'groceries' })
    expect(bandRow()).toHaveAttribute('aria-current', 'true')

    // Open a different page — the band survives the navigation.
    fireEvent.click(within(tree).getByRole('treeitem', { name: 'recipes' }))
    await waitFor(() => expect(window.location.search).toContain(`nodeId=${RECIPES_ID}`))
    expect(favouritesBand(container)).not.toBeNull()
    expect(bandRow()).not.toHaveAttribute('aria-current')

    // Click the favourite in the band — it opens.
    fireEvent.click(bandRow())
    await waitFor(() => expect(window.location.search).toContain(`nodeId=${GROCERIES_ID}`))

    // Standing in for "after reload": still mounted, still shows it.
    expect(bandRow()).toHaveAttribute('aria-current', 'true')

    // ⌘K → "unfavourite this page" → ↵ → the band disappears.
    const unfavouriteRow = await findFavouriteRow(user, /^>unfavourite this page/)
    expect(unfavouriteRow).not.toBeUndefined()
    await user.click(unfavouriteRow!)

    await waitFor(() => expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, []))
    await waitFor(() => expect(favouritesBand(container)).toBeNull())
  })
})
