/**
 * KAN-368 — ⌘⌫ / the handle menu's "delete" (`removeBlockAt`) writes through
 * `persistBlocksAsOwnEdit`, not `stageDeletion`'s deferred-commit: the write
 * lands at once, so there is nothing left to defer. The toast reads
 * `deleted <blockName> ·` with a clickable `undo` button that runs the same
 * `sessionUndo.undo` step ⌘Z does, so a mouse user can act on it too.
 * Mounts the real `DocumentPanel` beside the real `ShellCommands` (the ⌘Z
 * owner), sharing one `sessionUndo` stack — only the RPC boundary
 * (`@/lib/change-log/undo`) is mocked, same pattern as
 * `block-canvas-backspace-undo-path.test.tsx`.
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
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

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
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

// The chart card row's own delete/undo test below never reads real
// collection rows — only that the row selects and ⌘⌫ reaches it.
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: [],
    rows: [],
    isLoading: false,
    isError: false,
    setValue: jest.fn(),
    addRow: jest.fn(),
    removeRow: jest.fn(),
    renameRow: jest.fn(),
    updateSchema: jest.fn(),
  }),
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

// `session-undo.ts` stays real: this proves the delete's `rememberPending`
// and ⌘Z's `undo` share one real stack. Only the RPC boundary is mocked.
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
const textBlockIn = (id: string) =>
  within(blockRoot(id)).findByRole('textbox', { name: 'text block' })

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('⌘⌫ writes through persistBlocksAsOwnEdit, one ⌘Z step (KAN-368)', () => {
  it('⌘⌫ then ⌘Z at once restores the block with its content', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const removed: Block = { id: 'b-removed', type: 'text', content: 'cabinets' }
    renderPath([kept, removed])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const field = await textBlockIn('b-removed')
    field.focus()
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    expect(mockSaveBlocks.mock.calls[0][2].map((b: Block) => b.id)).toEqual(['b-kept'])
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('deleted text ·')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })

  it('⌘⌫ then, 2 seconds later, ⌘Z still restores the block with its content', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const removed: Block = { id: 'b-removed', type: 'text', content: 'cabinets' }
    renderPath([kept, removed])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const field = await textBlockIn('b-removed')
    field.focus()
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('deleted text ·')).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 2000))

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  }, 10000)

  it('⌘⌫ on B then ⌘⌫ on C before the first write settles removes both, as two steps', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const removedFirst: Block = { id: 'b-removed-first', type: 'text', content: 'cabinets' }
    const removedSecond: Block = { id: 'b-removed-second', type: 'text', content: 'countertops' }
    renderPath([kept, removedFirst, removedSecond])
    await screen.findByLabelText('Page title')

    // Holds B's own write open — C's delete must still see B already gone,
    // read from `blocksRef.current`, not the stale pre-write `blocks` prop.
    const firstSave = deferred<void>()
    mockSaveBlocks.mockReturnValueOnce(firstSave.promise)

    const user = userEvent.setup()
    const fieldB = await textBlockIn('b-removed-first')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('cabinets')).not.toBeInTheDocument())
    // `removeBlockAt`'s own neighbour-focus runs on a macrotask (`setTimeout(0)`,
    // deferred past Base UI's own close-focus microtask) — let it land before
    // focusing C explicitly, or it would steal focus back mid-keypress.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const fieldC = await textBlockIn('b-removed-second')
    fieldC.focus()
    await waitFor(() => expect(fieldC).toHaveFocus())
    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    // C is gone on screen at once (the local apply), but its write is
    // serialized behind B's still-open one (KAN-368): no second `saveBlocks`
    // call until B's settles.
    await waitFor(() => expect(screen.queryByText('countertops')).not.toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockSaveBlocks).toHaveBeenCalledTimes(1)
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    firstSave.resolve()
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(2))
    // C's write starts from B already removed, not the original three blocks.
    expect(mockSaveBlocks.mock.calls[1][2].map((b: Block) => b.id)).toEqual(['b-kept'])
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(2))

    expect(screen.queryByText('cabinets')).not.toBeInTheDocument()
    expect(screen.queryByText('countertops')).not.toBeInTheDocument()
    expect(screen.getByText('the only open cost')).toBeInTheDocument()

    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
  })

  it('⌘⌫ on the selected row, then clicking the toast’s undo restores the block with one undo RPC', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const removed: Block = { id: 'b-removed', type: 'text', content: 'cabinets' }
    renderPath([kept, removed])
    await screen.findByLabelText('Page title')

    jest.mocked(undoStep).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-1' }],
    } as never)

    const user = userEvent.setup()
    const row = blockRoot('b-removed')
    row.focus()
    await waitFor(() => expect(row).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('cabinets')).not.toBeInTheDocument()
    expect(await screen.findByText('deleted text ·')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'undo' }))

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('cabinets')).toBeInTheDocument()
  })

  it('⌘⌫ then ⌘Z restores the block; the stale toast’s undo then does nothing (KAN-368)', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const removed: Block = { id: 'b-removed', type: 'text', content: 'cabinets' }
    renderPath([kept, removed])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const field = await textBlockIn('b-removed')
    field.focus()
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const undoButton = await screen.findByRole('button', { name: 'undo' })

    jest.mocked(undoStep).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-1' }],
    } as never)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('cabinets')).toBeInTheDocument()

    // The toast outlives ⌘Z (nothing dismisses it): its own step already moved
    // off the top of the undo stack, so clicking its stale "undo" must not
    // run `sessionUndo.undo` again.
    await user.click(undoButton)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(undoStep).toHaveBeenCalledTimes(1)
  })

  it('⌘⌫ on a selected chart card row, then confirm, deletes it; ⌘Z restores it', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const chart: Block = {
      id: 'b-chart',
      type: 'view',
      mode: 'chart',
      label: 'weight',
      chart: { kind: 'line', xProperty: 'p-date', series: [{ property: 'p-kg', agg: 'sum' }] },
    }
    renderPath([kept, chart])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const row = blockRoot('b-chart')
    row.focus()
    await waitFor(() => expect(row).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    expect(mockSaveBlocks.mock.calls[0][2].map((b: Block) => b.id)).toEqual(['b-kept'])
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })

  it('⌘⌫ on a focused handle deletes that block', async () => {
    const kept: Block = { id: 'b-kept', type: 'text', content: 'the only open cost' }
    const removed: Block = { id: 'b-removed', type: 'text', content: 'cabinets' }
    renderPath([kept, removed])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const handle = within(blockRoot('b-removed')).getByRole('button', { name: 'drag to move' })
    handle.focus()
    await waitFor(() => expect(handle).toHaveFocus())

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    expect(mockSaveBlocks.mock.calls[0][2].map((b: Block) => b.id)).toEqual(['b-kept'])
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('deleted text ·')).toBeInTheDocument()
  })
})
