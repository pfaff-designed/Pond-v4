/**
 * KAN-474: ⌘K ↵ on a page row opens it in the current tab (KAN-449's shallow
 * nav). ⌘↵/Ctrl+↵ on that same row opens it in a new tab instead —
 * `window.open(workspaceUrl(...), '_blank', 'noopener')` — and the palette
 * still closes. Same mocks as `shell-commands-shallow-nav.test.tsx`'s "⌘K ↵ on
 * a page" case, the lightest fixture that already has a real page row.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { workspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'

const push = jest.fn()
let nodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => nodeId }),
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))
jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-page', title: 'groceries' }),
}))
jest.mock('@/lib/pages/use-pages', () => ({
  usePagesRows: () => ({
    data: [
      { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: '' },
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
jest.mock('@/lib/pages/palette-records', () => ({
  ...jest.requireActual('@/lib/pages/palette-records'),
  searchRecords: jest.fn().mockResolvedValue([]),
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

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeletionUndoProvider>
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

async function openAndType(value: string) {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  const input = await screen.findByRole('combobox', { name: 'command palette' })
  fireEvent.change(input, { target: { value } })
  return input
}

beforeEach(() => {
  jest.clearAllMocks()
  nodeId = null
  window.history.replaceState({}, '', WORKSPACE_PATH)
})

describe('ShellCommands — ⌘↵/Ctrl+↵ on a page row opens a new tab (KAN-474)', () => {
  it('metaKey+Enter calls window.open with the page’s workspaceUrl, closes the palette, and never navigates the current tab', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()
    const input = await openAndType('Health')
    await screen.findByRole('option', { name: /Health/ })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    expect(openSpy).toHaveBeenCalledWith(
      workspaceUrl({ id: 'health', type: 'page', title: 'Health' }),
      '_blank',
      'noopener'
    )
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
    openSpy.mockRestore()
    pushStateSpy.mockRestore()
  })

  it('ctrlKey+Enter (Windows/Linux) does the same', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()
    const input = await openAndType('Health')
    await screen.findByRole('option', { name: /Health/ })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(openSpy).toHaveBeenCalledWith(
      workspaceUrl({ id: 'health', type: 'page', title: 'Health' }),
      '_blank',
      'noopener'
    )
    expect(pushStateSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
    pushStateSpy.mockRestore()
  })

  it('a plain Enter on the same row still opens it in the current tab with pushState — the newTab contract never touches it', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()
    const input = await openAndType('Health')
    await screen.findByRole('option', { name: /Health/ })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(pushStateSpy).toHaveBeenCalledWith(
        null,
        '',
        workspaceUrl({ id: 'health', type: 'page', title: 'Health' })
      )
    )
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
    pushStateSpy.mockRestore()
  })
})
