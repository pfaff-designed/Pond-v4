/**
 * KAN-476 — `Rail` listens for `FOCUS_RAIL_ROW_EVENT` and focuses the open
 * page's row, re-expanding any ancestor the person hand-collapsed after
 * opening the page (NOT gated by the ticket-25 `revealedForRef` guard, unlike
 * the ordinary navigation reveal). No open page is a no-op.
 */
import React from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { requestRailRowFocus } from '@/lib/layout/rail-focus'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

let nodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? nodeId : null) }),
}))

const AT = '2026-01-01T00:00:00Z'
const OFFICE: PageRow = {
  id: 'office',
  parent_id: null,
  type: 'page',
  title: 'Office',
  order: 0,
  updated_at: AT,
}
const DESK: PageRow = {
  id: 'desk',
  parent_id: 'office',
  type: 'page',
  title: 'Desk',
  order: 0,
  updated_at: AT,
}
const ALL_ROWS = [OFFICE, DESK]

const POND: Pond = {
  id: 'pond-1',
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
}

function mountRail(rows: PageRow[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), rows)
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

describe('KAN-476 — the rail-focus key focuses the open row', () => {
  beforeEach(() => {
    window.localStorage.clear()
    nodeId = null
  })

  it("re-expands a hand-collapsed ancestor and focuses the open page's row", async () => {
    nodeId = 'desk'
    mountRail(ALL_ROWS)
    expect(screen.getByRole('treeitem', { name: 'Desk' })).toBeInTheDocument()

    const officeChevron = screen.getByRole('treeitem', { name: 'Office' }).querySelector('button')!
    await userEvent.click(officeChevron)
    expect(screen.queryByRole('treeitem', { name: 'Desk' })).not.toBeInTheDocument()

    act(() => requestRailRowFocus())

    expect(screen.getByRole('treeitem', { name: 'Desk' })).toHaveFocus()
  })

  it('does nothing when no page is open', () => {
    nodeId = null
    mountRail(ALL_ROWS)

    expect(() => act(() => requestRailRowFocus())).not.toThrow()
    expect(document.activeElement).toBe(document.body)
  })
})
