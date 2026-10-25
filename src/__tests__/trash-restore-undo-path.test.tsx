/**
 * KAN-497 — PATH_STEPS' own walk, the half this ticket owns: trash → restore
 * "roof" → ⌘Z → roof is back in trash. Mounts the real `TrashPage` +
 * `ShellCommands` sharing one real `sessionUndo` stack (same pattern as
 * `rail-move-undo-path.test.tsx`) — only the RPC boundary is mocked
 * (`@/lib/change-log/trash`'s `restorePage`, and `@/lib/change-log/undo`'s
 * `undoStep`/`redoStep`), against a mutable in-memory `records` array both
 * fakes read/write, so the reappearing row comes from a genuine refetch
 * (`applyUndoOutcome`'s `changeLogKey()` invalidation, which `trashKey`
 * nests under), not a hand-fed snapshot.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrashPage } from '@/components/organisms/TrashPage'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  })),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  listPages: jest.fn().mockResolvedValue([]),
}))

const mockListRecords = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
}))

const mockExistingPageIds = jest.fn()
const mockRestorePage = jest.fn()
jest.mock('@/lib/change-log/trash', () => ({
  ...jest.requireActual('@/lib/change-log/trash'),
  existingPageIds: (...args: unknown[]) => mockExistingPageIds(...args),
  restorePage: (...args: [unknown, string]) => mockRestorePage(...args),
}))

// `undo.ts` stays real apart from the RPC boundary (same as
// rail-move-undo-path.test.tsx) — proves ⌘Z (`sessionUndo.undo`) drives the
// same real `restorePageRelinked` → `sessionUndo.remember` step this
// ticket's restore click just pushed.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const POND_ID = 'pond-1'
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

const snapshot = (over: Partial<TrashSnapshot> = {}): TrashSnapshot => ({
  title: 'roof',
  parentId: null,
  order: 0,
  pageIds: ['page-1'],
  blockCount: 2,
  nestedPageCount: 0,
  parentPath: [],
  ...over,
})

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'del-1',
    userId: 'user-1',
    pondId: POND_ID,
    status: 'accepted',
    action: 'delete',
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: snapshot(),
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-26T12:00:00.000Z',
    statusAt: '2026-09-26T12:00:00.000Z',
    ...over,
  }
}

// Stands in for the change log table a real Postgres would hold —
// `restorePage` and `undoStep` both mutate it, `listRecords` reads it, so
// the trash row's reappearance after ⌘Z comes from a real refetch over the
// real effect of whichever fake ran, not a value this file hand-fed the
// cache.
let records: ChangeLogRecord[]

function renderPath() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
          <TrashPage />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe('trash restore, then ⌘Z, walks PATH_STEPS back to trash (KAN-497)', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    records = [record()]
    mockListRecords.mockImplementation(async () => [...records])
    mockExistingPageIds.mockImplementation(async (_supabase, ids: string[]) => new Set(ids))
    mockRestorePage.mockImplementation(async (_supabase: unknown, recordId: string) => {
      const deleted = records.find((r) => r.id === recordId)
      if (!deleted) throw new Error(`no delete record ${recordId}`)
      const restored = record({
        id: 'restore-1',
        action: 'restore',
        targetPageId: deleted.targetPageId,
        createdAt: '2026-09-27T12:00:00.000Z',
      })
      records.push(restored)
      return restored.id
    })
    jest.mocked(undoStep).mockImplementation(async (_sb, step) => {
      const index = records.findIndex((r) => r.id === step.recordIds[0])
      if (index !== -1) records.splice(index, 1)
      return { outcome: 'done', records: [] }
    })
    jest.mocked(redoStep).mockResolvedValue({ outcome: 'done', records: [] })
    onPlatform('MacIntel')
    // `relinkRestoredSubtree` (child-links.ts) runs for real off the real
    // `restorePage` return, and throws reading `page-1`'s props against this
    // file's bare fake client (no `.from`) — caught and logged internally
    // (its own documented "never throws" rule), silenced here as noise.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
    jest.restoreAllMocks()
  })

  it('walks PATH_STEPS: trash shows roof, restore removes it, ⌘Z puts it back', async () => {
    renderPath()

    expect(await screen.findByText('roof')).toBeInTheDocument()
    expect(screen.getAllByTestId('trash-row')).toHaveLength(1)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'restore' }))

    expect(mockRestorePage).toHaveBeenCalledWith(expect.anything(), 'del-1')
    await waitFor(() => {
      expect(screen.queryByTestId('trash-row')).not.toBeInTheDocument()
    })
    expect(await screen.findByTestId('trash-empty')).toBeInTheDocument()

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => {
      expect(screen.getAllByTestId('trash-row')).toHaveLength(1)
    })
    expect(screen.getByText('roof')).toBeInTheDocument()
    expect(screen.queryByTestId('trash-empty')).not.toBeInTheDocument()
  })
})
