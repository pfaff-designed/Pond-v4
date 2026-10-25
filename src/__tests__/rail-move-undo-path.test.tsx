/**
 * KAN-466 — PATH_STEPS' own walk: drag "roof" onto "house" in the rail, the
 * undo toast reads `moved roof to house ·` with `open`/`undo` buttons, `open`
 * navigates to roof, `undo` puts it back; dragging again and using ⌘Z/⇧⌘Z
 * (the shell's chord, a different door onto the SAME `sessionUndo` stack)
 * does the same. Mounts the real `Rail` + `ShellCommands` +
 * `DeletionUndoProvider` sharing one real `sessionUndo` stack — only the RPC
 * boundary is mocked (`@/lib/pages/client`'s `movePage`, a fake that mimics
 * `move_page`'s shape, and `@/lib/change-log/undo`'s `undoStep`/`redoStep`),
 * same pattern as `block-canvas-move-undo-path.test.tsx`. `fetchPages` is
 * mocked against a mutable in-memory table the three fakes all mutate
 * together — the same "stand in for Postgres" shape
 * `rail-delete-then-create.test.tsx` uses — so the undo/redo assertions read
 * the real refetch `applyUndoOutcome`'s invalidate drives, not a hand-fed
 * snapshot.
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
import { createClient } from '@/lib/supabase/client'
import { undoStep, redoStep } from '@/lib/change-log/undo'
import { writeExpandedIds } from '@/lib/rail/expanded-store'
import { describeChange } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord, MoveSnapshot } from '@/lib/change-log/types'
import type { Block } from '@/lib/modules/content'
import type { Pond } from '@/lib/pond/client'

const routerPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => ({ get: () => null }),
}))

// A plain jest.fn, not a static factory: the regression test below swaps in
// a richer fake (one that also answers `.from('pages')`) for its own run, so
// `appendChildLinkUnder` — NOT mocked away in this file — can actually land
// a write if a reparent ever calls it again.
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
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

// KAN-466: deliberately NOT mocked (unlike every other Rail test file) — a
// reparent must land no real write through this module's real
// `appendChildLinkUnder`, so the regression test below exercises it for
// real rather than against a no-op stand-in.

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

// `undo.ts` stays real apart from the RPC boundary (like block-canvas-move-
// undo-path.test.tsx) — this proves the toast's own undo (`sessionUndo.undoHandle`)
// and ⌘Z/⇧⌘Z (`sessionUndo.undo`/`redo`) share one real stack.
jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const AT = '2026-01-01T00:00:00Z'
const POND_ID = 'pond-1'

// Stands in for the `pages` table a real Postgres would hold — `movePage`,
// `undoStep` and `redoStep` all mutate it, `fetchPages` reads it, so the
// refetch `applyUndoOutcome`'s invalidate drives sees the real effect of
// whichever RPC ran, not a value this file hand-fed the cache. `blocks`
// carries no RPC fake of its own — only the regression test below's richer
// `createClient` fake reads/writes it, through the real `getPage`/`saveBlocks`.
type TestPageRow = PageRow & { blocks: Block[] }
let table: TestPageRow[]
function resetTable() {
  table = [
    { id: 'house', parent_id: null, type: 'page', title: 'house', order: 0, updated_at: AT, blocks: [] },
    { id: 'roof', parent_id: null, type: 'page', title: 'roof', order: 1, updated_at: AT, blocks: [] },
  ]
}
const titleOf = (id: string | null) => table.find((r) => r.id === id)?.title ?? 'life'
function applySnapshot(pageId: string, snap: MoveSnapshot) {
  const page = table.find((r) => r.id === pageId)
  if (page) page.parent_id = snap.parentId
  snap.siblingOrder.forEach((id, i) => {
    const row = table.find((r) => r.id === id)
    if (row) row.order = i
  })
}

/**
 * KAN-467 — mirrors `apply_page_move`/`change_log_set_back`'s link-edit halves
 * (migration 0031) so the fakes below carry the same link edit the real RPC
 * now does: `from` is always the side a block is REMOVED from, `to` is always
 * the side one is PUT BACK onto (undo/redo pre-swap `before`/`after` into
 * `from`/`to` the same way `change_log_step` does for the SQL branch).
 */
