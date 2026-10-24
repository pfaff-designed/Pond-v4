/**
 * KAN-415 path test A, on the real page-hosting surface: a page saved before
 * page-links existed shows its three children as page-link rows, in rail
 * order, with no card grid — and a reload (the parent already carrying the
 * written blocks + the `childLinksMigrated` stamp) never re-appends. Mocking
 * harness copied from `document-panel-nested-page-path.test.tsx` and
 * `document-panel-child-links-migration.test.tsx` (KAN-415's own migration
 * unit tests, which assert on `commitBlocks`/`markChildLinksMigrated` call
 * args rather than the rendered DOM — this file is the DOM-level path test
 * those left uncovered).
 */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { PageRow } from '@/lib/pages/tree'
import type { ChangeLogRecord } from '@/lib/change-log/types'

let mockNodeId = 'page-1'
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? mockNodeId : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

let mockRows: PageRow[] = []
jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(() => Promise.resolve(mockRows)),
  insertPageOptimistic: jest.fn(),
  applyPagePropsOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

const mockGetPage = jest.fn()
const mockDeletePage = jest.fn().mockResolvedValue(undefined)
const mockMovePage = jest.fn().mockResolvedValue(undefined)
const mockSaveBlocks = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/pages/client', () => ({
  getPage: (...args: unknown[]) => mockGetPage(...args),
  updateTitle: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  defineSchema: jest.fn().mockResolvedValue(undefined),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
  movePage: (...args: unknown[]) => mockMovePage(...args),
  saveBlocks: (...args: unknown[]) => mockSaveBlocks(...args),
}))

const mockCommitBlocks = jest.fn()
jest.mock('@/lib/pages/commit', () =>
  jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
    commitBlocks: (...args: unknown[]) => mockCommitBlocks(...args),
  })
)

