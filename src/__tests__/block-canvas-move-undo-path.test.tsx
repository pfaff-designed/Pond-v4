/**
 * KAN-368 — ⌥↑/⌥↓ writes through `persistBlocksAsOwnEdit`, not the debounced
 * `onChange`: one press is one ⌘Z step, and two quick presses (fired before
 * the first write's round trip returns) are two steps, undone in order (the
 * ticket's own "try to break it" line). Mounts the real `DocumentPanel`
 * beside the real `ShellCommands` (the ⌘Z owner), sharing one `sessionUndo`
 * stack — only the RPC boundary (`@/lib/change-log/undo`) is mocked, same
 * pattern as `block-canvas-side-by-side-path.test.tsx`'s part 2.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep } from '@/lib/change-log/undo'
import type { Block } from '@/lib/documents/types'

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'page-1' : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

const mockGetUser = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: (...args: unknown[]) => mockGetUser(...args) } }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePondId: () => 'pond-1',
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
  saveProps: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn().mockResolvedValue(undefined),
}))

const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

// `session-undo.ts` stays real (like the side-by-side path's part 2): this
// proves the move's `rememberPending` and ⌘Z's `undo` share one real stack.
// Only the RPC boundary is mocked.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

let recordSeq = 0

beforeEach(() => {
  jest.clearAllMocks()
  recordSeq = 0
  mockSaveBlocks.mockResolvedValue(undefined)
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  onPlatform('MacIntel')
  sessionUndo.clear()
})

afterEach(() => jest.restoreAllMocks())

function renderPath(blocks: Block[]) {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (id: string) => document.getElementById(`block-${id}`)!
const blockOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
    el.getAttribute('data-block-id')
  )

const tool = (id: string, name: string): Block => ({
  id,
  type: 'table',
  columns: ['Tool'],
  rows: [{ id: `r-${id}`, cells: [name] }],
})

describe('⌥↓ moves a block through persistBlocksAsOwnEdit, one press one step (KAN-368)', () => {
  it('one ⌥↓ is one ⌘Z step', async () => {
    const [a, b, c] = [tool('b-a', 'Saw'), tool('b-b', 'Plane'), tool('b-c', 'Chisel')]
    renderPath([a, b, c])
    await screen.findByLabelText('Page title')

    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-a', 'b-c']))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })

  it('two quick ⌥↓ presses give two steps, undone in order', async () => {
    const [a, b, c] = [tool('b-a', 'Saw'), tool('b-b', 'Plane'), tool('b-c', 'Chisel')]
    renderPath([a, b, c])
    await screen.findByLabelText('Page title')

    // Both presses fire before either write's round trip has returned.
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(2))
    // `a` moved down past BOTH neighbours — the second press advanced the
    // first move's result, it did not record the same swap twice.
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-c', 'b-a']))

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-2'],
    })

    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
    expect(undoStep).toHaveBeenLastCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })
})

describe('offline saveBlocks failure never merges with the next write (KAN-368)', () => {
  it('two quick ⌥↓ presses roll back to the original order with no step remembered', async () => {
    const [a, b, c] = [tool('b-a', 'Saw'), tool('b-b', 'Plane'), tool('b-c', 'Chisel')]
    renderPath([a, b, c])
    await screen.findByLabelText('Page title')
    mockSaveBlocks.mockRejectedValue(new Error('offline'))

    // Both presses fire before either write's round trip has returned.
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalled())
    // The second write is cancelled, not raced: at most the first write's
    // own `saveBlocks` call, never one for a stale `before` the second write
    // computed on top of it.
    await waitFor(() => expect(blockOrder()).toEqual(['b-a', 'b-b', 'b-c']))
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    // Neither write left a real step: one ⌘Z drains both pending (empty)
    // entries off the stack without ever reaching the RPC.
    await waitFor(() => expect(sessionUndo.getSnapshot('pond-1').canUndo).toBe(false))
    expect(undoStep).not.toHaveBeenCalled()
  })
})

describe('a throw inside the write body never wedges the write chain (KAN-368)', () => {
  it('getUser throws once, the next ⌥↓ still saves', async () => {
    const [a, b, c] = [tool('b-a', 'Saw'), tool('b-b', 'Plane'), tool('b-c', 'Chisel')]
    renderPath([a, b, c])
    await screen.findByLabelText('Page title')
    mockGetUser.mockRejectedValueOnce(new Error('session expired'))

    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })

    // The save itself still landed — `getUser` throwing only loses the
    // own-edit log, same as the existing no-user branch.
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-a', 'b-c']))
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })

    // A rejected `getUser` must not leave `writeChainRef` permanently
    // rejected: the NEXT structural write still reaches `saveBlocks`.
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-c', 'b-a']))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
  })
})
