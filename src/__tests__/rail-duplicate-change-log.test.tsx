/**
 * KAN-468: ⌘D on a focused rail row → `Rail.tsx`'s `handleDuplicate` calls
 * `duplicatePage`, then remembers the returned record as one session-undo
 * step and invalidates the change log — the same shape `handlePickGlyph`
 * registers a pick (`rail-glyph-change-log.test.tsx`).
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { duplicatePage } from '@/lib/pages/client'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  duplicatePage: jest.fn(),
}))

const mockRemember = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { remember: (...args: unknown[]) => mockRemember(...args) },
}))

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
]

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

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), ROWS)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockRemember.mockClear()
  ;(duplicatePage as jest.Mock).mockReset()
})

it('remembers a ⌘D duplicate as one undo step, keyed off the returned record id', async () => {
  ;(duplicatePage as jest.Mock).mockResolvedValue({ id: 'record-1', targetPageId: 'health-2' })
  mount()

  const row = screen.getByRole('treeitem', { name: /Health/ })
  fireEvent.keyDown(row, { key: 'd', metaKey: true })

  await waitFor(() => expect(duplicatePage).toHaveBeenCalledWith(expect.anything(), 'user-1', 'health'))
  await waitFor(() => expect(mockRemember).toHaveBeenCalledTimes(1))
  expect(mockRemember).toHaveBeenCalledWith({ pondId: 'pond-1', recordIds: ['record-1'] })
})

it('never remembers an undo step when duplicatePage fails', async () => {
  ;(duplicatePage as jest.Mock).mockRejectedValue(new Error('boom'))
  mount()

  const row = screen.getByRole('treeitem', { name: /Health/ })
  fireEvent.keyDown(row, { key: 'd', metaKey: true })

  await waitFor(() => expect(duplicatePage).toHaveBeenCalledTimes(1))
  expect(mockRemember).not.toHaveBeenCalled()
})
