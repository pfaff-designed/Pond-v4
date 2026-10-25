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

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => {
  const actual = jest.requireActual('@/lib/pages/tree')
  return { ...actual, fetchPages: (...args: unknown[]) => mockFetchPages(...args) }
})

beforeEach(() => jest.clearAllMocks())

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
})
