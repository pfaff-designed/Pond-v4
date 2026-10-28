/**
 * KAN-565 path test — PATH_STEPS 1–5, two tabs on the same pond modelled as
 * two independent `QueryClient`/`Rail`+`DocumentPanel` trees sharing one fake
 * server (`livePages`/`records`), the same pattern `trash-path.test.tsx`
 * already uses: restore A in tab 1, focus tab 2 and confirm A drops with no
 * manual action, then restore B in tab 2 and confirm exactly one
 * `restorePage` call for B, A never re-sent, and tab 2's table ends empty.
 */

import React from 'react'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Rail } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { pagesKey } from '@/lib/pages/keys'
import type { PageRow } from '@/lib/pages/tree'
import type { Pond } from '@/lib/pond/client'
import type { ChangeLogRecord, TrashSnapshot } from '@/lib/change-log/types'

// A stateful fake of `next/navigation`, copied from `trash-path.test.tsx`: it
// lets Rail's click and DocumentPanel's read agree on the SAME url. Both
// tabs' trees share it, which models each tab already having its address
// bar on the trash page — the thing this test actually needs, since the
// whole point is two tabs on the same page with two separate caches, not
// two separate address bars.
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

function snapshot(over: Partial<TrashSnapshot> = {}): TrashSnapshot {
  return {
    title: 'untitled',
    parentId: null,
    order: 0,
    pageIds: [],
    blockCount: 0,
    nestedPageCount: 0,
    parentPath: [],
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

// A wrapper arrow function in the `jest.mock` factory below (not a direct
// `restorePage: mockRestorePage` assignment) so this file can assert call
// counts: `jest.mock` factories are hoisted above this `const`, and a direct
// assignment would read it before initialization — the wrapper only closes
// over the binding, read lazily at call time, well after this line has run
// (same pattern `trash-page.test.tsx`'s `mockListRecords` uses).
const mockRestorePage = jest.fn(async (_sb: unknown, recordId: string) => {
  const deleteRecord = records.find((r) => r.id === recordId)
  if (!deleteRecord || deleteRecord.targetPageId === null) return
  const snap = deleteRecord.before as TrashSnapshot
  livePages = [
    ...livePages,
    {
      id: deleteRecord.targetPageId,
      parent_id: snap.parentId,
      type: 'page',
      title: snap.title,
      order: snap.order,
      updated_at: new Date().toISOString(),
    },
  ]
  records = [
    ...records,
    record({
      id: `restore-${recordId}`,
      action: 'restore',
      targetPageId: deleteRecord.targetPageId,
      createdAt: new Date().toISOString(),
      statusAt: new Date().toISOString(),
    }),
  ]
})

jest.mock('@/lib/change-log/trash', () => ({
  ...jest.requireActual('@/lib/change-log/trash'),
  existingPageIds: jest.fn(async (_sb: unknown, ids: string[]) => new Set(ids)),
  restorePage: (...args: [unknown, string]) => mockRestorePage(...args),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({
  requestNotify: jest.fn(),
}))

const POND: Pond = { id: 'pond-1', name: 'life', glyph: null, theme: 'light', order: 0, recentGlyphs: [] }
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
  window.localStorage.clear()
  ;(jest.requireMock('next/navigation') as { __reset: () => void }).__reset()
  livePages = []
  records = [
    record({
      id: 'del-a',
      targetPageId: 'page-a',
      before: snapshot({ title: 'Page A' }),
      createdAt: '2026-01-01T00:00:00Z',
      statusAt: '2026-01-01T00:00:00Z',
    }),
    record({
      id: 'del-b',
      targetPageId: 'page-b',
      before: snapshot({ title: 'Page B' }),
      createdAt: '2026-01-02T00:00:00Z',
      statusAt: '2026-01-02T00:00:00Z',
    }),
  ]
})

function mountTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(pagesKey('pond-1'), [...livePages])
  const { container } = render(
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
  return container
}

function rowWithTitle(panel: HTMLElement, title: string): HTMLElement {
  const row = within(panel)
    .getAllByTestId('trash-row')
    .find((candidate) => within(candidate).queryByText(title))
  if (!row) throw new Error(`no trash row for "${title}"`)
  return row
}

describe('PATH_STEPS 1–5 (KAN-565) — a second tab learns of another tab\'s restore on focus, and never re-sends it', () => {
  it('drops a cross-tab-restored row on focus, and restoring the remaining row sends exactly one call', async () => {
    // 1. Open trash in both tabs.
    const tab1 = mountTab()
    const tab2 = mountTab()
    fireEvent.click(within(tab1).getByRole('treeitem', { name: 'trash' }))
    fireEvent.click(within(tab2).getByRole('treeitem', { name: 'trash' }))

    const panel1 = within(tab1).getByTestId('document-panel')
    const panel2 = within(tab2).getByTestId('document-panel')

    expect(await within(panel1).findAllByTestId('trash-row')).toHaveLength(2)
    expect(await within(panel2).findAllByTestId('trash-row')).toHaveLength(2)

    // 2. Restore A in tab 1.
    fireEvent.click(within(rowWithTitle(panel1, 'Page A')).getByRole('button', { name: 'restore' }))
    await waitFor(() => expect(within(panel1).queryAllByTestId('trash-row')).toHaveLength(1))

    // Tab 2's own cache hasn't refetched yet — A still shows there.
    expect(within(panel2).queryAllByTestId('trash-row')).toHaveLength(2)

    // 3. Focus tab 2: A is gone, with no manual action — react-query's focus
    // manager listens for `visibilitychange`, not a literal `focus` event.
    await act(async () => {
      fireEvent(window, new Event('visibilitychange'))
    })
    await waitFor(() => expect(within(panel2).queryAllByTestId('trash-row')).toHaveLength(1))
    expect(within(panel2).queryByText('Page A')).not.toBeInTheDocument()
    expect(within(panel2).getByText('Page B')).toBeInTheDocument()

    // 4. Restore B in tab 2: only B comes back, and tab 2 ends empty.
    fireEvent.click(within(panel2).getByRole('button', { name: 'restore' }))
    await waitFor(() =>
      expect(within(panel2).getByTestId('trash-empty')).toHaveTextContent('trash is empty')
    )

    // Exactly one `restorePage` call for B; A was never re-sent from tab 2.
    expect(mockRestorePage.mock.calls.filter(([, recordId]) => recordId === 'del-b')).toHaveLength(1)
    expect(mockRestorePage.mock.calls.filter(([, recordId]) => recordId === 'del-a')).toHaveLength(1)
  })
})
