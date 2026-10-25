/**
 * KAN-552 — the whole PATH_STEPS walk (the ticket's own spec section): a page
 * whose single stored text block is `"alpha\n\n## heading\n\n- one\n- two\n\n---"`
 * opens with four blocks and four handles; reloading without editing writes
 * nothing; typing in one block saves all four (stable ids `<id>`, `<id>-2`,
 * `<id>-3`, `<id>-4`); ⌘Z undoes that edit. Mounts the real `DocumentPanel`
 * beside the real `ShellCommands` (the ⌘Z owner), sharing one `sessionUndo`
 * stack — only the RPC boundary (`@/lib/change-log/undo`) is mocked, same
 * pattern as `kan-506-path.test.tsx`.
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
import { toBlocks } from '@/lib/pages/to-blocks'
import { writeInTextBlock } from './helpers/text-block'
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

// `session-undo.ts` stays real: this proves the save and ⌘Z's `undo` share
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
  mockSaveBlocks.mockResolvedValue(undefined)
  mockAppendOwnEdit.mockImplementation(async () => ({ id: `record-${++recordSeq}` }))
  jest.mocked(undoStep).mockResolvedValue({ outcome: 'done', records: [] })
  onPlatform('MacIntel')
  sessionUndo.clear()
})

afterEach(() => jest.restoreAllMocks())

// The stored row: ONE text block holding a paragraph, a heading, a list and a
// divider — what a page saved before KAN-506's slice A still holds (SPEC.md's
// PATH_STEPS, step 1). What `getPage`'s real `mapRow` (`toBlocks` →
// `splitStoredText`) returns for that row — computed with the real function,
// not hand-written, so this test fails if the split shape ever changes.
const storedBlock: Block = { id: 'b1', type: 'text', content: 'alpha\n\n## heading\n\n- one\n- two\n\n---' }
const splitBlocks = toBlocks([storedBlock])

function renderPath() {
  mockGetPage.mockResolvedValue({ id: 'page-1', title: 'Workshop', blocks: splitBlocks })
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
const handleOf = (id: string) => within(blockRoot(id)).getByRole('button', { name: /block menu/i })
const blockOrder = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]')).map((el) =>
    el.getAttribute('data-block-id')
  )

const undoRecord = (id: string): ChangeLogRecord => ({
  id,
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'edit',
  actor: 'you',
  targetPageId: 'page-1',
  targetBlockId: 'b1-2',
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

describe('PATH_STEPS — an old multi-paragraph block opens split, reloads clean, edits and undoes (KAN-552)', () => {
  it('walks the whole path: open split, reload writes nothing, edit saves four, ⌘Z undoes it', async () => {
    renderPath()

    // Step 1: open the page — the single stored block reads as four blocks,
    // four handles.
    await screen.findByLabelText('Page title')
    await waitFor(() => expect(blockOrder()).toEqual(['b1', 'b1-2', 'b1-3', 'b1-4']))
    for (const id of ['b1', 'b1-2', 'b1-3', 'b1-4']) expect(handleOf(id)).toBeInTheDocument()

    // Step 2: reload without editing — past the debounced save's own pause,
    // nothing was ever scheduled, so nothing lands.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700))
    })
    expect(mockSaveBlocks).not.toHaveBeenCalled()
    expect(mockAppendOwnEdit).not.toHaveBeenCalled()

    // Step 3: type in the heading block — the save writes all four blocks,
    // ids unchanged.
    const headingField = await textBlockIn('b1-2')
    writeInTextBlock(headingField, 'heading edited')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const afterEdit = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(afterEdit.map((b) => b.id)).toEqual(['b1', 'b1-2', 'b1-3', 'b1-4'])
    expect(afterEdit.find((b) => b.id === 'b1-2')).toMatchObject({ content: 'heading edited' })
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const editedRecordId = (await mockAppendOwnEdit.mock.results[0].value).id as string

    // Step 4: ⌘Z undoes that edit — the heading block's content comes back,
    // nothing else moves. `undoStep`'s record targets this page, so the
    // invalidation it triggers refetches `getPage` — mocked, for that one
    // refetch, to the blocks as they stood right before the edit (same
    // pattern as `kan-506-path.test.tsx`'s step 7).
    jest
      .mocked(undoStep)
      .mockResolvedValueOnce({ outcome: 'done', records: [undoRecord(editedRecordId)] })
    mockGetPage.mockResolvedValueOnce({ id: 'page-1', title: 'Workshop', blocks: splitBlocks })

    const user = userEvent.setup()
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: [editedRecordId],
    })
    await waitFor(() => expect(blockOrder()).toEqual(['b1', 'b1-2', 'b1-3', 'b1-4']))
    const revertedHeading = await textBlockIn('b1-2')
    await waitFor(() => expect(revertedHeading.textContent).not.toBe('heading edited'))
  })
})
