/**
 * KAN-480 build item 6 — a toggle's fold is its own change-log record
 * (`commitStep`, KAN-355's flush), so ⌘Z after a fold takes back only the
 * fold, not whatever else was typed just before it. Modelled on
 * `block-canvas-split-undo-path.test.tsx`: the real `DocumentPanel` beside the
 * real `ShellCommands`, sharing one `sessionUndo` stack, with only the RPC
 * boundary (`@/lib/change-log/undo`) mocked.
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
import type { ToggleBlock } from '@/lib/modules/toggle/schema'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { findAllTextBlocks, writeInTextBlock } from './helpers/text-block'

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

// The row also hosts `BlockHandleMenu`'s own popup-trigger button, which also
// carries `aria-expanded` — told apart by `aria-haspopup`, which only it has.
const foldButtonIn = (row: HTMLElement) =>
  within(row)
    .getAllByRole('button')
    .find((b) => !b.hasAttribute('aria-haspopup'))!

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

describe('⌘Z after a fold takes back only the fold (KAN-480)', () => {
  it('reverts folded alone, leaving an edit made just before it in place', async () => {
    const toggle: ToggleBlock = {
      id: 't1',
      type: 'toggle',
      content: 'packing list',
      body: 'passport',
      folded: false,
    }
    renderPath([toggle])
    await screen.findByLabelText('Page title')
    const user = userEvent.setup()

    // An edit just before the fold, landed as its own save/record first — the
    // fold must not also take THIS back.
    const [summary] = await findAllTextBlocks()
    writeInTextBlock(summary, 'packing list!')
    await waitFor(() => expect(summary.textContent).toBe('packing list!'))
    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    mockSaveBlocks.mockClear()
    mockAppendOwnEdit.mockClear()

    const row = document.getElementById('block-t1')!
    await user.click(foldButtonIn(row))

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    const folded = mockSaveBlocks.mock.calls[0][2] as Block[]
    expect(folded.find((b) => b.id === 't1')).toMatchObject({ folded: true })
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))
    const foldRecordId = (await mockAppendOwnEdit.mock.results[0].value).id as string

    jest
      .mocked(undoStep)
      .mockResolvedValueOnce({ outcome: 'done', records: [undoRecord(foldRecordId)] })
    mockGetPage.mockResolvedValueOnce({
      id: 'page-1',
      title: 'Workshop',
      blocks: [{ ...toggle, content: 'packing list!', folded: false }],
    })

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: [foldRecordId],
    })

    await waitFor(() => {
      const unfolded = foldButtonIn(document.getElementById('block-t1')!)
      expect(unfolded).toHaveAttribute('aria-expanded', 'true')
    })
    expect(within(document.getElementById('block-t1')!).getByText('passport')).toBeInTheDocument()
    expect(screen.getByText('packing list!')).toBeInTheDocument()
  })
})
