/**
 * KAN-361 (live verify) — `moveBlockIntoNewPage`'s page-link swap writes
 * through `persistBlocksAsOwnEdit`, carrying `onUndone`/`onRedone` the same
 * way the view's made-database path does (`block-canvas-view-insert-undo-path.test.tsx`).
 * ⌘Z (`sessionUndo.undo`) and the toast's own `undo` button both run that ONE
 * step, so neither can leave the made page orphaned: trashing it on undo
 * (never `deletePage`, so redo can bring it back) and restoring it on redo.
 * Harness mirrors the view-insert undo-path test — a real `BlockCanvas`
 * backed by a real write queue, `trashPage`/`restorePage` mocked at the RPC
 * boundary only.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo, type UndoHandle } from '@/lib/change-log/session-undo'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import { trashPage, restorePage } from '@/lib/change-log/trash'
import { listRecords } from '@/lib/change-log/store'
import type { Block } from '@/lib/documents/types'
import { createPageWriter, type PageWriteState } from '@/lib/pages/commit'
import { createPageWriteQueue } from '@/lib/pages/page-write-queue'
import { makeFakeSupabase } from './helpers/fake-supabase'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

const mockCreateClient = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

const mockInsertPageOptimistic = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: (...args: unknown[]) => mockInsertPageOptimistic(...args),
}))

const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))

let recordSeq = 0
const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  listRecords: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn().mockResolvedValue(undefined),
  restorePage: jest.fn().mockResolvedValue(undefined),
}))

// `session-undo.ts` stays real: this proves the move's `rememberPending` and
// ⌘Z's `undo` (and the toast's own undo button) share one real stack. Only
// the RPC boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const note: Block = { id: 'b-note', type: 'text', content: 'walk the dog' }

function Harness({
  initial,
  onBlocksChange,
}: {
  initial: Block[]
  onBlocksChange: (blocks: Block[]) => void
}) {
  const [blocks, setBlocks] = React.useState(initial)
  const queryClient = useQueryClient()
  const queueRef = React.useRef<ReturnType<typeof createPageWriteQueue<PageWriteState>> | null>(
    null
  )

  const setAndReport = (next: Block[]) => {
    setBlocks(next)
    onBlocksChange(next)
  }

  const onStructuralWrite = async (
    next: Block[],
    opts?: {
      onUndone?: () => Promise<void> | void
      onRedone?: () => Promise<void> | void
      onUndoHandle?: (handle: UndoHandle) => void
    }
  ) => {
    setAndReport(next)
    if (!queueRef.current) {
      queueRef.current = createPageWriteQueue(
        createPageWriter(mockCreateClient(), queryClient, 'page-1', 'pond-1'),
        { title: 'walk the dog', blocks: initial }
      )
    }
    let resolveIds: (ids: readonly string[] | null) => void = () => {}
    const recordIds = new Promise<readonly string[] | null>((resolve) => {
      resolveIds = resolve
    })
    const handle = sessionUndo.rememberPending({
      pondId: 'pond-1',
      recordIds,
      onUndone: opts?.onUndone,
      onRedone: opts?.onRedone,
    })
    opts?.onUndoHandle?.(handle)
    await queueRef.current.enqueue({
      kind: 'structural',
      after: { title: 'walk the dog', blocks: next },
      onPending: resolveIds,
    })
    return true
  }

  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="walk the dog"
      onChange={setAndReport}
      onStructuralWrite={onStructuralWrite}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onBlocksChange = jest.fn()
  render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} onBlocksChange={onBlocksChange} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { onBlocksChange }
}

const lastBlocks = (onBlocksChange: jest.Mock) => onBlocksChange.mock.calls.at(-1)![0] as Block[]

beforeEach(() => {
  jest.clearAllMocks()
  recordSeq = 0
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  jest.mocked(redoStep).mockResolvedValue({ outcome: 'done', records: [] })
  sessionUndo.clear()
})

async function moveNoteIntoNewPage(onBlocksChange: jest.Mock) {
  const user = userEvent.setup()
  const row = document.getElementById('block-b-note')!
  fireEvent.contextMenu(row)
  const menu = await screen.findByRole('menu', { name: /block menu/i })
  await user.click(within(menu).getByRole('menuitem', { name: 'move into a new page' }))
  await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(lastBlocks(onBlocksChange)[0].type).toBe('page-link'))
}

describe('⌘Z and the toast undo a page move as ONE step (KAN-361)', () => {
  it('⌘Z trashes the page the move made, not just the blocks record', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)
    const { onBlocksChange } = renderCanvas([note])

    await moveNoteIntoNewPage(onBlocksChange)
    const created = [...sb._pages.values()].find((p) => p.parent_id === 'page-1')!
    expect(created).toBeDefined()

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(1))
    expect(trashPage).toHaveBeenCalledWith(expect.anything(), created.id)
    expect(restorePage).not.toHaveBeenCalled()
  })

  it('⇧⌘Z (redo) restores the trashed page', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)
    const { onBlocksChange } = renderCanvas([note])

    await moveNoteIntoNewPage(onBlocksChange)
    const created = [...sb._pages.values()].find((p) => p.parent_id === 'page-1')!

    await sessionUndo.undo('pond-1')
    await waitFor(() => expect(trashPage).toHaveBeenCalledWith(expect.anything(), created.id))

    // `onRedone` looks up the trash record `trashPage` made (as the database
    // path's own redo does) to find what to restore.
    jest.mocked(listRecords).mockResolvedValueOnce([{ id: 'record-trash-1' } as never])
    await sessionUndo.redo('pond-1')

    await waitFor(() => expect(restorePage).toHaveBeenCalledTimes(1))
    expect(restorePage).toHaveBeenCalledWith(expect.anything(), 'record-trash-1')
  })

  it('the toast undo button trashes the same page ⌘Z would (G9: never a second, orphaning revert)', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)
    const { onBlocksChange } = renderCanvas([note])
    const user = userEvent.setup()

    await moveNoteIntoNewPage(onBlocksChange)
    const created = [...sb._pages.values()].find((p) => p.parent_id === 'page-1')!

    await user.click(await screen.findByRole('button', { name: /undo/i }))

    await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(1))
    expect(trashPage).toHaveBeenCalledWith(expect.anything(), created.id)
  })
})
