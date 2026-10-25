/**
 * KAN-553 PATH_STEPS — delete a block → ⌘Z opens the undo panel → delete
 * another block → its toast is clickable, never hidden under the panel.
 * Modelled on shell-commands-undo-notice.test.tsx: the real `ShellCommands`
 * + `DeletionUndoProvider`, `sessionUndo.undo` mocked at the RPC boundary so
 * ⌘Z drives the real panel. A harness stages the block-delete toasts the
 * same way the real call sites do (`stageDeletion`, message `deleted text ·`,
 * `undoLabel: 'undo'`) rather than mounting the full block canvas, which is
 * incidental to this ticket's stacking-order path.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { DeletionUndoProvider, useDeletionUndo } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { getRecord } from '@/lib/change-log/store'
import { clearUndoNotice } from '@/lib/terminal-focus'

const pressUndo = () => fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

const ADD_ROW_RECORD = {
  id: 'orig-1',
  action: 'add_row',
  before: null,
  after: { id: 'row-1', title: 'chickpeas, harissa', values: {}, shown: {} },
  links: {},
}

// Stands in for the real delete call site (`removeBlockAt` → the block's own
// toast) — stages a toast with the same message/undoLabel convention a block
// delete uses, `deleted text ·` / `undo` (block-canvas-delete-undo-path.test.tsx).
function DeleteBlockHarness({
  undoFirst,
  undoSecond,
}: {
  undoFirst: () => void
  undoSecond: () => void
}) {
  const { stageDeletion } = useDeletionUndo()
  return (
    <>
      <button
        onClick={() =>
          stageDeletion({ message: 'deleted text ·', undoLabel: 'undo', commit: () => {}, undo: undoFirst })
        }
      >
        delete first block
      </button>
      <button
        onClick={() =>
          stageDeletion({ message: 'deleted text ·', undoLabel: 'undo', commit: () => {}, undo: undoSecond })
        }
      >
        delete second block
      </button>
    </>
  )
}

const renderPath = (undoFirst: () => void, undoSecond: () => void) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DeletionUndoProvider>
        <ShellCommands />
        <DeleteBlockHarness undoFirst={undoFirst} undoSecond={undoSecond} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  nodeId = 'page-b'
})
afterEach(() => {
  jest.restoreAllMocks()
  act(() => clearUndoNotice())
})

describe('PATH_STEPS: a toast raised while the undo panel is open stacks above it, never hidden under it (KAN-553)', () => {
  it('delete a block, ⌘Z opens the panel, delete another — its undo button works and the toast outranks the panel', async () => {
    const undoFirst = jest.fn()
    const undoSecond = jest.fn()
    const user = userEvent.setup()

    renderPath(undoFirst, undoSecond)

    await user.click(screen.getByRole('button', { name: 'delete first block' }))
    expect(await screen.findByText('deleted text ·')).toBeInTheDocument()

    jest.mocked(sessionUndo.undo).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-a', links: { undoOf: 'orig-1' } }],
      step: { pondId: 'pond-1', recordIds: ['orig-1'] },
    } as never)
    jest.mocked(getRecord).mockResolvedValueOnce(ADD_ROW_RECORD as never)

    pressUndo()

    const panel = await screen.findByText('opened recipes')
    expect(panel).toBeInTheDocument()
    const panelStatus = panel.closest('[role="status"]') as HTMLElement
    expect(panelStatus).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'delete second block' }))
    await waitFor(() => expect(screen.getAllByText('deleted text ·')).toHaveLength(2))

    const secondToast = screen.getAllByText('deleted text ·')[1].closest('[role="status"]') as HTMLElement
    const undoButton = within(secondToast).getByRole('button', { name: 'undo' })
    expect(undoButton).toBeInTheDocument()

    await user.click(undoButton)
    expect(undoSecond).toHaveBeenCalledTimes(1)
    expect(undoFirst).not.toHaveBeenCalled()

    // The toast viewport is a sibling subtree that always reads one layer
    // above the panel (undo-toast-over-panel.test.tsx pins the scale itself);
    // this proves the real, mounted DOM agrees and renders after the panel.
    const viewport = screen.getByTestId('undo-toast-viewport')
    expect(panelStatus.compareDocumentPosition(viewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const panelZ = Number(panelStatus.style.getPropertyValue('--z-undo-panel'))
    const viewportZ = Number(viewport.style.getPropertyValue('--z-toast-stack'))
    expect(viewportZ).toBeGreaterThan(panelZ)
  })
})
