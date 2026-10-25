/**
 * KAN-493 path test — PATH_STEPS end to end against the real hosting surfaces
 * (`Rail` beside `DocumentPanel`, one navigable URL, a real `PondProvider`),
 * not the helpers underneath them: open `settings` from the rail, delete a
 * throwaway active pond with its typed name, confirm the switcher and the
 * settings list both drop it and the rail lands on the remaining pond, find
 * it under `deleted` with its 30-day countdown, and restore it back into both
 * the settings list and the switcher.
 *
 * Modeled on `trash-path.test.tsx`: a stateful fake of `next/navigation`
 * (`push`/the app's own `openWorkspaceUrl` direct-`pushState` branch both
 * route through the SAME real `window.history.pushState`, patched once here
 * to notify `useSearchParams()` listeners — needed because `workspaceUrl`'s
 * pond fallback, `currentPondId()`, reads the real `window.location.search`
 * at click time, not this file's React state) and a stateful fake pond
 * backend (`softDeletePond`/`restorePond`/`listDeletedPonds` all read and
 * write the SAME in-memory rows, same reasoning as that file's
 * `trashPage`/`restorePage` against `livePages`/`records`).
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { PondProvider } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'

// A stateful fake of `next/navigation` that stays in sync with the REAL
// `window.location`: `router.push()` and the app's own `openWorkspaceUrl`
// (which calls `window.history.pushState` directly when already on
// `/workspace`) both end up going through the one patched `pushState`, so
// `useSearchParams()` here and `currentPondId()` (which reads
// `window.location.search` for real, at click time) never disagree.
jest.mock('next/navigation', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react')
  const listeners = new Set<(params: URLSearchParams) => void>()
  const currentParams = () => new URLSearchParams(window.location.search)
  const nativePushState = window.history.pushState.bind(window.history)
  window.history.pushState = function pushState(
    ...args: Parameters<History['pushState']>
  ) {
    nativePushState(...args)
    const params = currentParams()
    listeners.forEach((listener) => listener(params))
  } as History['pushState']
  const push = jest.fn((href: string) => {
    window.history.pushState(null, '', href)
  })
  return {
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => {
      const [params, setParams] = useState(currentParams)
      useEffect(() => {
        listeners.add(setParams)
        return () => {
          listeners.delete(setParams)
        }
      }, [])
      return params
    },
  }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
  }),
}))

const AT = '2026-01-01T00:00:00Z'
const livePages: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
]

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => [...livePages]),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue(null),
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  listPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  countWaiting: jest.fn().mockResolvedValue(0),
  appendOwnEdit: jest.fn().mockResolvedValue({}),
  getRecord: jest.fn().mockResolvedValue(null),
  listRecords: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/change-log/trash', () => ({
  ...jest.requireActual('@/lib/change-log/trash'),
  existingPageIds: jest.fn(async (_sb: unknown, ids: string[]) => new Set(ids)),
  trashPage: jest.fn().mockResolvedValue(undefined),
  restorePage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

// The one shared "server" for ponds: `softDeletePond`/`restorePond` mutate
// the same rows `listPonds` (read once, on mount) and `listDeletedPonds`
// (read on every `PondSettingsPage` mount) answer from.
interface FakePondRow {
  id: string
  name: string
  glyph: string | null
  theme: string
  order: number
  deletedAt: string | null
}

let pondRows: FakePondRow[] = [
  { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, deletedAt: null },
  { id: 'pond-2', name: 'Studio', glyph: null, theme: 'light', order: 1, deletedAt: null },
]

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
  setPondLastPage: jest.fn().mockResolvedValue(undefined),
  listPonds: jest.fn(async () =>
    pondRows
      .filter((p) => p.deletedAt === null)
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ id: p.id, name: p.name, glyph: p.glyph, theme: p.theme, order: p.order }))
  ),
  softDeletePond: jest.fn(async (id: string) => {
    const row = pondRows.find((p) => p.id === id)
    if (row) row.deletedAt = new Date().toISOString()
  }),
  restorePond: jest.fn(async (id: string) => {
    const row = pondRows.find((p) => p.id === id)
    if (row) row.deletedAt = null
  }),
  listDeletedPonds: jest.fn(async () =>
    pondRows
      .filter((p) => p.deletedAt !== null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        glyph: p.glyph,
        theme: p.theme,
        order: p.order,
        deletedAt: p.deletedAt as string,
      }))
  ),
}))

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/workspace?pond=pond-2')
  pondRows = [
    { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, deletedAt: null },
    { id: 'pond-2', name: 'Studio', glyph: null, theme: 'light', order: 1, deletedAt: null },
  ]
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(pagesKey('pond-1'), livePages)
  client.setQueryData(pagesKey('pond-2'), livePages)
  render(
    <QueryClientProvider client={client}>
      <PondProvider>
        <DeletionUndoProvider>
          <Rail />
          <div data-testid="document-panel">
            <DocumentPanel />
          </div>
        </DeletionUndoProvider>
      </PondProvider>
    </QueryClientProvider>
  )
}

describe('PATH_STEPS — settings deletes a pond, waits 30 days under deleted, and restores', () => {
  it('walks the whole path on the real rail + document panel', async () => {
    const user = userEvent.setup()
    mount()
    const panel = screen.getByTestId('document-panel')

    // Studio (the throwaway) starts active — the switcher head names it.
    await waitFor(() =>
      expect(document.querySelector('[data-part="pond-name"]')).toHaveTextContent('Studio')
    )

    // 1. rail → settings → the page opens with a "ponds" heading listing it.
    fireEvent.click(screen.getByRole('treeitem', { name: 'settings' }))
    await within(panel).findByText('ponds')
    expect(within(panel).getByText('Studio')).toBeInTheDocument()
    expect(within(panel).getByText('life')).toBeInTheDocument()

    // 2. delete… → type its name → delete.
    const studioRow = within(panel)
      .getAllByTestId('settings-pond-row')
      .find((row) => row.textContent?.includes('Studio'))!
    fireEvent.click(within(studioRow).getByRole('button', { name: 'delete…' }))
    await user.type(screen.getByRole('textbox'), 'Studio')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // 3. it is gone from the switcher, and — since it was active — life is
    // now shown.
    await waitFor(() =>
      expect(document.querySelector('[data-part="pond-name"]')).toHaveTextContent('life')
    )
    fireEvent.click(document.querySelector('[data-part="pond-switcher"]')!)
    const pondsMenu = screen.getByRole('menu', { name: 'Ponds' })
    expect(within(pondsMenu).queryByRole('menuitem', { name: 'Studio' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Ponds' })).not.toBeInTheDocument())

    // 4. settings › ponds › deleted shows "Studio · goes in 30 days" — back
    // to settings, a fresh mount of the page, reading the soft-deleted row
    // off the fake backend rather than a leftover render.
    fireEvent.click(screen.getByRole('treeitem', { name: 'settings' }))
    await within(panel).findByText('ponds')
    expect(
      within(panel)
        .getAllByTestId('settings-pond-row')
        .some((row) => row.textContent?.includes('Studio'))
    ).toBe(false)
    const deletedRow = await within(panel).findByTestId('settings-deleted-row')
    expect(deletedRow).toHaveTextContent('Studio · goes in 30 days')

    // 5. restore → it's back in the settings live list and the switcher.
    fireEvent.click(within(deletedRow).getByRole('button', { name: 'restore' }))
    await waitFor(() => expect(within(panel).queryByTestId('settings-deleted-row')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(
        within(panel)
          .getAllByTestId('settings-pond-row')
          .some((row) => row.textContent?.includes('Studio'))
      ).toBe(true)
    )

    fireEvent.click(document.querySelector('[data-part="pond-switcher"]')!)
    const pondsMenuAfterRestore = screen.getByRole('menu', { name: 'Ponds' })
    expect(within(pondsMenuAfterRestore).getByRole('menuitem', { name: 'Studio' })).toBeInTheDocument()
  })
})
