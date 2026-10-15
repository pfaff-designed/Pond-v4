/**
 * KAN-273: a deferred delete must commit before the next tree write (create,
 * move, rename) reads siblings or refetches the page list — otherwise the
 * still-undeleted row survives the write's own refetch and flashes back once
 * the grace window later re-deletes it. `withUser` (Rail.tsx) is the one
 * choke point every write passes through; it now awaits `flushStagedDeletes`
 * first (see deletion-undo-wiring.test.tsx 3d for the staging-layer unit).
 *
 * `createPage`/`trashPage`/`fetchPages` are mocked against one shared
 * in-memory `mockPagesTable` (standing in for the `pages` row set a real
 * Postgres would hold) rather than fixed resolved values, so this file can
 * drive a REAL invalidate-and-refetch through Rail's own `withUser` — the
 * mocked `fetchPages` reads the SAME table `trashPage` just wrote to — and
 * reproduce the sibling-unique-title rule a stateless mock can't: an insert
 * of a taken title becomes "Untitled 2" only if that title is still in the
 * table when the insert runs. `createPage`'s mock commits every staged
 * deletion first (the real `flushStagedDeletes` registry call, exactly what
 * `lib/pages/client.ts`'s real `createPage` does — see `pages-client.test.ts`
 * for that call's own unit test), so a collision the production fix prevents
 * never shows up here either — proving the Rail/staging-layer wiring, not
 * `client.ts`'s own flush call, which this file's mock stands in for.
 */
import React from 'react'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { GRACE_WINDOW_MS } from '@/lib/deletion/deferred-commit'
import { unstageId, flushStagedDeletes } from '@/lib/deletion/staged-ids'
import { pagesKey } from '@/lib/pages/keys'
import { createPage } from '@/lib/pages/client'
import { trashPage } from '@/lib/change-log/trash'
import { fetchPages } from '@/lib/pages/tree'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'

const routerPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => ({ get: () => null }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}))

let mockPagesTable: PageRow[] = []
let mockNextId = 1

function mockResetPagesTable(rows: PageRow[]) {
  mockPagesTable = rows.map((r) => ({ ...r }))
}

/** Mirrors `nextAvailableTitle` (dedupe-title.ts): first free "<desired>", "<desired> 2", … */
function mockDedupeTitle(desired: string, existing: string[]): string {
  if (!existing.includes(desired)) return desired
  let n = 2
  while (existing.includes(`${desired} ${n}`)) n++
  return `${desired} ${n}`
}

