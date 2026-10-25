/**
 * KAN-497 — PATH_STEPS' own walk, the half this ticket owns: trash → restore
 * "roof" → ⌘Z → roof is back in trash. Mounts the real `TrashPage` +
 * `ShellCommands` sharing one real `sessionUndo` stack (same pattern as
 * `rail-move-undo-path.test.tsx`) — only the RPC boundary is mocked
 * (`@/lib/change-log/trash`'s `restorePage`, `@/lib/change-log/undo`'s
 * `undoStep`/`redoStep`, and `@/lib/change-log/store`'s `appendOwnEdit`/
 * `markOutdated`, which the own-edit sweep inside `commitBlocks` would
 * otherwise need a `change_log` table fake for). `relinkRestoredSubtree` and
 * `commitBlocks` run FOR REAL off the real `restorePage` return, against a
 * `.from('pages')` fake (same richSb shape as `rail-move-undo-path.test.tsx`'s
 * own KAN-466 regression test) that holds the parent's blocks and the
 * restored page's `props.unlinkedLinks` — so the restore's parent-link
 * relink, and its fold into ONE session-undo step, are exercised for real,
 * not stubbed away. No console.error spy: a swallowed error inside the
 * relink's own "never throws" catch would leave the link unrestored and the
 * assertions below would fail on THAT, not on a silenced exception.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrashPage } from '@/components/organisms/TrashPage'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { createClient } from '@/lib/supabase/client'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'
import type { Pond } from '@/lib/pond/client'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
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
const mockAppendOwnEdit = jest.fn()
const mockMarkOutdated = jest.fn()
jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  listRecords: (...args: unknown[]) => mockListRecords(...args),
  appendOwnEdit: (...args: unknown[]) => mockAppendOwnEdit(...args),
  markOutdated: (...args: unknown[]) => mockMarkOutdated(...args),
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
// same real `restorePageRelinked` → `sessionUndo.rememberPending` step this
// ticket's restore click just pushed.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const POND_ID = 'pond-1'
const PARENT_ID = 'parent-1'
const ROOT_ID = 'page-1'
const LINK_BLOCK_ID = 'link-block-1'
const LINK_BLOCK = { id: LINK_BLOCK_ID, type: 'page-link', pageId: ROOT_ID }

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
  pageIds: [ROOT_ID],
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
    targetPageId: ROOT_ID,
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
// `restorePage` and `undoStep`/`redoStep` all mutate it, `listRecords` reads
// it, so the trash row's reappearance after ⌘Z comes from a real refetch
// over the real effect of whichever fake ran, not a value this file
// hand-fed the cache.
let records: ChangeLogRecord[]
let restoredRecord: ChangeLogRecord

// Stands in for the `pages` table `getPage`/`saveBlocks`/the relink's own
// `readPageProps` (all real, unmocked — `child-links.ts` is not mocked in
// this file) read and write: the parent's blocks, and the root's
// `props.unlinkedLinks` KAN-448 left behind when this page was trashed.
type FakePageRow = {
  id: string
  blocks: { id: string; type: string; pageId: string }[]
  props: Record<string, unknown>
}
let pagesTable: FakePageRow[]

function resetPagesTable() {
  pagesTable = [
    { id: PARENT_ID, blocks: [], props: {} },
    {
      id: ROOT_ID,
      blocks: [],
      props: { unlinkedLinks: [{ parentId: PARENT_ID, block: LINK_BLOCK, index: 0, beforeId: null }] },
    },
  ]
}

// Same shape as `rail-move-undo-path.test.tsx`'s own KAN-466 regression-test
// `richSb` — no-ops every table but `pages`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function noopBuilder(): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then')
          return (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve)
        return () => noopBuilder()
      },
    }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFakeClient(): any {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (name: string) => {
      if (name !== 'pages') return noopBuilder()
      let op: 'select' | 'update' | null = null
      let updatePayload: Record<string, unknown> | null = null
      const filters: Array<(r: FakePageRow) => boolean> = []
      const builder = {
        select() {
          op = op ?? 'select'
          return builder
        },
        update(payload: Record<string, unknown>) {
          op = 'update'
          updatePayload = payload
          return builder
        },
        eq(col: string, val: string) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filters.push((r) => (r as any)[col] === val)
          return builder
        },
        maybeSingle() {
          const row = pagesTable.find((r) => filters.every((f) => f(r)))
          return Promise.resolve({ data: row ? { ...row } : null, error: null })
        },
        then(resolve: (v: { data: null; error: null }) => unknown) {
          if (op === 'update') {
            for (const row of pagesTable) {
              if (filters.every((f) => f(row))) Object.assign(row, updatePayload)
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve)
        },
      }
      return builder
    },
  }
}

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

const linksRoof = (): boolean =>
  pagesTable.find((r) => r.id === PARENT_ID)?.blocks.some((b) => b.id === LINK_BLOCK_ID) ?? false

describe('trash restore, then ⌘Z, walks PATH_STEPS back to trash (KAN-497)', () => {
  let relinkSeq: number
  let relinkRecordIds: Set<string>
  let restoreRecordIds: Set<string>
  // Resolved immediately in the main path test; held open in the "pressed
  // immediately" test below to prove ⌘Z genuinely waits on the relink's own
  // round trip rather than racing it.
  let releaseRelink: () => void

  beforeEach(() => {
    jest.clearAllMocks()
    sessionUndo.clear()
    resetPagesTable()
    records = [record()]
    relinkSeq = 0
    relinkRecordIds = new Set()
    restoreRecordIds = new Set()
    releaseRelink = () => {}

    jest.mocked(createClient).mockImplementation(() => buildFakeClient())

    mockListRecords.mockImplementation(async () => [...records])
    mockExistingPageIds.mockImplementation(async (_supabase, ids: string[]) => new Set(ids))
    mockMarkOutdated.mockResolvedValue([])
    mockAppendOwnEdit.mockImplementation(
      async (_sb, input: { targetPageId: string; before: unknown; after: unknown }) => {
        await new Promise<void>((resolve) => {
          releaseRelink = resolve
        })
        const id = `relink-${++relinkSeq}`
        relinkRecordIds.add(id)
        return record({
          id,
          action: 'edit',
          targetPageId: input.targetPageId,
          before: input.before as never,
          after: input.after as never,
          createdAt: '2026-09-27T12:00:01.000Z',
        })
      }
    )

    mockRestorePage.mockImplementation(async (_supabase: unknown, recordId: string) => {
      const deleted = records.find((r) => r.id === recordId)
      if (!deleted) throw new Error(`no delete record ${recordId}`)
      restoredRecord = record({
        id: 'restore-1',
        action: 'restore',
        targetPageId: deleted.targetPageId,
        createdAt: '2026-09-27T12:00:00.000Z',
      })
      restoreRecordIds.add(restoredRecord.id)
      records.push(restoredRecord)
      return restoredRecord.id
    })

    // Operates on EVERY record id in the step, not just the first: a
    // relink-logged id puts the link back off the parent, a restore id
    // re-trashes the page (drops its `restore` record) — an id from an
    // earlier, unrelated step is a no-op, still reported `done`.
    jest.mocked(undoStep).mockImplementation(async (_sb, step) => {
      for (const recordId of step.recordIds) {
        if (relinkRecordIds.has(recordId)) {
          const parent = pagesTable.find((r) => r.id === PARENT_ID)
          if (parent) parent.blocks = parent.blocks.filter((b) => b.id !== LINK_BLOCK_ID)
        } else if (restoreRecordIds.has(recordId)) {
          const index = records.findIndex((r) => r.id === recordId)
          if (index !== -1) records.splice(index, 1)
        }
      }
      return { outcome: 'done', records: [] }
    })
    jest.mocked(redoStep).mockImplementation(async (_sb, step) => {
      for (const recordId of step.recordIds) {
        if (relinkRecordIds.has(recordId)) {
          const parent = pagesTable.find((r) => r.id === PARENT_ID)
          if (parent && !parent.blocks.some((b) => b.id === LINK_BLOCK_ID)) {
            parent.blocks = [...parent.blocks, { ...LINK_BLOCK }]
          }
        } else if (restoreRecordIds.has(recordId)) {
          if (!records.some((r) => r.id === recordId)) records.push(restoredRecord)
        }
      }
      return { outcome: 'done', records: [] }
    })

    onPlatform('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('walks PATH_STEPS: restore relinks the parent, ⌘Z takes back both in one press, ⇧⌘Z redoes both', async () => {
    renderPath()

    expect(await screen.findByText('roof')).toBeInTheDocument()
    expect(screen.getAllByTestId('trash-row')).toHaveLength(1)
    expect(linksRoof()).toBe(false)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'restore' }))

    expect(mockRestorePage).toHaveBeenCalledWith(expect.anything(), 'del-1')
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalled())
    releaseRelink()
    await waitFor(() => {
      expect(screen.queryByTestId('trash-row')).not.toBeInTheDocument()
    })
    // The parent now shows roof's link — the relink landed for real.
    await waitFor(() => expect(linksRoof()).toBe(true))

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => {
      expect(screen.getAllByTestId('trash-row')).toHaveLength(1)
    })
    expect(linksRoof()).toBe(false)
    expect(jest.mocked(undoStep)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recordIds: ['restore-1', 'relink-1'] })
    )

    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')

    await waitFor(() => {
      expect(screen.queryByTestId('trash-row')).not.toBeInTheDocument()
    })
    expect(linksRoof()).toBe(true)
  })

  it('⌘Z pressed immediately after restore waits for the pending step and undoes the restore, not an earlier one', async () => {
    renderPath()
    await screen.findByText('roof')

    // An earlier, unrelated step already sits on top of this pond's stack.
    sessionUndo.remember({ pondId: POND_ID, recordIds: ['previous-1'] })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'restore' }))
    // `restorePage` has resolved by now (no artificial delay of its own),
    // but the relink's own `appendOwnEdit` round trip is held open by
    // `releaseRelink` — `restorePageRelinked`'s own `await relinked` hasn't
    // settled yet.
    await waitFor(() => expect(mockAppendOwnEdit).toHaveBeenCalled())

    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    // Give a wrongly-eager ⌘Z (the bug: undoing the stack's OLD top before
    // the pending step ever lands) room to have already run.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(jest.mocked(undoStep)).not.toHaveBeenCalled()

    releaseRelink()

    await waitFor(() => expect(jest.mocked(undoStep)).toHaveBeenCalled())
    expect(jest.mocked(undoStep)).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recordIds: ['previous-1'] })
    )
    expect(jest.mocked(undoStep)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recordIds: ['restore-1', 'relink-1'] })
    )
    await waitFor(() => expect(screen.getAllByTestId('trash-row')).toHaveLength(1))
  })
})
