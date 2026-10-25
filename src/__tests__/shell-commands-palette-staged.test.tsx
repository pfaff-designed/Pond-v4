/**
 * KAN-310 gap 1, the palette — a page mid-delete still showed in ⌘K's list
 * until a reload. `ShellCommands` now reads its pages through `usePagesRows`
 * (same hook `DocumentPanel` uses, `document-panel-staged-children.test.tsx`)
 * instead of its own raw `fetchPages` query, so a staged id drops here too,
 * live, with no refetch.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { stageId, unstageId } from '@/lib/deletion/staged-ids'

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

function renderShell() {
  mockFetchPages.mockResolvedValue([
    { id: 'alpha-1', parent_id: null, type: 'page', title: 'Alpha', order: 0, updated_at: '' },
    { id: 'beta-1', parent_id: null, type: 'page', title: 'Beta', order: 1, updated_at: '' },
  ])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => jest.clearAllMocks())

describe('ShellCommands — a staged page drops from the ⌘K list at once', () => {
  it('stages, the row is gone; unstages, it returns — no reload either way', async () => {
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    renderShell()

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    fireEvent.change(input, { target: { value: 'Alpha' } })
    await screen.findByRole('option', { name: /Alpha/ })
    const callsBeforeStaging = mockFetchPages.mock.calls.length

    act(() => stageId('alpha-1'))
    await waitFor(() => expect(screen.queryByRole('option', { name: /Alpha/ })).toBeNull())
    expect(mockFetchPages).toHaveBeenCalledTimes(callsBeforeStaging)

    act(() => unstageId('alpha-1'))
    await waitFor(() => expect(screen.getByRole('option', { name: /Alpha/ })).toBeInTheDocument())
    expect(mockFetchPages).toHaveBeenCalledTimes(callsBeforeStaging)
  })
})
