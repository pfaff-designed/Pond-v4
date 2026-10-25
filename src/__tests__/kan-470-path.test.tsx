/**
 * KAN-470 — PATH_STEPS' own walk: house already holds a child "Notes"; a
 * second, separate top-level "Notes" is dragged onto house. The clash
 * suffixes the moved page ("Notes 2") in the SAME move, the toast reads
 * `moved Notes to house as "Notes 2" ·`, opening it shows "Notes 2", and
 * undo (the toast button, then ⌘Z on a second run of the same drag) puts it
 * back under its old parent named "Notes" — ⇧⌘Z re-applies it under house
 * as "Notes 2". Mounts the real `Rail` + `ShellCommands` +
 * `DeletionUndoProvider` sharing one real `sessionUndo` stack, exactly like
 * `rail-move-undo-path.test.tsx` — only the RPC boundary is mocked
 * (`movePage`/`undoStep`/`redoStep`, `fetchPages` against a mutable
 * in-memory table all three fakes mutate together).
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
import { undoStep, redoStep } from '@/lib/change-log/undo'
import type { MoveSnapshot } from '@/lib/change-log/types'
import type { Pond } from '@/lib/pond/client'

const routerPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => ({ get: () => null }),
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
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

// `undo.ts` stays real apart from the RPC boundary (like rail-move-undo-
// path.test.tsx) — this proves the toast's own undo (`sessionUndo.undoHandle`)
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
// `undoStep` and `redoStep` all mutate it, `fetchPages` reads it. house
// already holds a child "Notes" (notes-child); notes-top is the separate
// top-level "Notes" that gets dragged onto house.
let table: PageRow[]
function resetTable() {
  table = [
    { id: 'house', parent_id: null, type: 'page', title: 'house', order: 0, updated_at: AT },
    { id: 'notes-child', parent_id: 'house', type: 'page', title: 'Notes', order: 0, updated_at: AT },
    { id: 'notes-top', parent_id: null, type: 'page', title: 'Notes', order: 1, updated_at: AT },
  ]
}
const titleOf = (id: string | null) => table.find((r) => r.id === id)?.title ?? 'life'
function applySnapshot(pageId: string, snap: MoveSnapshot) {
  const page = table.find((r) => r.id === pageId)
  if (!page) return
  page.parent_id = snap.parentId
  if (snap.title !== undefined) page.title = snap.title
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
  removePond: () => {},
}

beforeEach(() => {
  jest.clearAllMocks()
  resetTable()
  moveLog = new Map()
  recordSeq = 0
  window.localStorage.clear()

  jest.mocked(fetchPages).mockImplementation(async () => table.map((r) => ({ ...r })))

  jest.mocked(movePage).mockImplementation(
    async (
      _sb: unknown,
      input: { id: string; newParentId: string | null; siblingOrder: string[]; newTitle?: string }
    ) => {
      const page = table.find((r) => r.id === input.id)
      if (!page) throw new Error(`move_page: moving page ${input.id} returned no record`)
      const oldParentId = page.parent_id
      const oldTitle = page.title
      const before: MoveSnapshot = {
        parentId: oldParentId,
        parentTitle: titleOf(oldParentId),
        siblingOrder: table.filter((r) => r.parent_id === oldParentId).map((r) => r.id),
        ...(input.newTitle !== undefined ? { title: oldTitle } : {}),
      }
      applySnapshot(input.id, {
        parentId: input.newParentId,
        parentTitle: '',
        siblingOrder: input.siblingOrder,
        ...(input.newTitle !== undefined ? { title: input.newTitle } : {}),
      })
      const after: MoveSnapshot = {
        parentId: input.newParentId,
        parentTitle: titleOf(input.newParentId),
        siblingOrder: input.siblingOrder,
        ...(input.newTitle !== undefined ? { title: input.newTitle } : {}),
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
  jest.mocked(redoStep).mockImplementation(async (_sb: unknown, step: { recordIds: readonly string[] }) => {
    const entry = moveLog.get(step.recordIds[0])
    if (!entry) throw new Error(`no move record for ${step.recordIds[0]}`)
    applySnapshot(entry.pageId, entry.after)
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

// A clean "into" drop expands house (Rail.tsx's own expand-on-drop), so once
// the first move has landed, house's "Notes" child stays visible alongside
// the dragged, top-level one — both named "Notes". The top-level row is the
// one at depth 2 (life=1, its direct children=2); house's child sits at 3.
function dragNotesOntoHouse() {
  const dragged = screen
    .getAllByRole('treeitem', { name: 'Notes' })
    .find((el) => el.getAttribute('aria-level') === '2')
  if (!dragged) throw new Error('top-level "Notes" row not found')
  const target = screen.getByRole('treeitem', { name: 'house' })
  fireEvent(dragged, dragStartEvent())
  fireEvent(target, dropEvent(0))
}

const parentIdOfNotesTop = () => table.find((r) => r.id === 'notes-top')?.parent_id ?? null
const titleOfNotesTop = () => table.find((r) => r.id === 'notes-top')?.title

describe('rail drag-move suffixes a clashing title and shares the undo/redo stack (KAN-470)', () => {
  it('walks PATH_STEPS: drag, suffixed toast, open shows suffix, undo, drag again, ⌘Z, ⇧⌘Z', async () => {
    renderPath()

    dragNotesOntoHouse()

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
    expect(movePage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'notes-top', newParentId: 'house', newTitle: 'Notes 2' })
    )
    await screen.findByText('moved Notes to house as "Notes 2" ·')
    expect(screen.getByRole('button', { name: 'open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
    await waitFor(() => expect(parentIdOfNotesTop()).toBe('house'))
    expect(titleOfNotesTop()).toBe('Notes 2')

    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining('nodeName=Notes+2'))

    await userEvent.click(screen.getByRole('button', { name: 'undo' }))
    expect(screen.queryByText('moved Notes to house as "Notes 2" ·')).not.toBeInTheDocument()
    await waitFor(() => expect(parentIdOfNotesTop()).toBe(null))
    expect(titleOfNotesTop()).toBe('Notes')

    dragNotesOntoHouse()
    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(parentIdOfNotesTop()).toBe('house'))
    expect(titleOfNotesTop()).toBe('Notes 2')

    const user = userEvent.setup()
    await user.click(document.body)
    await user.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(parentIdOfNotesTop()).toBe(null))
    expect(titleOfNotesTop()).toBe('Notes')

    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await waitFor(() => expect(parentIdOfNotesTop()).toBe('house'))
    expect(titleOfNotesTop()).toBe('Notes 2')
  })
})
