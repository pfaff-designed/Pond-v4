/**
 * KAN-139 — the path test, PATH_STEPS 1–4 only: commit an own text edit on
 * page A, switch the open page to B, then ⌘Z with nothing focused opens A
 * first, the typed sentence is gone, and the notice names what happened.
 * Steps 5+ (redo, the change log, ⌘[, reload) are later items' path tests.
 *
 * Mirrors `undo-redraw-within-1s.test.tsx`'s real-`DocumentPanel`-plus-
 * `ShellCommands` harness, sharing one `QueryClient` — the same seam
 * `runUndoStep` invalidates through — but keeps `@/lib/pages/commit` REAL
 * (unlike that file, which mocks `commitBlocks` outright): this ticket's own
 * commits (`sessionUndo.remember` from the debounced own-edit save) are the
 * behaviour under test, so only the network boundary below them
 * (`saveBlocks`, `appendOwnEdit`, the undo RPC) is faked.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'

import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { ChangeLogPage } from '@/components/organisms/ChangeLogPage'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { workspaceUrl, WORKSPACE_PATH } from '@/lib/pages/nav'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

const POND_ID = 'pond-1'
const USER_ID = 'user-1'
const mockPageA = { id: 'page-a', title: 'A' }
const mockPageB = { id: 'page-b', title: 'B' }

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
    [mockPageA.id]: {
      id: mockPageA.id,
      parentId: null,
      type: 'page',
      title: mockPageA.title,
      blocks: [{ id: 'b1', type: 'text', content: 'original sentence' } as Block],
      props: {},
      order: 0,
    },
    [mockPageB.id]: {
      id: mockPageB.id,
      parentId: null,
      type: 'page',
      title: mockPageB.title,
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

// ── next/navigation: a small reactive mock so a push from inside `ShellCommands`
// (the undo step opening page A) and a push driven directly by the test (the
// "open B from the rail" step) both move the same `nodeId` every reader sees.
// Since KAN-449, on `/workspace` the undo step's own open goes through
// `openWorkspaceUrl` → `window.history.pushState`, not `router.push` — so the
// `pushState` spy (set up in `beforeEach`, below) feeds the same `mockNavigate`
// `push` does, and `push`/`replace` stay as the never-called proof. ─────────

const push = jest.fn((url: string) => mockNavigate(url))
const replace = jest.fn()
let mockNodeId = mockPageA.id
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

// Mirrors migration 0021's `p_redo = true` branch: the ORIGINAL record (now
// `undone`) gains a `redo` record and stays `undone` itself — only the undo
// record that took it back flips to `undone`. See `0021_undo_redo.sql`'s own
// header comment for the full table.
function runRedoRpc(recordIds: string[]) {
  const made: ChangeLogRecord[] = []
  for (const id of recordIds) {
    const record = fakeChangeLog.find((r) => r.id === id)
    if (!record) return { error: postgrestError('not-found') }
    if (record.status !== 'undone') return { error: postgrestError('not-undone') }
    const undoRecord = fakeChangeLog.find(
      (r) => r.action === 'undo' && r.status === 'accepted' && r.links.undoOf === id
    )
    if (!undoRecord) return { error: postgrestError('not-undone') }

    if (record.targetPageId && pages[record.targetPageId]) {
      pages[record.targetPageId].blocks = Array.isArray(record.after) ? (record.after as Block[]) : []
    }

    const step = makeRecord({
      status: 'accepted',
      action: 'redo',
      before: record.before,
      after: record.after,
      targetPageId: record.targetPageId,
      links: { redoOf: id },
    })
    fakeChangeLog.push(step)
    made.push(step)
    undoRecord.status = 'undone'
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
      if (fn === 'redo_change_log_record') {
        const result = runRedoRpc(params.p_record_ids)
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
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockImplementation(async () => [
    { id: mockPageA.id, parent_id: null, type: 'page', title: mockPageA.title, order: 0, updated_at: '' },
    { id: mockPageB.id, parent_id: null, type: 'page', title: mockPageB.title, order: 1, updated_at: '' },
  ]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/home', () => ({
  HOME_TYPE: 'home',
  getOrCreateHomePage: jest.fn().mockResolvedValue({ id: 'home-1', title: 'Life', blocks: [] }),
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
    // ChangeLogPage's "all" view, for the path test's step 6 — filtered the
    // same way `listRecords` itself narrows (status/action/targetPageId).
    listRecords: jest.fn(
      async (
        _supabase: unknown,
        opts: {
          status?: ChangeLogRecord['status'] | ChangeLogRecord['status'][]
          action?: ChangeLogRecord['action'] | ChangeLogRecord['action'][]
          targetPageId?: string
        }
      ) => {
        let list = fakeChangeLog.slice()
        if (opts.targetPageId !== undefined) {
          list = list.filter((r) => r.targetPageId === opts.targetPageId)
        }
        if (opts.status !== undefined) {
          const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
          list = list.filter((r) => statuses.includes(r.status))
        }
        if (opts.action !== undefined) {
          const actions = Array.isArray(opts.action) ? opts.action : [opts.action]
          list = list.filter((r) => actions.includes(r.action))
        }
        return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((r) => ({ ...r }))
      }
    ),
    countWaiting: jest.fn().mockResolvedValue(0),
  }
})

jest.mock('@/lib/change-log/revert', () => ({
  acceptRevert: jest.fn(),
  proposeRevert: jest.fn(),
}))

global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)

// ── The harness ──────────────────────────────────────────────────────────────

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

let pushState: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  resetFakes()
  sessionUndo.clear()
  mockNodeId = mockPageA.id
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
  pushState = jest.spyOn(window.history, 'pushState').mockImplementation((_state, _title, url) => {
    if (typeof url === 'string') mockNavigate(url)
  })
})

afterEach(() => jest.restoreAllMocks())

describe('KAN-139 — ⌘Z steps back across pages (PATH_STEPS 1–4)', () => {
  it('opens A first, the typed sentence is gone, and the notice names it', async () => {
    renderPath()

    // Step 1: page A is open; type a new sentence and let the pause commit.
    const field = await findTextBlock()
    expect(field.textContent).toBe('original sentence')
    writeInTextBlock(field, 'edited content')
    await waitFor(
      () => expect(pages[mockPageA.id].blocks[0]).toMatchObject({ content: 'edited content' }),
      { timeout: 2000 }
    )
    await waitFor(() => expect(fakeChangeLog).toHaveLength(1), { timeout: 2000 })

    // Step 2: open page B (as the rail would, via the same workspaceUrl push).
    act(() => mockNavigate(workspaceUrl({ id: mockPageB.id, type: 'page', title: mockPageB.title })))
    await waitFor(() => expect(screen.queryByText('edited content')).not.toBeInTheDocument())

    // Step 3–4: ⌘Z with nothing focused — Pond opens A first, the sentence is
    // gone, and the notice names what happened.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining('nodeId=page-a')))
    await waitFor(() => expect(screen.queryByText('edited content')).not.toBeInTheDocument())

    expect(screen.getByText('undo · ⌘Z')).toBeInTheDocument()
    expect(screen.getByText('opened A')).toBeInTheDocument()
    expect(screen.getByText(/you were on B\.$/)).toBeInTheDocument()
    expect(screen.getByText('redo ⇧⌘Z')).toBeInTheDocument()
    expect(screen.getByText('back to B ⌘[')).toBeInTheDocument()
  })

  it('⇧⌘Z brings the sentence back as a redo, and the log holds all three as records of their own', async () => {
    const queryClient = renderPath()

    // PATH_STEPS 1–4, same setup as the test above.
    const field = await findTextBlock()
    writeInTextBlock(field, 'edited content')
    await waitFor(
      () => expect(pages[mockPageA.id].blocks[0]).toMatchObject({ content: 'edited content' }),
      { timeout: 2000 }
    )
    await waitFor(() => expect(fakeChangeLog).toHaveLength(1), { timeout: 2000 })

    act(() => mockNavigate(workspaceUrl({ id: mockPageB.id, type: 'page', title: mockPageB.title })))
    await waitFor(() => expect(screen.queryByText('edited content')).not.toBeInTheDocument())

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining('nodeId=page-a')))
    await screen.findByText('original sentence')
    await screen.findByText('undo · ⌘Z')

    // Step 5: ⇧⌘Z — the sentence comes back, and the notice reads redo. The
    // redo's own target is the page already open (A), so no navigation and no
    // "opened …" head clause this time.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await screen.findByText('edited content')
    expect(screen.getByText('redo · ⇧⌘Z')).toBeInTheDocument()
    expect(screen.queryByText(/^opened /)).not.toBeInTheDocument()
    // The redo's own target is the page already open (A) — no navigation, so
    // no "you were on"/"back to" clauses (they'd otherwise name the page
    // you're already on, while ⌘[ / browser back goes somewhere else).
    expect(screen.queryByText(/you were on/)).not.toBeInTheDocument()
    expect(screen.getByText('undo ⌘Z')).toBeInTheDocument()
    expect(screen.queryByText(/^back to /)).not.toBeInTheDocument()

    // Step 6: the change log holds the undo and the redo as records of their
    // own, and the original edit — the one the undo took back — still reads
    // undone (it is never put back to `accepted`; only the standing undo is).
    render(
      <QueryClientProvider client={queryClient}>
        <ChangeLogPage />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getAllByTestId(/^change-log-status-/)).toHaveLength(3))
    // The original edit (rec-1) stays `undone` — statuses only move forward, so
    // the redo never resets it. What changes on redo is the standing undo
    // (rec-2, now superseded) going `undone` too, while the redo itself
    // (rec-3) stands `accepted` — 0021's own header comment: "X stays undone;
    // R stands".
    expect(screen.getByTestId('change-log-status-rec-1')).toHaveTextContent('undone')
    expect(screen.getByTestId('change-log-status-rec-2')).toHaveTextContent('undone')
    expect(screen.getByTestId('change-log-status-rec-3')).toHaveTextContent('accepted')
  })

  it('PATH_STEPS 7 & 9: page navigation only ever pushes (⌘[ is the browser\'s own back), and a reloaded session leaves ⌘Z a no-op', async () => {
    // On `/workspace`, the undo step's own "open A" move goes through
    // `openWorkspaceUrl` → the shallow `pushState` (KAN-449), not `router.push` —
    // but it is still a push, onto the same history stack the browser's own
    // back (⌘[ / Alt+Left) walks, and never a `replace`.
    window.history.replaceState(null, '', WORKSPACE_PATH)
    renderPath()

    const field = await findTextBlock()
    writeInTextBlock(field, 'edited content')
    await waitFor(
      () => expect(pages[mockPageA.id].blocks[0]).toMatchObject({ content: 'edited content' }),
      { timeout: 2000 }
    )
    await waitFor(() => expect(fakeChangeLog).toHaveLength(1), { timeout: 2000 })

    act(() => mockNavigate(workspaceUrl({ id: mockPageB.id, type: 'page', title: mockPageB.title })))
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() =>
      expect(pushState).toHaveBeenCalledWith(null, '', expect.stringContaining('nodeId=page-a'))
    )
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()

    // Step 9: a fresh session (simulated reload) has no undo stack to spend —
    // `sessionUndo.undo` resolves `{ outcome: 'empty' }` before it ever reaches
    // the RPC, so ⌘Z outside a text field with nothing remembered yet does
    // nothing: no new change-log record, no notice.
    const changeLogLengthBeforeReload = fakeChangeLog.length
    sessionUndo.clear()
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fakeChangeLog).toHaveLength(changeLogLengthBeforeReload)
    expect(screen.queryByText('undo · ⌘Z')).not.toBeInTheDocument()
    expect(screen.queryByText(/^opened /)).not.toBeInTheDocument()
  })
})
