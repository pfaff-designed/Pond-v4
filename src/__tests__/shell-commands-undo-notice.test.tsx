/**
 * KAN-139: a `done` step's own notice — `runUndoStep` reads the step's past-tense
 * effect off the ORIGINAL record (`describeUndoneEffect`) and the page open
 * before the step, then shows it through `requestUndoNotice`. The notice clears
 * on the next key or click, the chord that raises a new one included.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
jest.mock('@/lib/change-log/store', () => ({
  getRecord: jest.fn(),
}))
jest.mock('@/lib/terminal-focus', () => ({
  ...jest.requireActual('@/lib/terminal-focus'),
  requestComposerNotice: jest.fn(),
}))

import { ShellCommands } from '@/components/organisms/ShellCommands'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { getRecord } from '@/lib/change-log/store'
import { clearUndoNotice } from '@/lib/terminal-focus'

const renderShell = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShellCommands />
    </QueryClientProvider>
  )

const pressUndo = () => fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

const ADD_ROW_RECORD = {
  id: 'orig-1',
  action: 'add_row',
  before: null,
  after: { id: 'row-1', title: 'chickpeas, harissa', values: {}, shown: {} },
  links: {},
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  nodeId = 'page-b'
})
afterEach(() => {
  jest.restoreAllMocks()
  act(() => clearUndoNotice())
})

describe('ShellCommands — the undo notice (KAN-139)', () => {
  it('shows the opened page, the undone effect and the page you were on', async () => {
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-a', links: { undoOf: 'orig-1' } }],
    } as never)
    jest.mocked(getRecord).mockResolvedValueOnce(ADD_ROW_RECORD as never)
    renderShell()

    pressUndo()

    await waitFor(() => expect(screen.getByText('opened recipes')).toBeInTheDocument())
    expect(screen.getByText('removed chickpeas, harissa. you were on kitchen renovation.')).toBeInTheDocument()
  })

  it('a second ⌘Z clears a showing notice', async () => {
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-a', links: { undoOf: 'orig-1' } }],
    } as never)
    jest.mocked(getRecord).mockResolvedValueOnce(ADD_ROW_RECORD as never)
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({ outcome: 'empty' } as never)
    renderShell()

    pressUndo()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    pressUndo()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a keypress between ⌘Z and getRecord resolving leaves no notice', async () => {
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-a', links: { undoOf: 'orig-1' } }],
    } as never)
    let resolveRecord: (value: typeof ADD_ROW_RECORD) => void = () => {}
    jest.mocked(getRecord).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRecord = resolve as never))
    )
    renderShell()

    pressUndo()
    await waitFor(() => expect(getRecord).toHaveBeenCalled())

    fireEvent.keyDown(document.body, { key: 'a' })
    await act(async () => {
      resolveRecord(ADD_ROW_RECORD)
      await Promise.resolve()
    })

    expect(screen.queryByText('opened recipes')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('an unrelated keypress clears a showing notice', async () => {
    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-a', links: { undoOf: 'orig-1' } }],
    } as never)
    jest.mocked(getRecord).mockResolvedValueOnce(ADD_ROW_RECORD as never)
    renderShell()

    pressUndo()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())

    fireEvent.keyDown(document.body, { key: 'a' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
