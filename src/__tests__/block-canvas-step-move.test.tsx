/**
 * KAN-376 — ⌥↑/⌥↓ steps a block past a whole row, or out of a row onto its
 * own line, never splitting the row; ⌥←/⌥→ swaps a selected block with its
 * row-mate, never from inside a text editor (where those keys jump a word).
 * Each press writes through `persistBlocksAsOwnEdit` as its own ⌘Z step —
 * same harness as `block-canvas-move-undo-path.test.tsx` (KAN-368).
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { resetPageWriteRegistry } from '@/lib/pages/page-flush'
import { undoStep } from '@/lib/change-log/undo'
import { findTextBlock } from '@/__tests__/helpers/text-block'
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
  usePond: () => ({ pond: { id: 'pond-1', name: 'Workshop' }, ponds: [], loading: false }),
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

const mockAppendOwnEdit = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
}))

jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

let recordSeq = 0

beforeEach(() => {
  resetPageWriteRegistry()
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
const savedBlocks = () => mockSaveBlocks.mock.calls[mockSaveBlocks.mock.calls.length - 1][2] as Block[]

// Non-text (tabIndex 0): the row itself can take keyboard focus and become
// "selected" (07.05) without KAN-367, unlike a text block.
const table = (id: string, name: string, width?: '1/2', rowStart?: boolean): Block => ({
  id,
  type: 'table',
  columns: ['Tool'],
  rows: [{ id: `r-${id}`, cells: [name] }],
  ...(width ? { width } : {}),
  ...(rowStart ? { rowStart: true } : {}),
})

describe('⌥↑/⌥↓ steps past a whole row, never splitting it (KAN-376)', () => {
  it('a full block above a ½+½ row steps down below the whole row; the row stays intact', async () => {
    const text: Block = { id: 'b-text', type: 'text', content: 'full' }
    const a = table('b-a', 'Saw', '1/2', true)
    const b = table('b-b', 'Plane', '1/2')
    renderPath([text, a, b])
    const field = await findTextBlock()

    fireEvent.keyDown(field, { key: 'ArrowDown', altKey: true })

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(blockOrder()).toEqual(['b-a', 'b-b', 'b-text']))
    expect(savedBlocks().find((bl) => bl.id === 'b-a')).toMatchObject({ rowStart: true })
    expect(savedBlocks().find((bl) => bl.id === 'b-text')).toMatchObject({ rowStart: true })

    // Selecting the left half and swapping it right stays in the same row.
    fireEvent.focus(blockRoot('b-a'))
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowRight', altKey: true })

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-a', 'b-text']))
    expect(savedBlocks().find((bl) => bl.id === 'b-b')).toMatchObject({ rowStart: true })
    expect(savedBlocks().find((bl) => bl.id === 'b-a')).not.toMatchObject({ rowStart: true })

    // ⌥↓ on the now-selected `a` leaves the row onto its own full line below
    // `b`, which keeps its ½ — the row is never left split.
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowDown', altKey: true })

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(blockOrder()).toEqual(['b-b', 'b-a', 'b-text']))
    expect(savedBlocks().find((bl) => bl.id === 'b-a')).toMatchObject({
      width: 'full',
      rowStart: true,
    })
    expect(savedBlocks().find((bl) => bl.id === 'b-b')).toMatchObject({ width: '1/2' })
  })

  it('⌥→ with the caret in a text editor jumps a word, even when the text block has a real row-mate', async () => {
    const text: Block = { id: 'b-text', type: 'text', content: 'full width here', width: '1/2', rowStart: true }
    const b = table('b-b', 'Plane', '1/2')
    renderPath([text, b])
    const field = await findTextBlock()

    const notPrevented = fireEvent.keyDown(field, { key: 'ArrowRight', altKey: true })

    // `dispatchEvent` returns `true` only when nothing called `preventDefault`
    // — the browser's own word-jump must still run.
    expect(notPrevented).toBe(true)
    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(blockOrder()).toEqual(['b-text', 'b-b'])
  })
})

describe('two step presses are two separate ⌘Z steps, undone in order (KAN-376, KAN-368)', () => {
  it('⌥↓ then ⌥→ each log their own record, undone most-recent-first', async () => {
    const a = table('b-a', 'Saw', '1/2', true)
    const b = table('b-b', 'Plane', '1/2')
    const c = table('b-c', 'Chisel')
    renderPath([a, b, c])
    await screen.findByLabelText('Page title')

    fireEvent.keyDown(blockRoot('b-c'), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    fireEvent.focus(blockRoot('b-a'))
    fireEvent.keyDown(blockRoot('b-a'), { key: 'ArrowRight', altKey: true })
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(2))

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
