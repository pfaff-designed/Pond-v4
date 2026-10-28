/**
 * KAN-569: `Rail.tsx` wires `useFavouritePage().reorder` into
 * `RailFavouritesBand`'s `onReorder` — the real `Rail` mounted under the real
 * `PondProvider` (same seam as `kan-475-path.test.tsx`), so a drag's
 * `setPondFavourites` call and the band's re-render both prove the real
 * optimistic-patch path, not a stub handler.
 */

import React from 'react'
import { fireEvent, render, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Rail } from '@/components/organisms/Rail'
import { PondProvider } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { PageRow } from '@/lib/pages/tree'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { undo: jest.fn(), redo: jest.fn() },
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
const HOUSE_ID = 'house'
const ROOF_ID = 'roof'
const AT = '2026-01-01T00:00:00Z'
const PAGES: PageRow[] = [
  { id: GROCERIES_ID, parent_id: null, type: 'page', title: 'groceries', order: 0, updated_at: AT },
  { id: HOUSE_ID, parent_id: null, type: 'page', title: 'house', order: 1, updated_at: AT },
  { id: ROOF_ID, parent_id: null, type: 'page', title: 'roof', order: 2, updated_at: AT },
]

function renderPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PondProvider>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondProvider>
    </QueryClientProvider>
  )
}

function favouritesBand(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-part="favourites-band"]')
}

/** jsdom has no real `DragEvent`/`DataTransfer` (jsdom/jsdom#1568) — build raw
 *  `Event`s with the properties the band's handlers read, the same
 *  workaround `rail-move-undo-path.test.tsx`'s drag tests already use. */
function dragStartEvent() {
  const event = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { effectAllowed: '', dropEffect: '', setData: jest.fn() },
  })
  return event
}
function dropEvent(clientY: number) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

describe("Rail wires useFavouritePage().reorder into the band's drag (KAN-569)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(fetchPages).mockResolvedValue(PAGES.map((r) => ({ ...r })))
    jest.mocked(listPonds).mockResolvedValue([
      {
        id: POND_ID,
        name: 'life',
        glyph: null,
        theme: 'light',
        order: 0,
        favouritePageIds: [GROCERIES_ID, HOUSE_ID, ROOF_ID],
      } as Pond,
    ])
    jest.mocked(setPondFavourites).mockResolvedValue(undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('drags roof to the top → setPondFavourites gets the new order and the band re-renders in it', async () => {
    const { container } = renderPath()
    const band = () => favouritesBand(container) as HTMLElement

    await waitFor(() => expect(band()).not.toBeNull())
    expect(within(band()).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      'groceries',
      'house',
      'roof',
    ])

    const groceriesRow = within(band()).getByRole('listitem', { name: 'groceries' })
    const roofRow = within(band()).getByRole('listitem', { name: 'roof' })

    // The top half of groceries' row — the "drag roof to the top" zone.
    groceriesRow.getBoundingClientRect = jest.fn(
      () => ({ top: 0, height: 40, bottom: 40, left: 0, right: 0, width: 0, x: 0, y: 0 }) as DOMRect
    )

    fireEvent(roofRow, dragStartEvent())
    fireEvent(groceriesRow, dropEvent(5))

    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [ROOF_ID, GROCERIES_ID, HOUSE_ID])
    )
    expect(within(band()).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      'roof',
      'groceries',
      'house',
    ])
  })
})