function applyLinkEdit(pageId: string, from: MoveSnapshot, to: MoveSnapshot) {
  if (from.appendedLinkId || from.removedLinks) {
    const row = from.parentId ? table.find((r) => r.id === from.parentId) : undefined
    if (row) {
      const removeIds = from.appendedLinkId
        ? [from.appendedLinkId]
        : (from.removedLinks ?? []).map((entry) => entry.block.id)
      row.blocks = row.blocks.filter((b) => !removeIds.includes(b.id))
    }
  }
  if (to.removedLinks || to.appendedLinkId) {
    const row = to.parentId ? table.find((r) => r.id === to.parentId) : undefined
    if (row) {
      if (to.removedLinks) {
        for (const { block, index } of [...to.removedLinks].sort((a, b) => a.index - b.index)) {
          row.blocks = [...row.blocks.slice(0, index), block, ...row.blocks.slice(index)]
        }
      } else if (
        to.appendedLinkId &&
        !row.blocks.some((b) => b.type === 'page-link' && b.pageId === pageId)
      ) {
        row.blocks = [...row.blocks, { id: to.appendedLinkId, type: 'page-link', pageId }]
      }
    }
  }
}

interface MoveLogEntry {
  pageId: string
  before: MoveSnapshot
  after: MoveSnapshot
}
let moveLog: Map<string, MoveLogEntry>
let recordSeq: number

const POND: Pond = {
  id: POND_ID,
  name: 'life',
  glyph: null,
  theme: 'light',
  order: 0,
  recentGlyphs: [],
}
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
  patchPond: () => {},
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
      // Migration 0031 part A/B: a reparent (not a same-parent reorder) strips
      // the moved page's own page-link block off the old parent and appends
      // one onto the new parent, unless it already carries one.
      let removedLinks: MoveSnapshot['removedLinks']
      let appendedLinkId: string | undefined
      if (oldParentId !== input.newParentId) {
        const oldParent = oldParentId ? table.find((r) => r.id === oldParentId) : undefined
        if (oldParent) {
          const index = oldParent.blocks.findIndex(
            (b) => b.type === 'page-link' && b.pageId === input.id
          )
          if (index !== -1) {
            removedLinks = [{ block: oldParent.blocks[index], index }]
            oldParent.blocks = oldParent.blocks.filter((_, i) => i !== index)
          }
        }
        const newParent = input.newParentId ? table.find((r) => r.id === input.newParentId) : undefined
        if (newParent && !newParent.blocks.some((b) => b.type === 'page-link' && b.pageId === input.id)) {
          appendedLinkId = `link-${input.id}-${newParent.id}`
          newParent.blocks = [
            ...newParent.blocks,
            { id: appendedLinkId, type: 'page-link', pageId: input.id },
          ]
        }
      }
      applySnapshot(input.id, { parentId: input.newParentId, parentTitle: '', siblingOrder: input.siblingOrder })
      const after: MoveSnapshot = {
        parentId: input.newParentId,
        parentTitle: titleOf(input.newParentId),
        siblingOrder: input.siblingOrder,
        ...(appendedLinkId ? { appendedLinkId } : {}),
      }
      const fullBefore: MoveSnapshot = { ...before, ...(removedLinks ? { removedLinks } : {}) }
      const id = `record-${++recordSeq}`
      moveLog.set(id, { pageId: input.id, before: fullBefore, after })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { id, before: fullBefore, after } as any
    }
  )

  jest.mocked(undoStep).mockImplementation(async (_sb: unknown, step: { recordIds: readonly string[] }) => {
    const entry = moveLog.get(step.recordIds[0])
    if (!entry) throw new Error(`no move record for ${step.recordIds[0]}`)
    applySnapshot(entry.pageId, entry.before)
    applyLinkEdit(entry.pageId, entry.after, entry.before)
    return { outcome: 'done', records: [] }
  })
  jest.mocked(redoStep).mockImplementation(async (_sb: unknown, step: { recordIds: readonly string[] }) => {
    const entry = moveLog.get(step.recordIds[0])
    if (!entry) throw new Error(`no move record for ${step.recordIds[0]}`)
    applySnapshot(entry.pageId, entry.after)
    applyLinkEdit(entry.pageId, entry.before, entry.after)
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

function dragStartEvent() {
  const event = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { effectAllowed: '', dropEffect: '', setData: jest.fn() },
  })
  Object.defineProperty(event, 'clientY', { value: 0 })
  return event
}
function dropEvent(clientY: number) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

