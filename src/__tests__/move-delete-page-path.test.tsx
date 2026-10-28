/**
 * KAN-469 — PATH_STEPS' own walk for the ⌘K move door: open "roof" (beside
 * "house", both life's direct children) → ⌘⇧P opens the picker already
 * filtered (house and the root list, roof itself doesn't) → typing "house"
 * and ↵ commits the SAME move/undo path `rail-move-undo-path.test.tsx` walks
 * for a drag, through the shared `moveAndStageUndo`. Second case: ⌘K →
 * ">move" → the "move page to…" row → ↵ opens the identical picker. Mounts
 * the real `ShellCommands` + `Rail` + `DeletionUndoProvider`, the same
 * "fake the table, not the cache" shape as `rail-move-undo-path.test.tsx` /
 * `duplicate-page-path.test.tsx` — only the RPC boundary (`movePage`,
 * `undoStep`) is faked.
 *
 * KAN-567 adds the delete-page walk below: ⌘K's "delete page" row, with
 * "roof" nested under "house" (not a sibling) so "the parent" PATH_STEPS
 * opens is a real page, not home. Same "fake the table, not the cache"
 * shape — `trashPageUnlinked`'s underlying RPC (`@/lib/change-log/trash`'s
 * `trashPage`) is faked at that boundary rather than mocking
 * `trashPageUnlinked` itself, but it never actually fires here: undo is
 * clicked well inside the 6s grace window, so the deferred commit is
 * cancelled before it would call it (same as `rail-staged-ids.test.tsx`).
 */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import { fetchPages, type PageRow } from '@/lib/pages/tree'
import { movePage } from '@/lib/pages/client'
import { undoStep } from '@/lib/change-log/undo'
import type { MoveSnapshot } from '@/lib/change-log/types'
import type { Pond } from '@/lib/pond/client'

// `mock`-prefixed so jest's out-of-scope check lets the factory below close
// over it — a stable fn, not a fresh `jest.fn()` per `useRouter()` call, so
// the delete-page test can read which url the open page's own delete pushed.
const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? 'roof' : null) }),
}))

jest.mock('@/lib/change-log/trash', () => ({
  ...jest.requireActual('@/lib/change-log/trash'),
  trashPage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  })),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(),
}))

