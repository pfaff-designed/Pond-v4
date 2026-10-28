/**
 * KAN-568: ⌘K's `back`/`forward` rows step the shell's own session-history
 * stack (`lib/pages/session-history.ts`), not `window.history` — this proves
 * the wiring in `ShellCommands` (the ref-held stack, the record-on-navigate
 * effect, and the two callbacks) rather than the pure engine, which has its
 * own table-of-cases test.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { workspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'

let nodeId: string | null = 'page-a'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => nodeId }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(),
}))
jest.mock('@/lib/pages/use-pages', () => ({
  usePagesRows: () => ({
    data: [
      { id: 'page-a', parent_id: null, type: 'page', title: 'Alpha', order: 0, updated_at: '' },
      { id: 'page-b', parent_id: null, type: 'page', title: 'Beta', order: 1, updated_at: '' },
    ],
  }),
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
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: { undo: jest.fn(), redo: jest.fn() },
}))
const POND = { id: 'pond-1', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
  usePond: () => ({ pond: POND, ponds: [POND], addPond: jest.fn() }),
}))
jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const shell = () => (
  <QueryClientProvider client={queryClient}>
    <DeletionUndoProvider>
      <ShellCommands />
    </DeletionUndoProvider>
  </QueryClientProvider>
)

async function selectFromPalette(rerender: (ui: React.ReactElement) => void, query: string, name: RegExp) {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value: query } })
  const option = await screen.findByRole('option', { name })
  fireEvent.click(option)
  rerender(shell())
}

beforeEach(() => {
  jest.clearAllMocks()
  nodeId = 'page-a'
  window.history.replaceState({}, '', WORKSPACE_PATH)
})

describe('ShellCommands — ⌘K back/forward steps the session-history stack (KAN-568)', () => {
  it('back lands on the previous page, forward lands back on the one after it', async () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    const { rerender } = render(shell())

    // Open A (seeds the stack), then open B (a real navigation records it).
    nodeId = 'page-b'
    rerender(shell())

    await selectFromPalette(rerender, 'back', /^>\s*back\s/)
    expect(pushStateSpy).toHaveBeenNthCalledWith(
      1,
      null,
      '',
      workspaceUrl({ id: 'page-a', type: 'page', title: 'Alpha' })
    )

    await selectFromPalette(rerender, 'forward', /^>\s*forward\s/)
    expect(pushStateSpy).toHaveBeenNthCalledWith(
      2,
      null,
      '',
      workspaceUrl({ id: 'page-b', type: 'page', title: 'Beta' })
    )

    pushStateSpy.mockRestore()
  })
})
