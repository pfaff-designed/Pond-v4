/**
 * KAN-388 (PATH_STEPS step 5): ⌘K's active row prefetches its page before ↵,
 * via `ShellCommands`' `onActiveItemChange` → `PondCommand`. The callback
 * wiring itself is a one-line pass-through, already covered row-by-row in
 * `command-palette.test.tsx`; this test is the one hop that file can't
 * reach — that `ShellCommands` really calls `queryClient.prefetchQuery` for
 * the id it's handed.
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'

// A `mock`-prefixed name so jest's out-of-scope check allows the move-picker
// test below to open on a page the other two tests don't need.
let mockCurrentNodeId: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockCurrentNodeId : null) }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => {
  const actual = jest.requireActual('@/lib/pages/tree')
  return { ...actual, fetchPages: (...args: unknown[]) => mockFetchPages(...args) }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockCurrentNodeId = null
})

describe('ShellCommands — ⌘K’s active row warms its page', () => {
  it('opening the palette prefetches the first row, and arrowing prefetches the next', async () => {
    mockFetchPages.mockResolvedValue([
      { id: 'alpha-1', parent_id: null, type: 'page', title: 'Alpha', order: 0, updated_at: '' },
      { id: 'beta-1', parent_id: null, type: 'page', title: 'Beta', order: 1, updated_at: '' },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')

    render(
      <QueryClientProvider client={queryClient}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await screen.findByRole('option', { name: /Alpha/ })

    expect(prefetchSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['page', 'alpha-1'] }))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(prefetchSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['page', 'beta-1'] }))
  })

  it('skips the already-cached active row — opening ⌘K on the open page must not refetch it under a live editor', async () => {
    mockFetchPages.mockResolvedValue([
      { id: 'alpha-1', parent_id: null, type: 'page', title: 'Alpha', order: 0, updated_at: '' },
    ])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['page', 'alpha-1'], { id: 'alpha-1' })
    const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')

    render(
      <QueryClientProvider client={queryClient}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    await screen.findByRole('combobox', { name: 'command palette' })
    await screen.findByRole('option', { name: /Alpha/ })

    expect(prefetchSpy).not.toHaveBeenCalled()
  })

  // KAN-469 live finding: the move picker's synthetic root row (`LIFE_ID`,
  // `movePickItems`) is first and active the instant pick mode opens — it
  // carries `kind: 'page'` like a real row, so `PondCommand`'s page/database
  // gate alone doesn't catch it; `GET pages?id=eq.__life__` 400'd on every
  // open before `handleActiveItemChange` also checked the row against `pages`.
  it('opening the move picker never prefetches its synthetic root row as a page', async () => {
    mockFetchPages.mockResolvedValue([
      { id: 'alpha-1', parent_id: null, type: 'page', title: 'Alpha', order: 0, updated_at: '' },
    ])
    mockCurrentNodeId = 'alpha-1'
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const prefetchSpy = jest.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined)
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')

    render(
      <QueryClientProvider client={queryClient}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )

    // ⌘K first, so `pages` has settled by the time ⌘⇧P reads it — its own
    // open/close doesn't touch `movePick`, only `handleOpenChange`'s does.
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.keyDown(document, { key: 'k', metaKey: true })

    fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await screen.findAllByRole('option')

    // Arrowing stays on the root row (it's the only candidate once "Alpha",
    // the page being moved, excludes itself) — still must never prefetch.
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(prefetchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['page', '__life__'] })
    )
  })
})
