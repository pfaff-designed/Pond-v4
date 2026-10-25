/**
 * KAN-506 — the whole PATH_STEPS walk (the ticket's own spec section): open a
 * page with one text block, Enter at its end makes a new block with its own
 * handle, text typed into it is its own block, Shift+Enter breaks a line
 * inside that block without splitting it, Enter mid-text splits the ORIGINAL
 * block, Backspace on the resulting empty block removes it and returns focus
 * to the block above, and ⌘Z undoes that last structural write in one step.
 * Mounts the real `DocumentPanel` beside the real `ShellCommands` (the ⌘Z
 * owner), sharing one `sessionUndo` stack — only the RPC boundary
 * (`@/lib/change-log/undo`) is mocked, same pattern as
 * `block-canvas-split-undo-path.test.tsx`.
 */

import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep } from '@/lib/change-log/undo'
import { textEditorOf, writeInTextBlock } from './helpers/text-block'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'

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

// `session-undo.ts` stays real: this proves every structural write along the
// walk and ⌘Z's `undo` share one real stack. Only the RPC boundary is mocked.
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
const handleOf = (id: string) => within(blockRoot(id)).getByRole('button', { name: /drag to move/i })
const blockOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
    el.getAttribute('data-block-id')
  )

const undoRecord = (id: string): ChangeLogRecord => ({
  id,
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'undo',
  actor: 'you',
  targetPageId: 'page-1',
  targetBlockId: null,
  before: null,
  after: null,
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-10-24T00:00:00.000Z',
  statusAt: '2026-10-24T00:00:00.000Z',
})

describe('PATH_STEPS — Enter makes the next block, Shift+Enter breaks a line, Backspace and ⌘Z undo it (KAN-506)', () => {
  it('walks the whole path: open, Enter, type, Shift+Enter, split, Backspace, ⌘Z', async () => {
    const alpha: Block = { id: 'b-alpha', type: 'text', content: 'alpha beta' }
    renderPath([alpha])

    // Step 1: open a page with a text block "alpha beta".
    await screen.findByLabelText('Page title')
    expect(blockOrder()).toEqual(['b-alpha'])
    expect(handleOf('b-alpha')).toBeInTheDocument()

    const user = userEvent.setup()

    // Step 2: click at the end of it, Enter — a new empty text block appears
    // under it, focused, with its own handle.
    const alphaField = await textBlockIn('b-alpha')
    act(() => {
      textEditorOf(alphaField).commands.focus('end')
    })
    await waitFor(() => expect(alphaField).toHaveFocus())

    await user.keyboard('{Enter}')

    await waitFor(() => expect(blockOrder()).toEqual(['b-alpha', expect.any(String)]))
    const gammaId = blockOrder()[1]!
    expect(handleOf(gammaId)).toBeInTheDocument()
    let gammaField = await textBlockIn(gammaId)
    await waitFor(() => expect(gammaField).toHaveFocus())
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    // Step 3: type "gamma" in it — it stays its own block, not folded back
    // into "alpha beta".
    writeInTextBlock(gammaField, 'gamma')
    await waitFor(() => expect(gammaField.textContent).toBe('gamma'))
    expect(blockOrder()).toEqual(['b-alpha', gammaId])
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    // Step 4: Shift+Enter breaks the line INSIDE that block (still one
    // block); typing "delta" lands after the break, in the same block.
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    act(() => {
      textEditorOf(gammaField).commands.insertContent('delta')
    })
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const afterShiftEnter = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(afterShiftEnter.find((b) => b.id === gammaId)).toMatchObject({ content: 'gamma\ndelta' })
    expect(blockOrder()).toEqual(['b-alpha', gammaId])
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    // Step 5: Enter in the middle of "alpha beta" (after "alpha ") splits
    // the ORIGINAL block — "alpha " stays, "beta" becomes the next block,
    // caret at its start.
    gammaField = await textBlockIn(gammaId)
    const freshAlphaField = await textBlockIn('b-alpha')
    act(() => {
      textEditorOf(freshAlphaField).commands.focus(7)
    })
    await waitFor(() => expect(freshAlphaField).toHaveFocus())

    await user.keyboard('{Enter}')

    await waitFor(() => expect(blockOrder()).toHaveLength(3))
    const [, betaId] = blockOrder()
    expect(blockOrder()).toEqual(['b-alpha', betaId, gammaId])
    expect(handleOf(betaId!)).toBeInTheDocument()
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const afterSplit = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(afterSplit).toMatchObject([
      { id: 'b-alpha', type: 'text', content: 'alpha ' },
      { id: betaId, type: 'text', content: 'beta' },
      { id: gammaId, type: 'text', content: 'gamma\ndelta' },
    ])
    const betaField = await textBlockIn(betaId!)
    await waitFor(() => expect(betaField).toHaveFocus())
    expect(textEditorOf(betaField).state.selection.from).toBe(1)
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    // Step 6: make an empty block (Enter at the end of the last block), then
    // Backspace — it goes away and the caret sits at the end of the block
    // above.
    const lastField = await textBlockIn(gammaId)
    act(() => {
      textEditorOf(lastField).commands.focus('end')
    })
    await waitFor(() => expect(lastField).toHaveFocus())

    await user.keyboard('{Enter}')

    await waitFor(() => expect(blockOrder()).toHaveLength(4))
    const emptyId = blockOrder()[3]!
    const emptyField = await textBlockIn(emptyId)
    await waitFor(() => expect(emptyField).toHaveFocus())
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    await user.keyboard('{Backspace}')

    await waitFor(() => expect(blockOrder()).toEqual(['b-alpha', betaId, gammaId]))
    const gammaAgain = await textBlockIn(gammaId)
    await waitFor(() => expect(gammaAgain).toHaveFocus())
    expect(textEditorOf(gammaAgain).state.selection.from).toBe(
      textEditorOf(gammaAgain).state.doc.content.size - 1
    )
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const removedRecordId = (await mockAppendOwnEdit.mock.results[0].value).id as string

    // Step 7: ⌘Z undoes the last structural write in one step — the
    // Backspace removal just above, not the typed edits that came before it
    // or the split from step 5 further down the stack. `undoStep`'s record
    // targets this page, so the invalidation it triggers refetches `getPage`
    // — mocked, for that one refetch, to the blocks as they stood right
    // after step 6's Enter (empty block still there) — proving the block
    // actually comes back, not just that `undoStep` was called (same pattern
    // as `block-canvas-split-undo-path.test.tsx`).
    jest
      .mocked(undoStep)
      .mockResolvedValueOnce({ outcome: 'done', records: [undoRecord(removedRecordId)] })
    mockGetPage.mockResolvedValueOnce({
      id: 'page-1',
      title: 'Workshop',
      blocks: [
        { id: 'b-alpha', type: 'text', content: 'alpha ' },
        { id: betaId, type: 'text', content: 'beta' },
        { id: gammaId, type: 'text', content: 'gamma\ndelta' },
        { id: emptyId, type: 'text', content: '' },
      ],
    })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: [removedRecordId],
    })
    await waitFor(() => expect(blockOrder()).toEqual(['b-alpha', betaId, gammaId, emptyId]))
  })
})
