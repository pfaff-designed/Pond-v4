/**
 * KAN-368 — `onSourcePick`'s view placement writes through `persistBlocksAsOwnEdit`
 * for both branches. The new-database branch's step carries `onUndone`/`onRedone`
 * side effects that trash/restore the database it made (ticket comment 10238: ⌘Z
 * right after inserting a view must take the database back too); the existing-
 * database branch carries neither. Harness mirrors
 * `block-canvas-new-database-options.test.tsx` (the real `BlockCanvas`, real
 * `createDatabase` against `makeFakeSupabase`) — `saveBlocks`/`appendOwnEdit` are
 * mocked (same shape as the other KAN-368 undo-path tests) so a sparse
 * change-log row never has to round-trip `mapChangeLogRow`; `trashPage`/
 * `restorePage` are mocked so the assertion is "was it called", not the RPC's own
 * job. `sessionUndo.undo` is called directly — this item is the engine's side
 * effect wiring, not the ⌘Z key binding, which the other KAN-368 path tests
 * already cover.
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BlockCanvas } from '@/components/organisms/BlockCanvas'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep } from '@/lib/change-log/undo'
import { trashPage, restorePage } from '@/lib/change-log/trash'
import type { Block } from '@/lib/documents/types'
import { createPageWriter, type PageWriteState } from '@/lib/pages/commit'
import { createPageWriteQueue } from '@/lib/pages/page-write-queue'
import type { PageRow } from '@/lib/pages/tree'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'
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

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockFetchPages = jest.fn()
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: (...args: unknown[]) => mockFetchPages(...args),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
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

// `session-undo.ts` stays real: this proves the view-insert's `rememberPending`
// and its `onUndone`/`onRedone` side effects run off one real stack. Only the
// RPC boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

function Harness({ initial }: { initial: Block[] }) {
  const [blocks, setBlocks] = React.useState(initial)
  const queryClient = useQueryClient()
  const queueRef = React.useRef<ReturnType<typeof createPageWriteQueue<PageWriteState>> | null>(
    null
  )

  const onStructuralWrite = async (
    next: Block[],
    opts?: {
      onUndone?: () => Promise<void> | void
      onRedone?: () => Promise<void> | void
    }
  ) => {
    setBlocks(next)
    if (!queueRef.current) {
      queueRef.current = createPageWriteQueue(
        createPageWriter(mockCreateClient(), queryClient, 'page-1', 'pond-1'),
        {
          title: 'trip planning',
          blocks: initial,
        }
      )
    }
    let resolveIds: (ids: readonly string[] | null) => void = () => {}
    const recordIds = new Promise<readonly string[] | null>((resolve) => {
      resolveIds = resolve
    })
    sessionUndo.rememberPending({
      pondId: 'pond-1',
      recordIds,
      onUndone: opts?.onUndone,
      onRedone: opts?.onRedone,
    })
    await queueRef.current.enqueue({
      kind: 'structural',
      after: { title: 'trip planning', blocks: next },
      onPending: resolveIds,
    })
    return true
  }

  return (
    <BlockCanvas
      blocks={blocks}
      pageId="page-1"
      pageTitle="trip planning"
      onChange={setBlocks}
      onStructuralWrite={onStructuralWrite}
      onUndoRemove={() => {}}
    />
  )
}

function renderCanvas(blocks: Block[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <Harness initial={blocks} />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  recordSeq = 0
  mockFetchPages.mockResolvedValue([])
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  sessionUndo.clear()
})

/** Opens `/board` on an empty page. `new tasks` is preselected when no
 *  databases exist; the caller picks that row or an existing one. */
async function openBoardSource(): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId('trailing-block-gap'))
  const editor = await findTextBlock()
  writeInTextBlock(editor, '/')
  await screen.findByRole('listbox', { name: 'blocks' })
  writeInTextBlock(editor, '/board')
  const menu = await screen.findByRole('listbox', { name: 'blocks' })
  fireEvent.click(within(menu).getByRole('option', { name: 'board' }))
  return screen.findByRole('listbox', { name: '/board' })
}

describe('a view insert writes one ⌘Z step whose side effects match its database (KAN-368)', () => {
  it('undoing a view onto a NEW database trashes that database', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)

    renderCanvas([])
    await openBoardSource()
    fireEvent.keyDown(document, { key: 'Enter' })

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    const database = [...sb._pages.values()].find((p) => p.parent_id !== null)!
    expect(database).toBeDefined()

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(trashPage).toHaveBeenCalledTimes(1))
    expect(trashPage).toHaveBeenCalledWith(expect.anything(), database.id)
    expect(restorePage).not.toHaveBeenCalled()
  })

  it('undoing a view onto an EXISTING database leaves it alone', async () => {
    const sb = makeFakeSupabase([])
    mockCreateClient.mockReturnValue(sb)
    const now = new Date().toISOString()
    const rootRow: PageRow = {
      id: 'root-db',
      parent_id: null,
      type: 'page',
      title: 'databases',
      order: 9,
      updated_at: now,
    }
    const dbRow: PageRow = {
      id: 'db-1',
      parent_id: 'root-db',
      type: 'page',
      title: 'tasks',
      order: 0,
      updated_at: now,
    }
    mockFetchPages.mockResolvedValue([rootRow, dbRow])

    renderCanvas([])
    const source = await openBoardSource()
    fireEvent.click(within(source).getByRole('option', { name: /^tasks/ }))

    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    await sessionUndo.undo('pond-1')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(trashPage).not.toHaveBeenCalled()
    expect(restorePage).not.toHaveBeenCalled()
  })
})
