/**
 * KAN-451 path test — PATH_STEPS 1–5, end to end against the real hosting
 * surfaces (`Rail` beside `DocumentPanel`, one navigable URL), not the
 * helpers underneath them: expand `databases`, confirm `trash` sits right
 * after `change log` with no delete × / rename; delete a page from the
 * rail; open `trash` and confirm the deleted page is the top row reading
 * "in 30 days"; restore it and confirm the row leaves the list and the page
 * is back under its old parent in the rail.
 *
 * `trashPage`/`restorePage`/`listRecords` are faked against one shared,
 * mutable in-memory store (`livePages`/`records`) rather than mocked to
 * fixed return values — a real `trash_page`/`restore_page` RPC mutates the
 * same underlying rows a later `listRecords`/`fetchPages` reads back, and
 * this test needs that round trip (the deleted page reappearing in the
 * trash table, then reappearing in the rail after restore) to actually
 * happen, not just be asserted against a canned response.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'

// A stateful fake of `next/navigation`: `push` actually advances the URL and
// notifies every mounted `useSearchParams()` — Rail's click and
// DocumentPanel's read need to see the SAME URL, the same way the running
// app's address bar would (copied from `change-log-path.test.tsx`).
jest.mock('next/navigation', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react')
  let current = new URLSearchParams()
  const listeners = new Set<(params: URLSearchParams) => void>()
  const push = jest.fn((href: string) => {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
    current = new URLSearchParams(qs)
    listeners.forEach((listener) => listener(current))
  })
  return {
    __reset: () => {
      current = new URLSearchParams()
    },
    useRouter: () => ({ push, replace: jest.fn() }),
    useSearchParams: () => {
      const [params, setParams] = useState(current)
      useEffect(() => {
        listeners.add(setParams)
        return () => {
          listeners.delete(setParams)
        }
      }, [])
      return params
    },
  }
})

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    storage: { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() })) },
  }),
}))

// The one shared "server": a page delete/restore mutates the same rows a
// later `fetchPages`/`listRecords` read back.
const AT = '2026-01-01T00:00:00Z'
let livePages: PageRow[] = []
let records: ChangeLogRecord[] = []

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'delete',
    actor: 'you',
    targetPageId: null,
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
    ...over,
  }
}

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn(async () => [...livePages]),
}))

jest.mock('@/lib/pages/client', () => ({
  ...jest.requireActual('@/lib/pages/client'),
  getPage: jest.fn().mockResolvedValue(null),
  createPage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  movePage: jest.fn().mockResolvedValue(undefined),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  setProperty: jest.fn().mockResolvedValue(undefined),
  listPages: jest.fn().mockResolvedValue([]),
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
  countWaiting: jest.fn().mockResolvedValue(0),
  appendOwnEdit: jest.fn().mockResolvedValue({}),
  getRecord: jest.fn().mockResolvedValue(null),
  listRecords: jest.fn(async () => [...records]),
}))

jest.mock('@/lib/change-log/trash', () => ({
  ...jest.requireActual('@/lib/change-log/trash'),
  existingPageIds: jest.fn(async (_sb: unknown, ids: string[]) => new Set(ids)),
  // Mirrors the real `trash_page` RPC: stamps the row out of the live set
  // and logs the one `delete` record a trashed subtree's root carries.
  trashPage: jest.fn(async (_sb: unknown, pageId: string) => {
    const idx = livePages.findIndex((p) => p.id === pageId)
    if (idx === -1) return
    const page = livePages[idx]
    livePages = livePages.filter((p) => p.id !== pageId)
    const snapshot: TrashSnapshot = {
      title: page.title,
      parentId: page.parent_id,
      order: page.order,
      pageIds: [pageId],
      blockCount: 0,
      nestedPageCount: 0,
      parentPath: [],
    }
    records = [
      ...records,
      record({
        id: 'del-marathon',
        targetPageId: pageId,
        before: snapshot,
        createdAt: new Date().toISOString(),
        statusAt: new Date().toISOString(),
      }),
    ]
  }),
  // Mirrors `restore_page`: puts the row back where its `TrashSnapshot` says
  // it came from and logs the answering `restore` record `buildTrashRows`
  // pairs against the `delete` to drop the row from the table.
  restorePage: jest.fn(async (_sb: unknown, recordId: string) => {
    const deleteRecord = records.find((r) => r.id === recordId)
    if (!deleteRecord || deleteRecord.targetPageId === null) return
    const snapshot = deleteRecord.before as TrashSnapshot
    livePages = [
      ...livePages,
      {
        id: deleteRecord.targetPageId,
        parent_id: snapshot.parentId,
        type: 'page',
        title: snapshot.title,
        order: snapshot.order,
        updated_at: new Date().toISOString(),
      },
    ]
    records = [
      ...records,
      record({
        id: 'restore-marathon',
        action: 'restore',
        targetPageId: deleteRecord.targetPageId,
        createdAt: new Date().toISOString(),
        statusAt: new Date().toISOString(),
      }),
    ]
  }),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

const ROWS: PageRow[] = [
  { id: 'health', parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: AT },
  { id: 'marathon', parent_id: 'health', type: 'page', title: 'Marathon', order: 0, updated_at: AT },
  { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
]

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
const PROVIDER_VALUE: PondContextValue = {
  pond: POND,
  ponds: [POND],
  loading: false,
  reload: () => {},
  addPond: () => {},
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(jest.requireMock('next/navigation') as { __reset: () => void }).__reset()
  livePages = ROWS.map((r) => ({ ...r }))
  records = []
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(pagesKey('pond-1'), livePages)
  render(
    <QueryClientProvider client={client}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
          <div data-testid="document-panel">
            <DocumentPanel />
          </div>
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
}

describe('PATH_STEPS 1–5 — the rail deletes a page, trash shows it, restore puts it back', () => {
  it('walks the whole path on the real rail + document panel', async () => {
    mount()

    // 1–2. Expanding `databases` reveals `change log` then `trash`, in that
    // order, with neither a delete × nor a rename affordance.
    const databasesTree = screen.getByRole('tree', { name: 'Databases' })
    fireEvent.click(within(databasesTree).getByRole('treeitem', { name: 'databases' }))
    const trashRow = await within(databasesTree).findByRole('treeitem', { name: 'trash' })
    const treeRows = within(databasesTree).getAllByRole('treeitem')
    expect(treeRows[1]).toHaveAccessibleName('change log')
    expect(treeRows[2]).toHaveAccessibleName('trash')
    expect(within(trashRow).queryByRole('button', { name: 'Delete trash' })).not.toBeInTheDocument()
    fireEvent.doubleClick(trashRow)
    expect(within(databasesTree).queryByRole('textbox')).not.toBeInTheDocument()

    // 3. Delete "Marathon" (a leaf, under "Health") from the rail: expand
    // Health first so it's still expanded once the page comes back later.
    const workspaceTree = screen.getByRole('tree', { name: 'Workspace' })
    const healthRow = within(workspaceTree).getByRole('treeitem', { name: 'Health' })
    fireEvent.keyDown(healthRow, { key: 'ArrowRight' })
    const marathonRow = await within(workspaceTree).findByRole('treeitem', { name: 'Marathon' })
    fireEvent.mouseEnter(marathonRow)
    fireEvent.click(within(marathonRow).getByRole('button', { name: 'Delete Marathon' }))
    await waitFor(() =>
      expect(within(workspaceTree).queryByRole('treeitem', { name: 'Marathon' })).not.toBeInTheDocument()
    )
    // Force the deferred commit now rather than waiting out the grace window.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(records).toHaveLength(1))

    // 4. Open `trash`: the just-deleted page is the top (only) row, reading
    // "in 30 days" in its `goes` column.
    fireEvent.click(trashRow)
    const panel = screen.getByTestId('document-panel')
    const rows = await within(panel).findAllByTestId('trash-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Marathon')).toBeInTheDocument()
    expect(within(rows[0]).getByText('in 30 days')).toBeInTheDocument()

    // 5. Restore it: the row leaves the trash table, and the page is back
    // under its old parent ("Health", still expanded) in the rail.
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'restore' }))
    await waitFor(() => expect(within(panel).queryByTestId('trash-row')).not.toBeInTheDocument())
    expect(await within(panel).findByTestId('trash-empty')).toHaveTextContent('trash is empty')

    const restoredRow = await within(workspaceTree).findByRole('treeitem', { name: 'Marathon' })
    expect(Number(restoredRow.getAttribute('aria-level'))).toBe(
      Number(healthRow.getAttribute('aria-level')) + 1
    )
  })
})