function dragRoofOntoHouse() {
  const dragged = screen.getByRole('treeitem', { name: 'roof' })
  const target = screen.getByRole('treeitem', { name: 'house' })
  fireEvent(dragged, dragStartEvent())
  fireEvent(target, dropEvent(0))
}

const parentIdOfRoof = () => table.find((r) => r.id === 'roof')?.parent_id ?? null

// The rendered tree's own ARIA sibling coordinates (`flattenVisible`,
// src/lib/rail/tree.ts) — reading these off the real `roof` treeitem, rather
// than the mock-mutated `table`, proves the RAIL re-rendered from a genuine
// refetch (`applyUndoOutcome`'s invalidation), not just that the fake RPCs
// agreed on a parent id.
function roofTreeCoords() {
  const row = screen.getByRole('treeitem', { name: 'roof' })
  return {
    level: row.getAttribute('aria-level'),
    posInSet: row.getAttribute('aria-posinset'),
    setSize: row.getAttribute('aria-setsize'),
  }
}
const waitForRoofTreeCoords = (expected: ReturnType<typeof roofTreeCoords>) =>
  waitFor(() => expect(roofTreeCoords()).toEqual(expected))

// house and roof start as life's only two children, house (order 0) then roof
// (order 1) — roof's "old position" throughout this test.
const ROOF_AT_OLD_TOP_LEVEL_POSITION = { level: '2', posInSet: '2', setSize: '2' }
const ROOF_UNDER_HOUSE = { level: '3', posInSet: '1', setSize: '1' }

/** The change log's own label for a `move` record carrying `after` — reused
 *  by `describeChange` (page-changes.ts) the same way a real log row would. */
function describeMoveRecord(after: MoveSnapshot): string {
  const record: ChangeLogRecord = {
    id: 'move-record',
    userId: 'user-1',
    pondId: POND_ID,
    status: 'accepted',
    action: 'move',
    actor: 'you',
    targetPageId: 'roof',
    targetBlockId: null,
    before: null,
    after,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: AT,
    statusAt: AT,
  }
  return describeChange(record, null)
}

describe("rail drag-move: the toast's open/undo and ⌘Z/⇧⌘Z share one undo stack (KAN-466)", () => {
  it('walks PATH_STEPS: drag, open, undo, drag again, ⌘Z, ⇧⌘Z', async () => {
    renderPath()

    dragRoofOntoHouse()

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
    await screen.findByText('moved roof to house ·')
    expect(screen.getByRole('button', { name: 'open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    await waitForRoofTreeCoords(ROOF_UNDER_HOUSE)

    const firstMove = moveLog.get('record-1')
    expect(firstMove).toBeDefined()
    expect(describeMoveRecord(firstMove!.after)).toBe('moved to house')

    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining('nodeId=roof'))

    await userEvent.click(screen.getByRole('button', { name: 'undo' }))
    expect(screen.queryByText('moved roof to house ·')).not.toBeInTheDocument()
    await waitForRoofTreeCoords(ROOF_AT_OLD_TOP_LEVEL_POSITION)

    dragRoofOntoHouse()
    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(2))
    await waitForRoofTreeCoords(ROOF_UNDER_HOUSE)

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitForRoofTreeCoords(ROOF_AT_OLD_TOP_LEVEL_POSITION)

    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await waitForRoofTreeCoords(ROOF_UNDER_HOUSE)
  })
})

/**
 * KAN-466 fix: a reparent used to fire `appendChildLinkUnder` (KAN-415) on the
 * new parent, and that write pushed its OWN session-undo step — usually ABOVE
 * the move's, so one ⌘Z only undid the link and left the page reparented.
 * `appendChildLinkUnder` is NOT mocked away in this file (see the top-of-file
 * note by the removed mock), so if a reparent ever calls it again, this real
 * implementation runs — through the real `getPage`/`saveBlocks` against the
 * richer fake `createClient` below — and the write actually lands, the same
 * as it would in the old, buggy code.
 */
describe('KAN-466 regression: a reparent writes no link block of its own', () => {
  it('one ⌘Z after a reparent fully restores it, and house holds no stored link to roof', async () => {
    renderPath()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noopBuilder = (): any =>
      new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') return (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve)
            return () => noopBuilder()
          },
        }
      )

    // Answers `getPage`/`saveBlocks`'s real `.from('pages')` calls against
    // the same mutable `table` every other fake in this file reads/writes —
    // any other table (`markOutdated`'s sweep, say) gets a safe no-op.
    const richSb = {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from: (name: string) => {
        if (name !== 'pages') return noopBuilder()
        let op: 'select' | 'update' | null = null
        let updatePayload: Record<string, unknown> | null = null
        const filters: Array<(r: TestPageRow) => boolean> = []
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
            const row = table.find((r) => filters.every((f) => f(r)))
            return Promise.resolve({ data: row ? { ...row } : null, error: null })
          },
          then(resolve: (v: { data: null; error: null }) => unknown) {
            if (op === 'update') {
              for (const row of table) {
                if (filters.every((f) => f(row))) Object.assign(row, updatePayload)
              }
            }
            return Promise.resolve({ data: null, error: null }).then(resolve)
          },
        }
        return builder
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    jest.mocked(createClient).mockImplementation(() => richSb)

    dragRoofOntoHouse()
    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
    await screen.findByText('moved roof to house ·')
    // Flush: a stray reparent-link write (the old bug) is a detached async
    // chain `handleMove` never awaits — give it room to land before checking.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(parentIdOfRoof()).toBe(null))
    expect(table.find((r) => r.id === 'house')?.blocks ?? []).toEqual([])
  })
})

