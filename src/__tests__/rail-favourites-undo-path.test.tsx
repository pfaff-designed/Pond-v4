/**
 * KAN-569 — `ShellCommands`' global ⌘Z, checked against a pending favourites
 * reorder before it ever reaches `sessionUndo`: the real `Rail` (for the drag)
 * and the real `ShellCommands` (for the key handler) mounted together under one
 * `PondProvider`, the same seam as `rail-favourites-reorder-path.test.tsx` and
 * `shell-commands-favourite-page-path.test.tsx` — proving the two components'
 * shared `useFavouritePage()` state, not a stub wired by the test itself.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
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
jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
  getRecord: jest.fn(),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { undo: jest.fn().mockResolvedValue({ outcome: 'empty' }), redo: jest.fn() },
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
import { sessionUndo } from '@/lib/change-log/session-undo'
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
          <ShellCommands />
        </DeletionUndoProvider>
      </PondProvider>
    </QueryClientProvider>
  )
}

function favouritesBand(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-part="favourites-band"]')
}

/** jsdom has no real `DragEvent`/`DataTransfer` (jsdom/jsdom#1568) — the same
 *  raw-`Event` workaround `rail-favourites-reorder-path.test.tsx` already uses. */
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

describe('⌘Z reverts a favourites reorder before it reaches sessionUndo (KAN-569)', () => {
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
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('reverts the band order, persists it, and never calls sessionUndo or shows a toast', async () => {
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

    // The top half of groceries' row — "drag roof to the top".
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

    fireEvent.keyDown(document, { key: 'z', metaKey: true })

    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [GROCERIES_ID, HOUSE_ID, ROOF_ID])
    )
    expect(within(band()).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      'groceries',
      'house',
      'roof',
    ])
    expect(sessionUndo.undo).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a second ⌘Z reaches sessionUndo instead of reverting the reorder again', async () => {
    const { container } = renderPath()
    const band = () => favouritesBand(container) as HTMLElement

    await waitFor(() => expect(band()).not.toBeNull())
    const groceriesRow = within(band()).getByRole('listitem', { name: 'groceries' })
    const roofRow = within(band()).getByRole('listitem', { name: 'roof' })
    groceriesRow.getBoundingClientRect = jest.fn(
      () => ({ top: 0, height: 40, bottom: 40, left: 0, right: 0, width: 0, x: 0, y: 0 }) as DOMRect
    )
    fireEvent(roofRow, dragStartEvent())
    fireEvent(groceriesRow, dropEvent(5))

    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [ROOF_ID, GROCERIES_ID, HOUSE_ID])
    )

    fireEvent.keyDown(document, { key: 'z', metaKey: true })
    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [GROCERIES_ID, HOUSE_ID, ROOF_ID])
    )

    const callsAfterFirstUndo = jest.mocked(setPondFavourites).mock.calls.length

    fireEvent.keyDown(document, { key: 'z', metaKey: true })
    await waitFor(() => expect(sessionUndo.undo).toHaveBeenCalledWith(POND_ID))

    // The ⌘Z revert itself must not have re-armed the pending-reorder slot —
    // nothing calls `setPondFavourites` with the reordered list again.
    expect(jest.mocked(setPondFavourites).mock.calls.length).toBe(callsAfterFirstUndo)
  })

  it('restores the pending reorder on a rejected undo so the next ⌘Z can retry it', async () => {
    const { container } = renderPath()
    const band = () => favouritesBand(container) as HTMLElement

    await waitFor(() => expect(band()).not.toBeNull())
    const groceriesRow = within(band()).getByRole('listitem', { name: 'groceries' })
    const roofRow = within(band()).getByRole('listitem', { name: 'roof' })
    groceriesRow.getBoundingClientRect = jest.fn(
      () => ({ top: 0, height: 40, bottom: 40, left: 0, right: 0, width: 0, x: 0, y: 0 }) as DOMRect
    )
    fireEvent(roofRow, dragStartEvent())
    fireEvent(groceriesRow, dropEvent(5))

    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [ROOF_ID, GROCERIES_ID, HOUSE_ID])
    )

    jest.mocked(setPondFavourites).mockRejectedValueOnce(new Error('offline'))
    fireEvent.keyDown(document, { key: 'z', metaKey: true })
    await waitFor(() =>
      expect(setPondFavourites).toHaveBeenCalledWith(POND_ID, [GROCERIES_ID, HOUSE_ID, ROOF_ID])
    )
    // The rejected revert leaves the band on the reordered order, rolled back.
    expect(within(band()).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      'roof',
      'groceries',
      'house',
    ])

    jest.mocked(setPondFavourites).mockResolvedValueOnce(undefined)
    fireEvent.keyDown(document, { key: 'z', metaKey: true })

    await waitFor(() =>
      expect(within(band()).getAllByRole('listitem').map((r) => r.textContent)).toEqual([
        'groceries',
        'house',
        'roof',
      ])
    )
    expect(sessionUndo.undo).not.toHaveBeenCalled()
  })
})
