/**
 * KAN-415: dragging a row to a new parent (drag-to-reparent) appends a
 * page-link block to that new parent, the same seam the rail's ＋ uses — a
 * same-parent reorder (sibling order only) must not.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { appendChildLinkUnder } from '@/lib/pages/child-links'
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
    after: { parentId: 'page-b', parentTitle: 'Page B', siblingOrder: [] },
  }),
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
  appendOwnEdit: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/pages/child-links', () => ({
  appendChildLinkUnder: jest.fn().mockResolvedValue(undefined),
}))

const AT = '2026-01-01T00:00:00Z'
const ROOT_ROWS: PageRow[] = [
  { id: 'page-a', parent_id: null, type: 'page', title: 'Page A', order: 0, updated_at: AT },
  { id: 'page-b', parent_id: null, type: 'page', title: 'Page B', order: 1, updated_at: AT },
  { id: 'page-c', parent_id: null, type: 'page', title: 'Page C', order: 2, updated_at: AT },
]

afterEach(() => jest.clearAllMocks())

// jsdom's DragEvent doesn't carry a real DataTransfer or forward clientY from
// its init dict, and Rail's handlers read both directly — so the test builds
// plain Events and defines the properties it needs, the same workaround
// `block-canvas-drag-lift.test.tsx` uses for `setDragImage`.
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

it('dropping a row into a new parent gives that parent a link', async () => {
  mountRail(ROOT_ROWS)

  const dragged = screen.getByRole('treeitem', { name: 'Page A' })
  const target = screen.getByRole('treeitem', { name: 'Page B' })

  fireEvent(dragged, dragStartEvent())
  fireEvent(target, dropEvent(0))

  await waitFor(() => expect(appendChildLinkUnder).toHaveBeenCalledTimes(1))
  expect(appendChildLinkUnder).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    'page-b',
    'page-a',
    'pond-1',
    'life'
  )
})

it('a same-parent reorder does not append a second link', async () => {
  mountRail(ROOT_ROWS)

  const dragged = screen.getByRole('treeitem', { name: 'Page A' })
  const target = screen.getByRole('treeitem', { name: 'Page C' })

  fireEvent(dragged, dragStartEvent())
  // A large positive clientY against jsdom's zero-height row rect reads as
  // the 'after' zone (frac > 0.75) rather than the default 'into'.
  fireEvent(target, dropEvent(1000))

  expect(appendChildLinkUnder).not.toHaveBeenCalled()
})

it('dropping a row into a new parent shows an undo toast naming both titles', async () => {
  mountRail(ROOT_ROWS)

  const dragged = screen.getByRole('treeitem', { name: 'Page A' })
  const target = screen.getByRole('treeitem', { name: 'Page B' })

  fireEvent(dragged, dragStartEvent())
  fireEvent(target, dropEvent(0))

  await waitFor(() => expect(screen.getByText('moved Page A to Page B')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'open' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'undo' })).toBeInTheDocument()
})
