/**
 * KAN-356 — ⌘Z pressed inside the 600ms edit pause after a remove must wait
 * for that page's pending debounced save (`flushPendingPageSave`, KAN-302)
 * before reading the session's undo step, else it undoes the step before the
 * removal and lands stale on top (same hazard AITerminal's send already
 * guards against, AITerminal.tsx:2090).
 */

import { fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => 'page-1' }),
}))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
jest.mock('@/lib/pages/client', () => ({}))
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))
jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: jest.fn().mockResolvedValue({ outcome: 'empty' }),
    redo: jest.fn().mockResolvedValue({ outcome: 'empty' }),
  },
}))
jest.mock('@/lib/pages/page-flush', () => ({ flushPendingPageSave: jest.fn() }))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { flushPendingPageSave } from '@/lib/pages/page-flush'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})
afterEach(() => jest.restoreAllMocks())

describe('ShellCommands — ⌘Z awaits the open page’s pending save first', () => {
  it('does not read the undo step until a pending flush resolves', async () => {
    let resolveFlush!: () => void
    jest.mocked(flushPendingPageSave).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFlush = resolve
      })
    )
    renderShell()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    expect(flushPendingPageSave).toHaveBeenCalledWith('page-1')
    expect(sessionUndo.undo).not.toHaveBeenCalled()

    resolveFlush()
    await waitFor(() => expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1'))
  })

  it('reads the undo step in the same tick when nothing is pending', async () => {
    jest.mocked(flushPendingPageSave).mockReturnValue(undefined)
    renderShell()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() => expect(sessionUndo.undo).toHaveBeenCalledWith('pond-1'))
  })
})
