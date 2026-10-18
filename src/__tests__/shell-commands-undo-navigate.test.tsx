/**
 * KAN-139: "That was on recipes, so undo opens recipes first." A `done` step
 * whose record sits on a page other than the one open navigates there before
 * the usual cache invalidation runs; a `done` step on the same page navigates
 * nowhere.
 */

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const push = jest.fn()
let nodeId: string | null = 'page-b'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: () => nodeId }),
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
jest.mock('@/lib/pages/use-pages', () => ({
  usePagesRows: () => ({
    data: [
      { id: 'page-a', parent_id: null, type: 'page', title: 'recipes', order: 0, updated_at: '' },
      { id: 'page-b', parent_id: null, type: 'page', title: 'kitchen renovation', order: 1, updated_at: '' },
    ],
  }),
}))
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: jest.fn(),
    redo: jest.fn(),
  },
}))
jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { sessionUndo } from '@/lib/change-log/session-undo'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShellCommands />
    </QueryClientProvider>
  )

const pressUndo = () => fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  nodeId = 'page-b'
})
afterEach(() => jest.restoreAllMocks())

describe('ShellCommands — a done step opens the record’s own page first', () => {
  it('navigates to the target page when its record sits elsewhere', async () => {
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-a' }],
      step: { pondId: 'pond-1', recordIds: ['rec-a'] },
    } as never)
    renderShell()

    pressUndo()

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.stringContaining('nodeId=page-a')
      )
    )
  })

  it('does not navigate when the record is already on the open page', async () => {
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-b' }],
      step: { pondId: 'pond-1', recordIds: ['rec-b'] },
    } as never)
    renderShell()

    pressUndo()

    await waitFor(() => expect(sessionUndo.undo).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
  })
})