/**
 * KAN-467 — PATH_STEPS' own walk for the link edit: P already links C in its
 * `blocks` → drag C under Q → P's row loses the C link and Q's gains one →
 * the undo toast restores both → ⇧⌘Z (redo) reapplies both. Same fakes as
 * the suite above (`movePage`/`undoStep`/`redoStep`), now exercising the
 * link-edit halves migration 0031 added to `apply_page_move` and
 * `change_log_set_back`'s `move` branch (see `applyLinkEdit` above).
 */
describe('rail drag-move carries its link edit with it (KAN-467)', () => {
  it('walks PATH_STEPS: P links C, drag C under Q, undo restores both, redo reapplies both', async () => {
    table = [
      {
        id: 'P', parent_id: null, type: 'page', title: 'P', order: 0, updated_at: AT,
        blocks: [{ id: 'link-c', type: 'page-link', pageId: 'C' }],
      },
      { id: 'Q', parent_id: null, type: 'page', title: 'Q', order: 1, updated_at: AT, blocks: [] },
      { id: 'C', parent_id: 'P', type: 'page', title: 'C', order: 0, updated_at: AT, blocks: [] },
    ]
    writeExpandedIds(POND_ID, ['P', 'Q'])

    const linksTo = (pageId: string, linkedTo: string) =>
      (table.find((r) => r.id === pageId)?.blocks ?? []).filter(
        (b) => b.type === 'page-link' && b.pageId === linkedTo
      )

    renderPath()

    expect(linksTo('P', 'C')).toHaveLength(1)
    expect(linksTo('Q', 'C')).toHaveLength(0)

    const dragged = screen.getByRole('treeitem', { name: 'C' })
    const target = screen.getByRole('treeitem', { name: 'Q' })
    fireEvent(dragged, dragStartEvent())
    fireEvent(target, dropEvent(0))

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
    await screen.findByText('moved C to Q ·')
    await waitFor(() => expect(table.find((r) => r.id === 'C')?.parent_id).toBe('Q'))
    expect(linksTo('P', 'C')).toHaveLength(0)
    expect(linksTo('Q', 'C')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'undo' }))
    await waitFor(() => expect(table.find((r) => r.id === 'C')?.parent_id).toBe('P'))
    expect(linksTo('P', 'C')).toHaveLength(1)
    expect(linksTo('Q', 'C')).toHaveLength(0)

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await waitFor(() => expect(table.find((r) => r.id === 'C')?.parent_id).toBe('Q'))
    expect(linksTo('P', 'C')).toHaveLength(0)
    expect(linksTo('Q', 'C')).toHaveLength(1)
  })
})
