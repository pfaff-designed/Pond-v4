/**
 * Path test for KAN-486 PATH_STEPS 1 & 2, on the real `Rail`: a fresh pond's
 * databases section starts collapsed, toggles both ways by click and by
 * keyboard, survives a remount (localStorage persistence, KAN-393), and stays
 * collapsed when a database child is reached by URL instead of by expanding
 * the section itself. Trash (KAN-504) is its own top-level foot row now, so
 * it is never subject to the databases section's own disclosure.
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import { TRASH_NODE_ID } from '@/lib/change-log/trash-view'

const push = jest.fn()
let currentNodeId: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? currentNodeId : null) }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
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

const AT = '2026-01-01T00:00:00Z'
const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
  { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
  { id: 'db-1', parent_id: 'root-db', type: 'page', title: 'ingredients', order: 0, updated_at: AT },
]

const POND: Pond = {
  id: 'pond-1',
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
}

/** A fresh `QueryClient` per mount — the pages cache, not the rail's own
 *  persistence, which lives in real `localStorage` and so survives a remount
 *  the way a reload's would. */
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), ROWS)
  return render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

function heading() {
  const foot = screen.getByRole('tree', { name: 'Databases' })
  return within(foot).getByRole('treeitem', { name: 'databases' })
}

/** The row's own caret — `aria-hidden`, so queried by hand. */
function caretSvgOf(row: HTMLElement) {
  const svg = row.querySelector('button[aria-hidden="true"] svg')
  if (!svg) throw new Error('row has no caret')
  return svg
}

describe('Rail — the databases section collapses, starts collapsed, and remembers (KAN-486 PATH_STEPS 1 & 2)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentNodeId = null
    jest.clearAllMocks()
  })

  it('starts collapsed on a fresh pond, toggles both ways by click, and survives a remount', async () => {
    let rendered = mount()
    let head = heading()
    expect(head).toHaveAttribute('aria-expanded', 'false')
    expect(caretSvgOf(head)).not.toHaveClass('rotate-90')
    expect(caretSvgOf(head)).not.toHaveClass('-rotate-90')
    expect(screen.queryByRole('treeitem', { name: 'change log' })).not.toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()

    fireEvent.click(head)
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'true'))
    head = heading()
    // The heading's rows render ABOVE it, never below — its caret points UP
    // when open (Conductor decision A), not down like an ordinary folder row.
    expect(caretSvgOf(head)).toHaveClass('-rotate-90')
    expect(screen.getByRole('treeitem', { name: 'change log' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'ingredients' })).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()

    // Remount — same localStorage, simulating a reload: stays open.
    rendered.unmount()
    rendered = mount()
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('treeitem', { name: 'change log' })).toBeInTheDocument()

    fireEvent.click(heading())
    expect(heading()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: 'change log' })).not.toBeInTheDocument()

    // Remount again: stays collapsed.
    rendered.unmount()
    mount()
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByRole('treeitem', { name: 'change log' })).not.toBeInTheDocument()
  })

  it('toggles from the keyboard: ↵ and Space each toggle; → opens, ← closes', async () => {
    mount()
    const head = heading()
    act(() => head.focus())

    fireEvent.keyDown(head, { key: 'Enter' })
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.keyDown(heading(), { key: ' ' })
    expect(heading()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(heading(), { key: 'ArrowRight' })
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.keyDown(heading(), { key: 'ArrowLeft' })
    expect(heading()).toHaveAttribute('aria-expanded', 'false')
    expect(push).not.toHaveBeenCalled()
  })

  it('a URL opening a database child leaves the section collapsed; expanding it then shows that row selected', async () => {
    currentNodeId = 'db-1'
    mount()

    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByRole('treeitem', { name: 'ingredients' })).not.toBeInTheDocument()

    fireEvent.click(heading())
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'ingredients' })).toBeInTheDocument()
    )
    expect(screen.getByRole('treeitem', { name: 'ingredients' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('a URL opening trash shows it selected immediately, regardless of the databases section being collapsed or expanded', async () => {
    currentNodeId = TRASH_NODE_ID
    mount()

    // Trash is its own top-level row (KAN-504) with no ancestors of its own,
    // so there is nothing for the databases section's disclosure to gate —
    // it starts collapsed, same as any other pond, while trash is already there.
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.getByRole('treeitem', { name: 'trash' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'trash' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(heading())
    await waitFor(() => expect(heading()).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('treeitem', { name: 'trash' })).toHaveAttribute('aria-selected', 'true')
  })

  it('every database row precedes the heading in DOM order, and ArrowDown/ArrowUp walk that same order', async () => {
    mount()
    fireEvent.click(heading())
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'ingredients' })).toBeInTheDocument()
    )
    const changeLog = screen.getByRole('treeitem', { name: 'change log' })
    const ingredients = screen.getByRole('treeitem', { name: 'ingredients' })

    // Rendering the heading LAST (KAN-486: its rows sit above it, never below)
    // means every db row comes BEFORE it in document order. Trash (KAN-504)
    // is no longer a database row, so it is not part of this group.
    for (const dbRow of [changeLog, ingredients]) {
      expect(
        dbRow.compareDocumentPosition(heading()) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }

    act(() => changeLog.focus())
    fireEvent.keyDown(changeLog, { key: 'ArrowDown' })
    expect(ingredients).toHaveFocus()
    fireEvent.keyDown(ingredients, { key: 'ArrowDown' })
    expect(heading()).toHaveFocus()

    fireEvent.keyDown(heading(), { key: 'ArrowUp' })
    expect(ingredients).toHaveFocus()
    fireEvent.keyDown(ingredients, { key: 'ArrowUp' })
    expect(changeLog).toHaveFocus()
  })
})
