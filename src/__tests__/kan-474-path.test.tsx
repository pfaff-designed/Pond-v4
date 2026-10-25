/**
 * KAN-474 path test — the real `Rail` and the real `ShellCommands` mounted
 * together, same harness as `kan-470-path.test.tsx` (`PondContext.Provider`
 * + one `QueryClient` seeded via `pagesKey`, `staleTime: Infinity` so no
 * `fetchPages`/`pages/tree` mock is needed). Walks PATH_STEPS' two legs:
 * ⌘-click "roof" in the rail is left unprevented for the browser's own new
 * tab and the current tab's history/page is untouched; a plain click on the
 * same row still opens it here; ⌘K → type "roof" → ⌘↵ opens it in a new tab
 * via `window.open`, never the current tab's history, and the palette closes.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import { workspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => null }),
}))
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
jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
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

const POND_ID = 'pond-1'
const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'roof', parent_id: null, type: 'page', title: 'roof', order: 0, updated_at: AT },
]
const POND: Pond = { id: POND_ID, name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
  removePond: () => {},
}

function renderPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(pagesKey(POND_ID), ROWS)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState({}, '', WORKSPACE_PATH)
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('KAN-474 path test — ⌘-click/⌘↵ open a new tab, a plain click/⏎ stay in this one', () => {
  it('walks PATH_STEPS: rail ⌘-click leaves the default unprevented, a plain click opens it here; ⌘K ⌘↵ opens a new tab', async () => {
    const user = userEvent.setup()
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    const pushStateSpy = jest.spyOn(window.history, 'pushState')

    renderPath()

    const tree = screen.getByRole('tree', { name: 'Workspace' })
    const roofRow = within(tree).getByRole('treeitem', { name: 'roof' })

    // ⌘-click "roof": left unprevented for the browser's own new tab — the
    // current tab's history/page is untouched (new-tab behaviour is the
    // browser's own, not asserted beyond "left to it").
    const notPrevented = fireEvent.click(roofRow, { metaKey: true })
    expect(notPrevented).toBe(true)
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()

    // A plain click on the same row still opens it in the current tab.
    fireEvent.click(roofRow)
    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'roof', type: 'page', title: 'roof' })
    )
    pushStateSpy.mockClear()

    // ⌘K → type "roof" → ⌘↵ opens it in a new tab — never the current one —
    // and the palette closes.
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'roof')
    // Anchored at the start: the palette also mints an `ask pond about
    // "roof"` action row for the same query, whose name does not start with
    // "roof" — unanchored `/roof/i` matches both and `findByRole` throws on
    // the ambiguity.
    await screen.findByRole('option', { name: /^roof/i })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(openSpy).toHaveBeenCalledWith(
      workspaceUrl({ id: 'roof', type: 'page', title: 'roof' }),
      '_blank',
      'noopener'
    )
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
  })
})
