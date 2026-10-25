/**
 * KAN-479 slice 1 — wiring the block-pick mode's select to a real move: the
 * palette's block-pick select calls `moveBlockToPage`, then `stageUndo` with
 * `open`/`undo`. Mounts the real `ShellCommands` + `DeletionUndoProvider`
 * sharing one real `sessionUndo` stack — only the RPC boundary is mocked
 * (`@/lib/pages/client`'s `getPage`/`saveBlocks`, `@/lib/change-log/store`'s
 * `appendOwnEdit`, `@/lib/change-log/undo`'s `undoStep`), same pattern as
 * `rail-move-undo-path.test.tsx` and `block-canvas-move-undo-path.test.tsx`.
 * `getPage`/`saveBlocks` read/write a mutable in-memory table both fakes
 * share, so the undo assertions prove the real restore, not a hand-fed value.
 */

import { act, screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { requestBlockMovePick } from '@/lib/terminal-focus'
import { undoStep } from '@/lib/change-log/undo'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const routerPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'verify' : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([
    { id: 'verify', parent_id: null, type: 'page', title: 'Verify', order: 0, updated_at: '' },
    { id: 'house', parent_id: null, type: 'page', title: 'House', order: 1, updated_at: '' },
  ]),
}))

const AT = '2026-01-01T00:00:00Z'
const POND_ID = 'pond-1'

type TestPage = { id: string; title: string; blocks: Block[] }
let table: Record<string, TestPage>
function resetTable() {
  table = {
    verify: { id: 'verify', title: 'Verify', blocks: [{ id: 'b-1', type: 'table', columns: ['Tool'], rows: [] }] },
    house: { id: 'house', title: 'House', blocks: [] },
  }
}

const mockGetPage = jest.fn(async (_sb: unknown, id: string) => {
  const page = table[id]
  return page ? { id: page.id, title: page.title, blocks: page.blocks } : null
})
const mockSaveBlocks = jest.fn(async (_sb: unknown, id: string, blocks: Block[]) => {
  table[id].blocks = blocks
})
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...(args as [unknown, string])),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...(args as [unknown, string, Block[]])),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  duplicatePage: jest.fn(),
}))

// Each own-edit record's own `targetPageId`/`before` — what the fake `undoStep`
// below restores from, the same role `moveLog` plays in rail-move-undo-path.
let moveLog: Map<string, { targetPageId: string; before: Block[] }>
let recordSeq: number
const mockAppendOwnEdit = jest.fn(
  async (_sb: unknown, input: { targetPageId: string; before: Block[] }) => {
    const id = `record-${++recordSeq}`
    moveLog.set(id, { targetPageId: input.targetPageId, before: input.before })
    return { id }
  }
)
jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...(args as [unknown, { targetPageId: string; before: Block[] }])),
}))

const baseRecord: Omit<ChangeLogRecord, 'id' | 'targetPageId'> = {
  userId: 'user-1',
  pondId: POND_ID,
  status: 'accepted',
  action: 'edit',
  actor: 'you',
  targetBlockId: null,
  before: null,
  after: null,
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: AT,
  statusAt: AT,
}

jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const POND: Pond = { id: POND_ID, name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
  removePond: () => {},
}

beforeEach(() => {
  jest.clearAllMocks()
  resetTable()
  moveLog = new Map()
  recordSeq = 0

  jest.mocked(undoStep).mockImplementation(async (_sb: unknown, step: { recordIds: readonly string[] }) => {
    const records = step.recordIds.map((id) => {
      const entry = moveLog.get(id)
      if (!entry) throw new Error(`no own-edit record for ${id}`)
      table[entry.targetPageId].blocks = entry.before
      return { ...baseRecord, id: `undo-${id}`, targetPageId: entry.targetPageId }
    })
    return { outcome: 'done', records }
  })

  onPlatform('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

function renderPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

const blockOf = (pageId: string) => table[pageId].blocks.find((b) => b.id === 'b-1')

describe('KAN-479: block move-pick select wires moveBlockToPage + toast', () => {
  it('pick moves the block and shows the toast, open navigates, undo restores both pages', async () => {
    renderPath()
    const user = userEvent.setup()

    act(() => requestBlockMovePick({ blockId: 'b-1', sourcePageId: 'verify', label: 'checklist' }))
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'House')
    await user.keyboard('{Enter}')

    await screen.findByText('moved 1 block to House ·')
    await waitFor(() => expect(blockOf('verify')).toBeUndefined())
    expect(blockOf('house')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'open' }))
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining('nodeId=house'))

    await user.click(screen.getByRole('button', { name: 'undo' }))
    expect(screen.queryByText('moved 1 block to House ·')).not.toBeInTheDocument()
    await waitFor(() => expect(blockOf('verify')).toBeDefined())
    expect(blockOf('house')).toBeUndefined()
  })

  it("notifies instead of closing silently when there's nothing left to move", async () => {
    renderPath()
    const user = userEvent.setup()

    // The block the menu named is already gone from the source by the time
    // the pick resolves — `moveBlockToPage` returns `null`, same as a
    // target trashed mid-pick or the record page's unsaved `blankId` block.
    act(() => requestBlockMovePick({ blockId: 'already-gone', sourcePageId: 'verify', label: 'checklist' }))
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'House')
    await user.keyboard('{Enter}')

    await screen.findByText("Couldn't move checklist")
    expect(blockOf('house')).toBeUndefined()
    expect(mockSaveBlocks).not.toHaveBeenCalled()
  })
})
