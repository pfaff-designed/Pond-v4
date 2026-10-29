/**
 * KAN-570 — the ticket's own PATH_STEPS walk: open a page with two ½-width
 * blocks side by side, caret at the end of the RIGHT-hand one, Enter makes
 * the new block directly under it sharing its column (the LEFT block
 * untouched), typing lands in that new block, a reload (a fresh `getPage`
 * fetch of the blocks as saved, `column` included) still renders it grouped
 * under the right column, and ⌘Z takes the whole insert back out. Mounts the
 * real `DocumentPanel` beside the real `ShellCommands` (the ⌘Z owner),
 * sharing one real `sessionUndo` stack — only the RPC boundary
 * (`@/lib/change-log/undo`) is mocked, same pattern as `kan-506-path.test.tsx`.
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

// `session-undo.ts` stays real: this proves the Enter's structural write and
// ⌘Z's `undo` share one real stack. Only the RPC boundary is mocked.
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
  const result = render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { ...result, client }
}

const blockRoot = (id: string) => document.getElementById(`block-${id}`)!
const textBlockIn = (id: string) =>
  within(blockRoot(id)).findByRole('textbox', { name: 'text block' })
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
  createdAt: '2026-10-28T00:00:00.000Z',
  statusAt: '2026-10-28T00:00:00.000Z',
})

describe('PATH_STEPS — Enter in the right-hand column block stays in that column, round-trips, and undoes (KAN-570)', () => {
  it('walks the whole path: open two ½ blocks, Enter on the right, type, reload, ⌘Z', async () => {
    const left: Block = { id: 'b-left', type: 'text', content: 'left', width: '1/2', rowStart: true }
    const right: Block = { id: 'b-right', type: 'text', content: 'right', width: '1/2' }
    const { client } = renderPath([left, right])

    // Step 1: open a page with two ½-width blocks side by side.
    await screen.findByLabelText('Page title')
    expect(blockOrder()).toEqual(['b-left', 'b-right'])

    const user = userEvent.setup()

    // Step 2-3: caret at the end of the RIGHT-hand block, Enter — a new empty
    // block appears directly under it, sharing its column; the left block is
    // untouched.
    const rightField = await textBlockIn('b-right')
    act(() => {
      textEditorOf(rightField).commands.focus('end')
    })
    await waitFor(() => expect(rightField).toHaveFocus())

    await user.keyboard('{Enter}')

    await waitFor(() => expect(blockOrder()).toEqual(['b-left', 'b-right', expect.any(String)]))
    const newId = blockOrder()[2]!
    let newField = await textBlockIn(newId)
    await waitFor(() => expect(newField).toHaveFocus())
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const afterEnter = mockSaveBlocks.mock.calls[0][2] as Block[]
    const leftAfterEnter = afterEnter.find((b) => b.id === 'b-left')!
    expect(leftAfterEnter).toMatchObject({ width: '1/2', rowStart: true })
    expect(leftAfterEnter.column).toBeUndefined()
    const rightAfterEnter = afterEnter.find((b) => b.id === 'b-right')!
    const newAfterEnter = afterEnter.find((b) => b.id === newId)!
    expect(rightAfterEnter.column).toBeDefined()
    expect(newAfterEnter.column).toBe(rightAfterEnter.column)
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const insertRecordId = (await mockAppendOwnEdit.mock.results[0].value).id as string
    const columnId = rightAfterEnter.column as string
    mockSaveBlocks.mockClear()

    // Step 4: type in the new block — it stays under the right column.
    newField = await textBlockIn(newId)
    writeInTextBlock(newField, 'noted')
    await waitFor(() => expect(newField.textContent).toBe('noted'))
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const afterType = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(afterType.find((b) => b.id === newId)).toMatchObject({
      content: 'noted',
      column: columnId,
    })
    expect(afterType.find((b) => b.id === 'b-right')).toMatchObject({ column: columnId })
    expect(afterType.find((b) => b.id === 'b-left')!.column).toBeUndefined()
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(2))
    const typeRecordId = (await mockAppendOwnEdit.mock.results[1].value).id as string

    // Step 5: reload — a fresh `getPage` fetch of the blocks exactly as
    // saved (`column` included) still renders the new block grouped under
    // the right column, in the same order.
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks: afterType })
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['page', 'page-1'] })
    })
    await waitFor(() => expect(blockOrder()).toEqual(['b-left', 'b-right', newId]))
    await waitFor(async () => expect((await textBlockIn(newId)).textContent).toBe('noted'))

    // Step 6: ⌘Z — the session-undo stack is LIFO, one step per save
    // (KAN-570's Enter is itself exactly one of those steps, never
    // fragmented), so the first press takes back the typed-content save
    // (the block stays, grouped, but empty again)...
    jest
      .mocked(undoStep)
      .mockResolvedValueOnce({ outcome: 'done', records: [undoRecord(typeRecordId)] })
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks: afterEnter })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: [typeRecordId],
    })
    await waitFor(() => expect(blockOrder()).toEqual(['b-left', 'b-right', newId]))
    await waitFor(async () => expect((await textBlockIn(newId)).textContent).toBe(''))

    // ...and the second takes back the Enter itself — the new block is gone
    // and the row returns to just the two original blocks, unchanged.
    jest
      .mocked(undoStep)
      .mockResolvedValueOnce({ outcome: 'done', records: [undoRecord(insertRecordId)] })
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks: [left, right] })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(2))
    expect(undoStep).toHaveBeenNthCalledWith(2, expect.anything(), {
      pondId: 'pond-1',
      recordIds: [insertRecordId],
    })
    await waitFor(() => expect(blockOrder()).toEqual(['b-left', 'b-right']))
  })
})
