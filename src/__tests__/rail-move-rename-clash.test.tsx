/**
 * KAN-470 — dropping a page onto a parent that already has a same-named
 * child suffixes the moved page (`nextAvailableTitle`, matching the create
 * path) instead of failing on the sibling-title unique index (#84). The
 * suffix is computed in `handleMove` BEFORE the RPC, off the destination's
 * current siblings — not a new dedupe rule, so this only exercises the
 * clash/no-clash branches, not `nextAvailableTitle` itself.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { movePage } from '@/lib/pages/client'
import { pagesKey } from '@/lib/pages/keys'
import { mountRail } from './helpers/rail-sweep-fixture'
import type { PageRow } from '@/lib/pages/tree'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue({ id: 'new-page', title: '' }),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue({
    id: 'record-1',
    after: { parentId: 'house', parentTitle: 'house', siblingOrder: [] },
  }),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/page-flush', () => ({ flushPendingPageSave: jest.fn() }))

jest.mock('@/lib/change-log/undo', () => ({
  ...jest.requireActual('@/lib/change-log/undo'),
  undoStep: jest.fn(),
  redoStep: jest.fn(),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/store', () => ({
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/home', () => ({
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'life', blocks: [] }),
}))

const AT = '2026-01-01T00:00:00Z'
// house already holds a child "Notes"; a second, separate top-level "Notes"
// is what gets dragged onto it.
const CLASH_ROWS: PageRow[] = [
  { id: 'house', parent_id: null, type: 'page', title: 'house', order: 0, updated_at: AT },
  { id: 'notes-child', parent_id: 'house', type: 'page', title: 'Notes', order: 0, updated_at: AT },
  { id: 'notes-top', parent_id: null, type: 'page', title: 'Notes', order: 1, updated_at: AT },
]
// No clash: house's only child is named differently from the dragged page.
const NO_CLASH_ROWS: PageRow[] = [
  { id: 'house', parent_id: null, type: 'page', title: 'house', order: 0, updated_at: AT },
  { id: 'roof-child', parent_id: 'house', type: 'page', title: 'roof', order: 0, updated_at: AT },
  { id: 'notes-top', parent_id: null, type: 'page', title: 'Notes', order: 1, updated_at: AT },
]

afterEach(() => jest.clearAllMocks())

// jsdom's DragEvent carries no real DataTransfer and doesn't forward
// clientY from its init dict — same workaround as rail-move-link.test.tsx.
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

function dragNotesOntoHouse() {
  const dragged = screen.getByRole('treeitem', { name: 'Notes' })
  const target = screen.getByRole('treeitem', { name: 'house' })
  fireEvent(dragged, dragStartEvent())
  fireEvent(target, dropEvent(0))
}

it('a clashing drop renames the moved page in the same optimistic write and the same movePage call', async () => {
  const client = mountRail(CLASH_ROWS)

  dragNotesOntoHouse()

  // Synchronous: applyMoveOptimistic runs before handleMove's first await.
  const cached = client.getQueryData<PageRow[]>(pagesKey('pond-1'))
  expect(cached?.find((r) => r.id === 'notes-top')?.title).toBe('Notes 2')

  await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
  expect(movePage).toHaveBeenCalledWith(expect.anything(), {
    id: 'notes-top',
    newParentId: 'house',
    siblingOrder: expect.arrayContaining(['notes-top', 'notes-child']),
    newTitle: 'Notes 2',
  })
})

it('a non-clashing drop calls movePage with no newTitle and leaves the title untouched', async () => {
  const client = mountRail(NO_CLASH_ROWS)

  dragNotesOntoHouse()

  const cached = client.getQueryData<PageRow[]>(pagesKey('pond-1'))
  expect(cached?.find((r) => r.id === 'notes-top')?.title).toBe('Notes')

  await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1))
  expect(movePage).toHaveBeenCalledWith(expect.anything(), {
    id: 'notes-top',
    newParentId: 'house',
    siblingOrder: expect.arrayContaining(['notes-top', 'roof-child']),
  })
})
