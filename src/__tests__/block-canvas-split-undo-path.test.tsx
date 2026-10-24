/**
 * KAN-506 — Enter splitting a text block writes through `persistBlocksAsOwnEdit`
 * in one `commitStructuralBlocks` call (`insertLineAfter`'s patch + insert
 * together): the split (two blocks) and the characters typed just before
 * Enter are one ⌘Z step. Mounts the real `DocumentPanel` beside the real
 * `ShellCommands` (the ⌘Z owner), sharing one `sessionUndo` stack — only the
 * RPC boundary (`@/lib/change-log/undo`) is mocked, same pattern as
 * `block-canvas-insert-undo-path.test.tsx`. ⌘Z's `undoStep` resolves a record
 * targeting this page, so the invalidation it triggers refetches `getPage` —
 * mocked, for that one refetch, to the pre-split single block — proving the
 * blocks actually return, not just that `undoStep` was called.
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

// `session-undo.ts` stays real: this proves the split's `rememberPending` and
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

describe('Enter splitting a text block writes through persistBlocksAsOwnEdit, one ⌘Z step (KAN-506)', () => {
  it('split then ⌘Z rejoins the text, including what was typed just before Enter', async () => {
    const alpha: Block = { id: 'b-alpha', type: 'text', content: '' }
    renderPath([alpha])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const field = await textBlockIn('b-alpha')
    writeInTextBlock(field, 'alpha beta')
    await waitFor(() => expect(field.textContent).toBe('alpha beta'))

    // Let the typed debounce save of "alpha beta" land as its own step before
    // Enter: otherwise Enter's own flush of that still-pending save would be a
    // second `saveBlocks` call, and this test is the split's one call, not that
    // flush's.
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    // Position 7: right after "alpha " — the split lands exactly where the
    // caret was, keeping the trailing space with the text before it.
    act(() => {
      textEditorOf(field).commands.focus(7)
    })
    await waitFor(() => expect(field).toHaveFocus())

    await user.keyboard('{Enter}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const saved = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(saved).toHaveLength(2)
    expect(saved[0]).toMatchObject({ id: 'b-alpha', type: 'text', content: 'alpha ' })
    expect(saved[1]).toMatchObject({ type: 'text', content: 'beta' })
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const splitRecordId = (await mockAppendOwnEdit.mock.results[0].value).id as string

    jest
      .mocked(undoStep)
      .mockResolvedValueOnce({ outcome: 'done', records: [undoRecord(splitRecordId)] })
    mockGetPage.mockResolvedValueOnce({
      id: 'page-1',
      title: 'Workshop',
      blocks: [{ id: 'b-alpha', type: 'text', content: 'alpha beta' }],
    })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: [splitRecordId],
    })

    await waitFor(async () => {
      const rejoined = await textBlockIn('b-alpha')
      expect(rejoined.textContent).toBe('alpha beta')
    })
    expect(document.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })
})
