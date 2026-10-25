/**
 * KAN-449: on `/workspace`, ShellCommands' four page-opening sites (⌘K → new
 * page, ⌘K ↵ on a record, ⌘K ↵ on a page, and a `done` undo step that opens
 * the record's own page first) switch with a shallow `pushState` — no
 * `router.push`, no RSC round trip. The other ShellCommands nav suites render
 * on jsdom's default `/`, where `router.push` is still correct (Cover.tsx's
 * case); this file is the one that proves the `/workspace` path.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { workspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'
import { pondHref } from '@/lib/pond/active'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { createPage } from '@/lib/pages/client'
import { searchRecords } from '@/lib/pages/palette-records'

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
  searchRecords: jest.fn().mockResolvedValue([
    { id: 'r1', label: 'cabinet quote', kind: 'record', sub: 'tasks' },
  ]),
}))
const POND = { id: 'pond-1', name: 'life', glyph: 'waves-02', theme: 'paper', order: 0 }
const OTHER_POND = { id: 'pond-2', name: 'studio', glyph: 'waves-03', theme: 'ink', order: 1, lastPageId: 'studio-home' }
jest.mock('@/lib/pond/context', () => ({
  usePondId: () => 'pond-1',
  usePond: () => ({ pond: POND, ponds: [POND, OTHER_POND], addPond: jest.fn() }),
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
  jest.mocked(searchRecords).mockResolvedValue([
    { id: 'r1', label: 'cabinet quote', kind: 'record', sub: 'tasks' },
  ])
})

describe('ShellCommands — shallow nav on /workspace (KAN-449)', () => {
  it('⌘K → new page "groceries" opens the created page with pushState, never router.push', async () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()
    await openAndType('groceries')
    const option = await screen.findByRole('option', { name: /new page/ })
    fireEvent.click(option)

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1))
    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'new-page', type: 'page', title: 'groceries' })
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('⌘K ↵ on a record opens it with pushState, never router.push', async () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()
    const input = await openAndType('cab')
    await screen.findByRole('option', { name: /cab inet quote/ })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      workspaceUrl({ id: 'r1', type: 'row', title: 'cabinet quote' })
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('⌘K ↵ on a page opens it with pushState, never router.push', async () => {
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
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('⌘K ↵ on a pond row opens it with pushState, never router.push', async () => {
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()
    const input = await openAndType('studio')
    await screen.findByRole('option', { name: /^studio pond · switch/ })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', pondHref(OTHER_POND.id, OTHER_POND.lastPageId))
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('a done undo step whose record sits elsewhere opens that page with pushState, never router.push', async () => {
    nodeId = 'page-b'
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'health' }],
      step: { pondId: 'pond-1', recordIds: [] },
    } as never)
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const pushStateSpy = jest.spyOn(window.history, 'pushState')
    renderShell()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() =>
      expect(pushStateSpy).toHaveBeenCalledWith(
        null,
        '',
        workspaceUrl({ id: 'health', type: 'page', title: 'Health' })
      )
    )
    expect(push).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})
