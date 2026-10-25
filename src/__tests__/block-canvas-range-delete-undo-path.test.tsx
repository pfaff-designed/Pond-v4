/**
 * KAN-373 slice A — PATH_STEPS, the person's path, on the real `DocumentPanel`
 * beside the real `ShellCommands` (the ⌘Z/⇧⌘Z owner), mirroring
 * `block-canvas-delete-undo-path.test.tsx`'s harness: only the RPC boundary
 * (`@/lib/change-log/undo`) is mocked, so `requestDeleteRange`'s toast and
 * ⌘Z/⇧⌘Z share one real `sessionUndo` stack. Click into block 2 → Esc →
 * ⇧↓ ⇧↓ selects blocks 2–4 → ⌫ → confirm (all three hold text) → one toast,
 * `deleted 3 blocks ·` → ⌘Z restores all three in place → ⇧⌘Z removes them
 * again.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import type { Block } from '@/lib/documents/types'
import type { PropertySchema } from '@/lib/properties/schema'
import type { CollectionRow } from '@/lib/modules/view/apply'

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

const collection = { schema: [] as PropertySchema, rows: [] as CollectionRow[] }
jest.mock('@/lib/modules/view/use-collection-rows', () => ({
  useCollectionRows: () => ({
    schema: collection.schema,
    rows: collection.rows,
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

// `session-undo.ts` stays real (as `block-canvas-delete-undo-path.test.tsx`
// does): this proves the range delete's `rememberPending` and ⌘Z/⇧⌘Z share
// one real stack. Only the RPC boundary is mocked.
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
  collection.schema = []
  collection.rows = []
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  jest.mocked(redoStep).mockResolvedValue({ outcome: 'done', records: [] })
  onPlatform('MacIntel')
  sessionUndo.clear()
})

afterEach(() => jest.restoreAllMocks())

function renderPath() {
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
// A text block is bare prose, not a `PondBlock` card: `selected` draws the
// library's ring directly on `[data-part="prose"]` rather than setting
// `data-block-state` (kan-367-path.test.tsx asserts the same ring).
const proseSelected = (id: string) =>
  blockRoot(id).querySelector('[data-part="prose"]')?.classList.contains('ring-mn-text') ?? false

describe('PATH_STEPS: ⇧↓ ⇧↓ selects a range, ⌫ deletes it in one step, ⌘Z/⇧⌘Z (KAN-373)', () => {
  it('click into block 2 → Esc → ⇧↓ ⇧↓ → three selected → ⌫ → confirm → toast → ⌘Z restores all three → ⇧⌘Z removes them again', async () => {
    const blocks: Block[] = [
      { id: 'b-1', type: 'text', content: 'one' },
      { id: 'b-2', type: 'text', content: 'two' },
      { id: 'b-3', type: 'text', content: 'three' },
      { id: 'b-4', type: 'text', content: 'four' },
      { id: 'b-5', type: 'text', content: 'five' },
    ]
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks })
    renderPath()
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()

    // Click into block 2, then Esc selects its row (KAN-367). jsdom has no
    // layout, so a real pointer click would reach ProseMirror's own
    // `posAtCoords` (`elementFromPoint`, unimplemented in jsdom) — focus
    // the field directly instead, same as `kan-367-path.test.tsx`.
    const field = await textBlockIn('b-2')
    field.focus()
    await waitFor(() => expect(field).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(blockRoot('b-2')).toHaveFocus())

    // ⇧↓ ⇧↓ extends the range to blocks 2, 3 and 4.
    fireEvent.keyDown(blockRoot('b-2'), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(blockRoot('b-3'), { key: 'ArrowDown', shiftKey: true })
    expect(proseSelected('b-1')).toBe(false)
    expect(proseSelected('b-2')).toBe(true)
    expect(proseSelected('b-3')).toBe(true)
    expect(proseSelected('b-4')).toBe(true)
    expect(proseSelected('b-5')).toBe(false)

    // ⌫ on the range's focus end asks to confirm — all three hold text.
    fireEvent.keyDown(blockRoot('b-4'), { key: 'Backspace' })
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete 3 blocks?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    expect(mockSaveBlocks.mock.calls[0][2].map((b: Block) => b.id)).toEqual(['b-1', 'b-5'])
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('deleted 3 blocks ·')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    expect(screen.queryByText('two')).not.toBeInTheDocument()
    expect(screen.queryByText('three')).not.toBeInTheDocument()
    expect(screen.queryByText('four')).not.toBeInTheDocument()

    // ⌘Z restores all three, in place, with the page refetched from the
    // (mocked) server — same mechanism `block-canvas-delete-undo-path.test.tsx`
    // proves for a single block.
    jest.mocked(undoStep).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-1' }],
    } as never)
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks })
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('two')).toBeInTheDocument()
    expect(screen.getByText('three')).toBeInTheDocument()
    expect(screen.getByText('four')).toBeInTheDocument()

    // ⇧⌘Z removes them again.
    jest.mocked(redoStep).mockResolvedValueOnce({
      outcome: 'done',
      records: [{ targetPageId: 'page-1' }],
    } as never)
    const afterDelete = blocks.filter((b) => b.id === 'b-1' || b.id === 'b-5')
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks: afterDelete })
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')

    await waitFor(() => expect(redoStep).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockGetPage).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.queryByText('two')).not.toBeInTheDocument())
    expect(screen.queryByText('three')).not.toBeInTheDocument()
    expect(screen.queryByText('four')).not.toBeInTheDocument()
  })
})