jest.mock('@/lib/pages/client', () => ({
  movePage: jest.fn(),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  duplicatePage: jest.fn(),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/use-home-page', () => ({
  useHomePage: () => ({ data: { id: 'home-1', title: 'Life' } }),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const AT = '2026-01-01T00:00:00Z'
const POND_ID = 'pond-1'

// Stands in for the `pages` table a real Postgres would hold — `movePage`
// and `undoStep` both mutate it, `fetchPages` reads it, so the rail's own
// refetch sees the real effect of whichever fake RPC ran, same shape
// `rail-move-undo-path.test.tsx` uses.
let table: PageRow[]
function resetTable() {
  table = [
    { id: 'house', parent_id: null, type: 'page', title: 'House', order: 0, updated_at: AT },
    { id: 'roof', parent_id: null, type: 'page', title: 'Roof', order: 1, updated_at: AT },
  ]
}
const titleOf = (id: string | null) => table.find((r) => r.id === id)?.title ?? 'Life'
function applySnapshot(pageId: string, snap: MoveSnapshot) {
  const page = table.find((r) => r.id === pageId)
  if (page) page.parent_id = snap.parentId
  snap.siblingOrder.forEach((id, i) => {
    const row = table.find((r) => r.id === id)
    if (row) row.order = i
  })
}

interface MoveLogEntry {
  pageId: string
  before: MoveSnapshot
  after: MoveSnapshot
}
let moveLog: Map<string, MoveLogEntry>
let recordSeq: number

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

  jest.mocked(fetchPages).mockImplementation(async () => table.map((r) => ({ ...r })))

  jest.mocked(movePage).mockImplementation(
    async (_sb: unknown, input: { id: string; newParentId: string | null; siblingOrder: string[] }) => {
      const page = table.find((r) => r.id === input.id)
      if (!page) throw new Error(`move_page: moving page ${input.id} returned no record`)
      const oldParentId = page.parent_id
      const before: MoveSnapshot = {
        parentId: oldParentId,
        parentTitle: titleOf(oldParentId),
        siblingOrder: table.filter((r) => r.parent_id === oldParentId).map((r) => r.id),
      }
      applySnapshot(input.id, {
        parentId: input.newParentId,
        parentTitle: '',
        siblingOrder: input.siblingOrder,
      })
      const after: MoveSnapshot = {
        parentId: input.newParentId,
        parentTitle: titleOf(input.newParentId),
        siblingOrder: input.siblingOrder,
      }
      const id = `record-${++recordSeq}`
      moveLog.set(id, { pageId: input.id, before, after })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { id, before, after } as any
    }
  )

  jest.mocked(undoStep).mockImplementation(async (_sb: unknown, step: { recordIds: readonly string[] }) => {
    const entry = moveLog.get(step.recordIds[0])
    if (!entry) throw new Error(`no move record for ${step.recordIds[0]}`)
    applySnapshot(entry.pageId, entry.before)
    return { outcome: 'done', records: [] }
  })

  onPlatform('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

function renderPath() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey(POND_ID), table)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <ShellCommands />
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return client
}

const roofLevel = () => screen.getByRole('treeitem', { name: 'Roof' }).getAttribute('aria-level')
const waitForRoofLevel = (expected: string) => waitFor(() => expect(roofLevel()).toBe(expected))

describe('⌘⇧P opens the move picker for the open page and commits through it (KAN-469)', () => {
  it('walks PATH_STEPS: ⌘⇧P, pick House, toast, rail nesting, undo', async () => {
    const user = userEvent.setup()
    renderPath()

    await screen.findByRole('treeitem', { name: 'Roof' })
    expect(roofLevel()).toBe('2')

    // Roof's own row holds real DOM focus before the picker opens — the
    // common case (an arrow-key nav, or the open page's own row), and the
    // one the live finding's "unrelated rail row" steal needs: `focusedId`
    // has to be set to the row that is about to move.
    screen.getByRole('treeitem', { name: 'Roof' }).focus()

    fireEvent.keyDown(document, { key: 'p', metaKey: true, shiftKey: true })

    const input = await screen.findByRole('combobox', { name: 'command palette' })
    expect(await screen.findByRole('option', { name: /^House$/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Roof$/ })).toBeNull()

    await user.type(input, 'house')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
    expect(movePage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'roof', newParentId: 'house' })
    )

    await screen.findByText('moved Roof to House ·')
    expect(screen.getByRole('button', { name: 'open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    // The combobox unmounts once the close morph settles (150ms, real time) —
    // `waitFor` rather than an immediate assert, or this reads as flaky.
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'command palette' })).not.toBeInTheDocument()
    )

    await waitForRoofLevel('3')

    // KAN-469 live finding: closing the palette normally only blurs its own
    // input (`PondCommand`'s open-effect never refocuses anything else), so
    // focus should settle back on `<body>` — not on "House"'s row, which the
    // reveal/vanish effects raced to steal once Roof reparented out from
    // under its old level, momentarily hiding the row Roof's own focus
    // (set above) was still pinned to.
    expect(document.activeElement).toBe(document.body)

    await user.click(screen.getByRole('button', { name: 'undo' }))
    expect(screen.queryByText('moved Roof to House ·')).not.toBeInTheDocument()
    await waitForRoofLevel('2')
  })
})

describe('⌘K\'s "move page to…" row opens the identical picker (KAN-469)', () => {
  it('walks PATH_STEPS: ⌘K, ">move", the action row, ↵', async () => {
    const user = userEvent.setup()
    renderPath()

    await screen.findByRole('treeitem', { name: 'Roof' })

    await user.keyboard('{Meta>}k{/Meta}')
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, '>move')

    const row = await screen.findByRole('option', { name: /move page to…/ })
    await user.keyboard('{Enter}')
    void row

    expect(await screen.findByRole('option', { name: /^House$/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Roof$/ })).toBeNull()
  })
})

describe('⌘K\'s "delete page" row deletes the open page and stages undo (KAN-567)', () => {
  beforeEach(() => {
    // "roof" nested under "house" — a real page, not home, is the parent
    // PATH_STEPS opens.
    table = [
      { id: 'house', parent_id: null, type: 'page', title: 'House', order: 0, updated_at: AT },
      { id: 'roof', parent_id: 'house', type: 'page', title: 'Roof', order: 0, updated_at: AT },
    ]
  })

  it('walks PATH_STEPS: ⌘K, delete page, ↵, toast + nav to the parent, rail removal, undo restores + reopens', async () => {
    const user = userEvent.setup()
    renderPath()

    await screen.findByRole('treeitem', { name: 'Roof' })

    await user.keyboard('{Meta>}k{/Meta}')
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    await user.type(input, 'delete')
    await screen.findByRole('option', { name: /delete page/ })
    await user.keyboard('{Enter}')

    expect(await screen.findByText('deleted Roof ·')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'open' })).not.toBeInTheDocument()

    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockPush.mock.calls.at(-1)?.[0]).toContain('nodeId=house')

    expect(screen.queryByRole('treeitem', { name: 'Roof' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'undo' }))

    expect(screen.queryByText('deleted Roof ·')).not.toBeInTheDocument()
    await screen.findByRole('treeitem', { name: 'Roof' })
    expect(mockPush.mock.calls.at(-1)?.[0]).toContain('nodeId=roof')
  })
})
