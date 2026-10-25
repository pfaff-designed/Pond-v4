/**
 * KAN-479 slice 1 — the path test: right-click a checklist on a real page →
 * the block menu's `move to…` → the ⌘K palette's block-pick mode → pick
 * `house` → ↵ → the toast → `open` lands on house with the checklist last →
 * `undo` puts it back on the source and takes it off house.
 *
 * Mirrors `undo-cross-page-path.test.tsx`'s real-`DocumentPanel`-plus-
 * `ShellCommands` harness (fake pages + change log, `@/lib/pages/commit` and
 * `sessionUndo` kept REAL — only the network boundary below them is faked):
 * this ticket's own write (`moveBlockToPage`) and its undo are the
 * behaviour under test, not a page-open stub.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'

import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const POND_ID = 'pond-1'
const USER_ID = 'user-1'
const mockSource = { id: 'verify', title: 'Verify' }
const mockTarget = { id: 'house', title: 'House' }
const CHECKLIST_ID = 'b-check'

interface FakePage {
  id: string
  parentId: string | null
  type: 'page'
  title: string
  blocks: Block[]
  props: Record<string, unknown>
  order: number
}

let pages: Record<string, FakePage>
let fakeChangeLog: ChangeLogRecord[]
let nextRecordId: number

function resetFakes() {
  pages = {
    [mockSource.id]: {
      id: mockSource.id,
      parentId: null,
      type: 'page',
      title: mockSource.title,
      blocks: [
        { id: CHECKLIST_ID, type: 'todo', marker: 'check', items: [{ id: 't1', label: 'Paint the fence', checked: false }] } as Block,
      ],
      props: {},
      order: 0,
    },
    [mockTarget.id]: {
      id: mockTarget.id,
      parentId: null,
      type: 'page',
      title: mockTarget.title,
      blocks: [],
      props: {},
      order: 1,
    },
  }
  fakeChangeLog = []
  nextRecordId = 1
}
resetFakes()

function mintRecordId(): string {
  return `rec-${nextRecordId++}`
}

function makeRecord(
  partial: Partial<ChangeLogRecord> & Pick<ChangeLogRecord, 'status' | 'action'>
): ChangeLogRecord {
  const now = new Date().toISOString()
  return {
    id: mintRecordId(),
    userId: USER_ID,
    pondId: POND_ID,
    actor: 'you',
    targetPageId: null,
    targetBlockId: null,
    before: null,
    after: null,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [{ status: partial.status, at: now, actor: partial.actor ?? 'you' }],
    createdAt: now,
    statusAt: now,
    ...partial,
  }
}

// ── next/navigation: a reactive mock, same as `undo-cross-page-path.test.tsx`
// — the toast's `open` goes through `router.push`, which feeds the same
// `mockNavigate` a direct push from the test does. ────────────────────────

const push = jest.fn((url: string) => mockNavigate(url))
const replace = jest.fn()
let mockNodeId = mockSource.id
const mockNavListeners = new Set<() => void>()

function mockNotify() {
  for (const listener of mockNavListeners) listener()
}

function mockNavigate(url: string) {
  const next = new URL(url, 'http://localhost').searchParams.get('nodeId')
  if (next !== null) mockNodeId = next
  mockNotify()
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (url: string) => push(url), replace: (url: string) => replace(url) }),
  useSearchParams: () => {
    const nodeId: string = React.useSyncExternalStore(
      (cb: () => void) => {
        mockNavListeners.add(cb)
        return () => mockNavListeners.delete(cb)
      },
      () => mockNodeId
    )
    return { get: (key: string) => (key === 'nodeId' ? nodeId : null) }
  },
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: POND_ID, name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => POND_ID,
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

// ── Supabase: auth.getUser() plus the one undo RPC this slice exercises ────

function postgrestError(detail: string): PostgrestError {
  return { message: detail, details: detail, hint: '', code: '' } as PostgrestError
}

function runUndoRpc(recordIds: string[]) {
  const made: ChangeLogRecord[] = []
  for (const id of recordIds) {
    const record = fakeChangeLog.find((r) => r.id === id)
    if (!record) return { error: postgrestError('not-found') }
    if (record.status !== 'accepted') return { error: postgrestError('already-undone') }

    if (record.targetPageId && pages[record.targetPageId]) {
      pages[record.targetPageId].blocks = Array.isArray(record.before) ? (record.before as Block[]) : []
    }

    const step = makeRecord({
      status: 'accepted',
      action: 'undo',
      before: record.after,
      after: record.before,
      targetPageId: record.targetPageId,
      links: { undoOf: id },
    })
    fakeChangeLog.push(step)
    made.push(step)
    record.status = 'undone'
  }
  return { made }
}

function toRow(r: ChangeLogRecord) {
  return {
    id: r.id,
    user_id: r.userId,
    pond_id: r.pondId,
    status: r.status,
    action: r.action,
    actor: r.actor,
    target_page_id: r.targetPageId,
    target_block_id: r.targetBlockId,
    before: r.before,
    after: r.after,
    source_thread_id: r.sourceThreadId,
    tool_call_id: r.toolCallId,
    read: r.read,
    links: r.links,
    transitions: r.transitions,
    created_at: r.createdAt,
    status_at: r.statusAt,
  }
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID, email: 'test@example.com' } } }),
    },
    rpc: jest.fn(async (fn: string, params: { p_record_ids: string[] }) => {
      if (fn === 'undo_change_log_record') {
        const result = runUndoRpc(params.p_record_ids)
        if ('error' in result) return { data: null, error: result.error }
        return { data: result.made.map(toRow), error: null }
      }
      return { data: null, error: postgrestError('not-found') }
    }),
  }),
}))

// ── Pages: getPage/listPages/saveBlocks backed by `pages` ──────────────────

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async (_supabase: unknown, id: string) => (pages[id] ? { ...pages[id] } : null)),
  listPages: jest.fn(async () => Object.values(pages).map((p) => ({ ...p }))),
  updateTitle: jest.fn(async (_supabase: unknown, id: string, title: string) => {
    if (pages[id]) pages[id].title = title
  }),
  saveBlocks: jest.fn(async (_supabase: unknown, id: string, blocks: Block[]) => {
    if (pages[id]) pages[id].blocks = blocks
  }),
  setProperty: jest.fn().mockResolvedValue(undefined),
  saveProps: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockImplementation(async () => [
    { id: mockSource.id, parent_id: null, type: 'page', title: mockSource.title, order: 0, updated_at: '' },
    { id: mockTarget.id, parent_id: null, type: 'page', title: mockTarget.title, order: 1, updated_at: '' },
  ]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
}))

jest.mock('@/lib/pages/title-focus', () => ({
  requestTitleFocus: jest.fn(),
  consumeTitleFocus: () => false,
}))

jest.mock('@/lib/pages/source-databases', () => ({
  ...jest.requireActual('@/lib/pages/source-databases'),
  fetchRecordCounts: jest.fn().mockResolvedValue(new Map()),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

// ── Change log: store's real functions, only the network boundary faked. ──

jest.mock('@/lib/change-log/store', () => {
  const actual = jest.requireActual('@/lib/change-log/store')
  return {
    ...actual,
    getRecord: jest.fn(async (_supabase: unknown, id: string) => {
      const record = fakeChangeLog.find((r) => r.id === id)
      return record ? { ...record } : null
    }),
    markOutdated: jest.fn().mockResolvedValue([]),
    appendOwnEdit: jest.fn(async (_supabase: unknown, input: Partial<ChangeLogRecord>) => {
      const record = makeRecord({ ...input, status: 'accepted', action: input.action ?? 'edit', actor: 'you' })
      fakeChangeLog.push(record)
      return record
    }),
    listRecords: jest.fn().mockResolvedValue([]),
    countWaiting: jest.fn().mockResolvedValue(0),
  }
})

jest.mock('@/lib/change-log/revert', () => ({
  acceptRevert: jest.fn(),
  proposeRevert: jest.fn(),
}))

global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)

// ── The harness ────────────────────────────────────────────────────────────

function renderPath() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <ShellCommands />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return queryClient
}

beforeEach(() => {
  jest.clearAllMocks()
  resetFakes()
  sessionUndo.clear()
  mockNodeId = mockSource.id
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('KAN-479 — move to… across two pages, undo brings it back (path test)', () => {
  it('moves the checklist to house, toasts, opens it there, and undo restores both pages', async () => {
    renderPath()
    const user = userEvent.setup()

    // Step 1-2: the checklist is on the source page; right-click it opens the
    // block menu. (The item's label renders as a text field's value, not a
    // text node — `blockFrame`'s own `TodoView` makes it editable.)
    await screen.findByDisplayValue('Paint the fence')
    fireEvent.contextMenu(document.getElementById(`block-${CHECKLIST_ID}`)!)
    const menu = await screen.findByRole('menu', { name: /block menu/i })
    const group = within(menu).getByRole('group', { name: 'block' })

    // Step 3: `move to…` opens the palette in block-pick mode; `house` is
    // the only candidate (the source page is never offered).
    await user.click(within(group).getByRole('menuitem', { name: 'move to…' }))
    const input = await screen.findByRole('combobox', { name: 'command palette' })
    expect(screen.queryByRole('option', { name: new RegExp(mockSource.title) })).toBeNull()
    await user.type(input, 'House')
    await screen.findByRole('option', { name: new RegExp(mockTarget.title) })
    await user.keyboard('{Enter}')

    // Step 4: the checklist is gone from the source, and the toast names the move.
    await waitFor(() => expect(screen.queryByDisplayValue('Paint the fence')).not.toBeInTheDocument())
    await screen.findByText('moved 1 block to House ·')
    expect(pages[mockSource.id].blocks).toHaveLength(0)
    expect(pages[mockTarget.id].blocks).toHaveLength(1)

    // Step 5: `open` navigates to house, whose last (only) block is the checklist.
    await user.click(screen.getByRole('button', { name: 'open' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining('nodeId=house')))
    await screen.findByDisplayValue('Paint the fence')

    // Step 6: `undo` — the move's two records are undone as one step, so the
    // source gets the block back and house loses it again.
    await user.click(screen.getByRole('button', { name: 'undo' }))
    await waitFor(() => expect(pages[mockSource.id].blocks).toHaveLength(1))
    expect(pages[mockTarget.id].blocks).toHaveLength(0)

    // Navigating back to the source shows the checklist restored there, and
    // the toast is gone.
    expect(screen.queryByText('moved 1 block to House ·')).not.toBeInTheDocument()
    act(() => mockNavigate(`/workspace?nodeId=${mockSource.id}`))
    await screen.findByDisplayValue('Paint the fence')
  })
})
