/**
 * KAN-449: on `/workspace`, a rail row click switches the open page with a
 * shallow `pushState` — no `router.push`, no RSC round trip. `rail-change-log-row`
 * and the other rail nav tests render on jsdom's default `/`, where `router.push`
 * is still correct (Cover.tsx's case); this test is the one that proves the
 * `/workspace` path.
 */
import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
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

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
]
const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
}

function renderRail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(pagesKey('pond-1'), ROWS)
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe('rail row click — shallow nav on /workspace (KAN-449)', () => {
  beforeEach(() => {
    push.mockClear()
    window.history.replaceState({}, '', WORKSPACE_PATH)
  })

  it('pushes history shallowly and never calls router.push', async () => {
    renderRail()
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    const tree = screen.getByRole('tree', { name: 'Workspace' })
    fireEvent.click(within(tree).getByRole('treeitem', { name: 'Health' }))

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'health', type: 'page', title: 'Health' })
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})
