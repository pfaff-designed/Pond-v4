/**
 * KAN-368 — Backspace on an empty, unlabelled text block (`removeEmptyLineAt`'s
 * bare-line branch) writes through `persistBlocksAsOwnEdit`, not the debounced
 * `onChange`: there's nothing to name in a toast, but the removal must still be
 * one ⌘Z step the instant it happens. Mounts the real `DocumentPanel` beside the
 * real `ShellCommands` (the ⌘Z owner), sharing one `sessionUndo` stack — only the
 * RPC boundary (`@/lib/change-log/undo`) is mocked, same pattern as
 * `block-canvas-move-undo-path.test.tsx`.
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

// `session-undo.ts` stays real: this proves the Backspace-remove's
// `rememberPending` and ⌘Z's `undo` share one real stack. Only the RPC
// boundary is mocked.
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

describe('Backspace on an empty line writes through persistBlocksAsOwnEdit, one ⌘Z step (KAN-368)', () => {
  it('Backspace-remove then ⌘Z brings the line back', async () => {
    const note: Block = { id: 'b-note', type: 'text', content: 'Cabinets are the only open cost.' }
    const emptyLine: Block = { id: 'b-empty', type: 'text', content: '' }
    renderPath([note, emptyLine])
    await screen.findByLabelText('Page title')

    const user = userEvent.setup()
    const line = await textBlockIn('b-empty')
    line.focus()
    await waitFor(() => expect(line).toHaveFocus())

    await user.keyboard('{Backspace}')

    await waitFor(() => expect(mockSaveBlocks).toHaveBeenCalledTimes(1))
    expect(mockSaveBlocks.mock.calls[0][2].map((b: Block) => b.id)).toEqual(['b-note'])
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalledTimes(1))

    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(undoStep).toHaveBeenCalledTimes(1))
    expect(undoStep).toHaveBeenCalledWith(expect.anything(), {
      pondId: 'pond-1',
      recordIds: ['record-1'],
    })
  })
})