jest.mock('@/lib/pages/client', () => ({
  createPage: jest.fn(
    async (_sb: unknown, _uid: string, input: { parentId?: string | null; title?: string }) => {
      // Stands in for client.ts's real createPage, which calls this same
      // registry function first (KAN-273) — commits every staged deletion
      // before the sibling read below, so a mid-delete row never dedupes a
      // free title away from the new page.
      await flushStagedDeletes()
      const parentId = input.parentId ?? null
      const siblings = mockPagesTable
        .filter((r) => r.parent_id === parentId)
        .map((r) => r.title)
      const title = mockDedupeTitle(input.title || 'Untitled', siblings)
      const id = `new-${mockNextId++}`
      mockPagesTable.push({
        id,
        parent_id: parentId,
        type: 'page',
        title,
        order: mockPagesTable.length,
        updated_at: '2026-01-01T00:00:00Z',
      })
      return { id, title }
    }
  ),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/change-log/trash', () => ({
  trashPage: jest.fn(async (_sb: unknown, id: string) => {
    mockPagesTable = mockPagesTable.filter((r) => r.id !== id)
  }),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => mockPagesTable.map((r) => ({ ...r }))),
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
  { id: 'sleep', parent_id: null, type: 'page', title: 'Sleep', order: 1, updated_at: AT },
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

function newClient(rows: PageRow[]) {
  mockResetPagesTable(rows)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(pagesKey('pond-1'), rows)
  return client
}

function mount(client: QueryClient) {
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

describe('Rail — delete then create (KAN-273)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    for (const id of ['health', 'sleep']) unstageId(id)
    sessionStorage.clear()
    jest.clearAllMocks()
    mockNextId = 1
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('commits the staged delete before the create reads siblings, so the old row stays gone through the create\'s own refetch and the new row is Untitled, not a dedupe-driven Untitled 2', async () => {
    const client = newClient(ROWS)
    mount(client)

    // Step 1: hover the leaf row and click its × — the row disappears, the undo toast shows.
    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Sleep"')
    // Staged, not yet committed — the row still exists in the "database".
    expect(mockPagesTable.some((r) => r.id === 'sleep')).toBe(true)

    // Step 2: within the grace window, press ＋ on the same parent. The
    // create's own commit-first flush must run BEFORE it reads siblings for
    // the dedupe check, and the invalidate that follows is a REAL refetch
    // against the (now post-delete) in-memory table — not a hand-fed snapshot.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add sub-page to life' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /^page/ }))
    })

    expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'sleep')
    expect(fetchPages).toHaveBeenCalled()
    expect(mockPagesTable.some((r) => r.id === 'sleep')).toBe(false)

    // (a) the deleted row never renders, through the create's real refetch.
    expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    // (b) the new row reads "Untitled" — sleep was gone from the table before
    // the dedupe check ran, so it never collided and was never suffixed.
    expect(screen.getByRole('treeitem', { name: /^Untitled$/ })).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /Untitled 2/ })).not.toBeInTheDocument()

    // Advancing well past the (already-committed) grace window changes nothing.
    await act(async () => {
      jest.advanceTimersByTime(GRACE_WINDOW_MS + 1000)
    })
    expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
  })

  it('＋ pressed while a grace-timer commit is in flight (toast already gone) still reads Untitled, not Untitled 2 (KAN-310 gap 2)', async () => {
    // trashPage stays pending until resolveTrash() runs — the grace timer has
    // fired (so commitDelete/trashPage has started and the toast is gone from
    // toastsRef), but the write itself hasn't landed yet.
    let resolveTrash: (() => void) | undefined
    ;(trashPage as jest.Mock).mockImplementationOnce(
      (_sb: unknown, id: string) =>
        new Promise<void>((resolve) => {
          resolveTrash = () => {
            mockPagesTable = mockPagesTable.filter((r) => r.id !== id)
            resolve()
          }
        })
    )

    // The staged leaf is itself titled "Untitled" — the ticket's literal
    // symptom only reproduces if the row still sitting in the table when the
    // create's dedupe check runs is the SAME title the new page defaults to.
    // A "Sleep" row never collides with "Untitled" regardless of the fix.
    const client = newClient([
      { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
      { id: 'untitled', parent_id: null, type: 'page', title: 'Untitled', order: 1, updated_at: AT },
    ])
    mount(client)

    const untitledRow = screen.getByRole('treeitem', { name: /^Untitled$/ })
    fireEvent.mouseEnter(untitledRow)
    fireEvent.click(within(untitledRow).getByRole('button', { name: 'Delete Untitled' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /^Untitled$/ })).not.toBeInTheDocument()
    )

    // The grace window elapses: trashPage is called (and pending), but the
    // toast is gone already.
    await act(async () => {
      jest.advanceTimersByTime(GRACE_WINDOW_MS + 1)
    })
    expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'untitled')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(mockPagesTable.some((r) => r.id === 'untitled')).toBe(true)

    // ＋ pressed on the parent before the in-flight commit resolves. createPage's
    // own commit-first flush (flushStagedDeletes) must still be waiting on it.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add sub-page to life' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /^page/ }))
    })
    expect(screen.queryByRole('treeitem', { name: /^Untitled$/ })).not.toBeInTheDocument()

    // The commit lands — the staged "Untitled" leaves the table before the
    // create's dedupe check ever gets to read siblings.
    await act(async () => {
      resolveTrash?.()
    })

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /^Untitled$/ })).toBeInTheDocument()
    )
    expect(screen.queryByRole('treeitem', { name: /Untitled 2/ })).not.toBeInTheDocument()
  })

  it('restores the row when Undo is clicked within the grace window, and never commits the delete', async () => {
    const client = newClient(ROWS)
    mount(client)

    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })

    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /Sleep/ })).toBeInTheDocument()
    )

    await act(async () => {
      jest.advanceTimersByTime(GRACE_WINDOW_MS + 1000)
    })

    expect(trashPage).not.toHaveBeenCalled()
    expect(screen.getByRole('treeitem', { name: /Sleep/ })).toBeInTheDocument()
  })

  it("a staged delete's own grace-timer commit does not force-commit an unrelated staged delete", async () => {
    // A third leaf so the tree isn't empty once both Sleep and Health are
    // staged — an empty rail renders its own "no pages yet" status message,
    // which would collide with the undo toast's role="status" below.
    const client = newClient([
      ...ROWS,
      { id: 'diet', parent_id: null, type: 'page', title: 'Diet', order: 2, updated_at: AT },
    ])
    mount(client)

    // Stage delete A (Sleep).
    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    )

    // 2s later, stage delete B (Health) — its own grace window starts now.
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    const healthRow = screen.getByRole('treeitem', { name: /Health/ })
    fireEvent.mouseEnter(healthRow)
    fireEvent.click(within(healthRow).getByRole('button', { name: 'Delete Health' }))
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Health/ })).not.toBeInTheDocument()
    )

    // Advance to A's 6s mark (4s further). A's grace timer fires and commits.
    // B was staged 2s later, so B's own timer has not fired yet.
    await act(async () => {
      jest.advanceTimersByTime(GRACE_WINDOW_MS - 2000)
    })

    expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'sleep')
    expect(trashPage).not.toHaveBeenCalledWith(expect.anything(), 'health')

    // B is still staged: its toast is showing, and Undo restores it.
    expect(screen.getByRole('status')).toHaveTextContent('Deleted "Health"')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: /Health/ })).toBeInTheDocument()
    )
    expect(trashPage).not.toHaveBeenCalledWith(expect.anything(), 'health')
  })

  it('shows the title createPage actually returned, not a hardcoded Untitled', async () => {
    ;(createPage as jest.Mock).mockResolvedValueOnce({ id: 'new-2', title: 'Untitled 2' })
    const client = newClient(ROWS)
    mount(client)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add sub-page to life' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /^page/ }))
    })

    expect(screen.getByRole('treeitem', { name: /Untitled 2/ })).toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: /^Untitled$/ })).not.toBeInTheDocument()

    const pushedUrl = routerPush.mock.calls.at(-1)?.[0] as string
    expect(pushedUrl).toContain('nodeId=new-2')
    expect(pushedUrl).toContain('nodeName=Untitled+2')
  })
})

describe('Rail — a grace-timer delete commit invalidates the relation caches (KAN-311)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    for (const id of ['health', 'sleep']) unstageId(id)
    sessionStorage.clear()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('invalidates the rows and page caches once the grace-timer commit lands, so a chip flips without a reload', async () => {
    const client = newClient(ROWS)
    mount(client)
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')

    const sleepRow = screen.getByRole('treeitem', { name: /Sleep/ })
    fireEvent.mouseEnter(sleepRow)
    fireEvent.click(within(sleepRow).getByRole('button', { name: 'Delete Sleep' }))

    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: /Sleep/ })).not.toBeInTheDocument()
    )

    await act(async () => {
      jest.advanceTimersByTime(GRACE_WINDOW_MS + 1)
    })
    await waitFor(() => expect(trashPage).toHaveBeenCalledWith(expect.anything(), 'sleep'))

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rows'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['page'] })
  })
})