const mockMarkChildLinksMigrated = jest.fn()
jest.mock('@/lib/pages/child-links', () => ({
  ...jest.requireActual('@/lib/pages/child-links'),
  markChildLinksMigrated: (...args: unknown[]) => mockMarkChildLinksMigrated(...args),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: 'pond-1', name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => 'pond-1',
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

const mockSessionUndo = jest.fn()
const mockSessionRedo = jest.fn()
jest.mock('@/lib/change-log/session-undo', () => ({
  sessionUndo: {
    undo: (...args: unknown[]) => mockSessionUndo(...args),
    redo: (...args: unknown[]) => mockSessionRedo(...args),
    undoHandle: (...args: unknown[]) => mockSessionUndo(...args),
    remember: () => {},
    rememberPending: () => ({}),
    markPendingFailed: () => {},
    // BlockCanvas's delete toast (KAN-368) watches the stack via `subscribe`
    // and checks `isTopUndo` — this test never pushes a second step, so
    // there's nothing for either to ever report.
    subscribe: () => () => {},
    isTopUndo: () => true,
  },
}))

type SeedPage = { id: string; title: string; blocks: Block[]; props: Record<string, unknown> }
const PAGES: Record<string, SeedPage> = {}

function mount() {
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => PAGES[id])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

// ⌘Z/⇧⌘Z is `ShellCommands`' own global chord (`sessionUndo`), not BlockCanvas's —
// mounted alongside `DocumentPanel` only where a test needs it (path test B's undo
// sub-step), matching `undo-redraw-within-1s.test.tsx`'s harness.
function mountWithShell() {
  mockGetPage.mockImplementation(async (_supabase: unknown, id: string) => PAGES[id])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const linkRows = () =>
  [...document.querySelectorAll('[id^="block-"]')].filter((el) =>
    el.querySelector('[aria-label^="Open "]')
  )

const rowTitle = (row: Element) =>
  within(row as HTMLElement).getByText(/^Creative$|^personal$|^professional$/).textContent

beforeEach(() => {
  jest.clearAllMocks()
  mockNodeId = 'page-1'
  // The real `commitBlocks` resolves `{ remembered }` for an own-edit save (KAN-355).
  mockCommitBlocks.mockResolvedValue({ remembered: Promise.resolve() })
  mockMarkChildLinksMigrated.mockResolvedValue(undefined)
  mockRows = [
    {
      id: 'child-creative',
      parent_id: 'page-1',
      type: 'page',
      title: 'Creative',
      order: 0,
      updated_at: '2026-01-01',
    },
    {
      id: 'child-personal',
      parent_id: 'page-1',
      type: 'page',
      title: 'personal',
      order: 1,
      updated_at: '2026-01-01',
    },
    {
      id: 'child-professional',
      parent_id: 'page-1',
      type: 'page',
      title: 'professional',
      order: 2,
      updated_at: '2026-01-01',
    },
  ]
})

describe('a page with children, upgraded on load, shows page-link rows not a card grid (KAN-415 path test A)', () => {
  it('derives the three rows at read time with no write, even across a reload — the person’s own edit is what stores and stamps them (KAN-477)', async () => {
    PAGES['page-1'] = { id: 'page-1', title: 'Workshop', blocks: [], props: {} }
    mount()

    await waitFor(() => expect(linkRows()).toHaveLength(3))
    expect(
      linkRows().map(
        (row) =>
          within(row as HTMLElement).getByText(/^Creative$|^personal$|^professional$/).textContent
      )
    ).toEqual(['Creative', 'personal', 'professional'])
    expect(screen.queryByText(/\d+ pages? inside/)).not.toBeInTheDocument()

    // Past the 600ms debounce — a derived-at-read render must never schedule
    // or land a save.
    await new Promise((r) => setTimeout(r, 700))
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()

    // A reload of the SAME still-unstamped page re-derives the same rows,
    // still with no write.
    cleanup()
    mount()
    await waitFor(() => expect(linkRows()).toHaveLength(3))
    await new Promise((r) => setTimeout(r, 700))
    expect(mockCommitBlocks).not.toHaveBeenCalled()
    expect(mockMarkChildLinksMigrated).not.toHaveBeenCalled()

    // The person's own edit — typing a character into the title — is what
    // finally stores the derived links, and stamps the migration in that
    // same save.
    fireEvent.change(await screen.findByDisplayValue('Workshop'), {
      target: { value: 'Workshopx' },
    })

    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const [, , writtenPageId, writtenBlocks] = mockCommitBlocks.mock.calls[0]
    expect(writtenPageId).toBe('page-1')
    expect(writtenBlocks).toEqual([
      { id: expect.any(String), type: 'page-link', pageId: 'child-creative' },
      { id: expect.any(String), type: 'page-link', pageId: 'child-personal' },
      { id: expect.any(String), type: 'page-link', pageId: 'child-professional' },
    ])
    expect(mockMarkChildLinksMigrated).toHaveBeenCalledTimes(1)
    expect(mockMarkChildLinksMigrated).toHaveBeenCalledWith(expect.anything(), 'page-1')
  })
})

// KAN-415 path test B: a page already carrying its three page-link rows (the
// upgrade already ran) — ⌘⌫ removes only the link, ⌘Z brings it back, and
// ⌥↑ reorders the parent's blocks, never the rail/pages tree.
const MIGRATED_LINKS: Block[] = [
  { id: 'b-creative', type: 'page-link', pageId: 'child-creative' },
  { id: 'b-personal', type: 'page-link', pageId: 'child-personal' },
  { id: 'b-professional', type: 'page-link', pageId: 'child-professional' },
]

const sessionUndoRecord = (targetPageId: string): ChangeLogRecord => ({
  id: 'undo-rec-1',
  userId: 'user-1',
  pondId: 'pond-1',
  status: 'accepted',
  action: 'edit',
  actor: 'user',
  targetPageId,
  targetBlockId: null,
  before: [],
  after: [],
  sourceThreadId: null,
  toolCallId: null,
  read: null,
  links: {},
  transitions: [],
  createdAt: '2026-10-17T09:00:00.000Z',
  statusAt: '2026-10-17T09:00:00.000Z',
})

async function confirmBlockDelete() {
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete this block?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
}

describe('removing, undoing and reordering a migrated page-link row (KAN-415 path test B)', () => {
  beforeEach(() => {
    PAGES['page-1'] = {
      id: 'page-1',
      title: 'Workshop',
      blocks: MIGRATED_LINKS,
      props: { childLinksMigrated: true },
    }
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  })

  afterEach(() => jest.restoreAllMocks())

  it('⌘⌫ on the selected row removes only the link — the child stays in the rows, no delete/move call fires', async () => {
    mount()
    await waitFor(() => expect(linkRows()).toHaveLength(3))

    const root = document.getElementById('block-b-professional')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true })
    await confirmBlockDelete()

    await waitFor(() => expect(linkRows()).toHaveLength(2))
    expect(linkRows().map(rowTitle)).toEqual(['Creative', 'personal'])
    expect(mockRows.some((r) => r.id === 'child-professional')).toBe(true)
    expect(mockDeletePage).not.toHaveBeenCalled()
    expect(mockMovePage).not.toHaveBeenCalled()

    // The structural delete writes at once through the page queue's
    // `commitBlocks` (KAN-368), not the debounced save. Await it so a pending
    // write cannot resolve inside a later test and corrupt that test's counts.
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1))
  })

  it('⌘Z brings the removed row back', async () => {
    mountWithShell()
    await waitFor(() => expect(linkRows()).toHaveLength(3))

    const root = document.getElementById('block-b-professional')!
    root.focus()
    fireEvent.keyDown(root, { key: 'Backspace', metaKey: true })
    await confirmBlockDelete()
    await waitFor(() => expect(linkRows()).toHaveLength(2))
    // The structural delete (KAN-368) must land before an external write — the
    // undo, invalidating `['page', 'page-1']` — is adopted.
    await waitFor(() => expect(mockCommitBlocks).toHaveBeenCalledTimes(1), { timeout: 3000 })

    // sessionUndo is stubbed directly (`undo-redraw-within-1s.test.tsx`'s pattern):
    // simulate its server-side restore by putting the pre-delete blocks back on
    // the mocked page, then letting `applyUndoOutcome`'s real invalidate refetch it.
    PAGES['page-1'] = { ...PAGES['page-1'], blocks: MIGRATED_LINKS }
    mockSessionUndo.mockResolvedValueOnce({
      outcome: 'done',
      records: [sessionUndoRecord('page-1')],
    })

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() => expect(mockSessionUndo).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(linkRows()).toHaveLength(3), { timeout: 3000 })
  })

  it('⌥↑ on the personal row moves it above Creative in block order — no movePage/rail reorder', async () => {
    mount()
    await waitFor(() => expect(linkRows()).toHaveLength(3))

    const root = document.getElementById('block-b-personal')!
    root.focus()
    fireEvent.keyDown(root, { key: 'ArrowUp', altKey: true })

    await waitFor(() =>
      expect(linkRows().map(rowTitle)).toEqual(['personal', 'Creative', 'professional'])
    )
    expect(mockMovePage).not.toHaveBeenCalled()
  })
})
