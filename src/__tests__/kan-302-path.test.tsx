/**
 * KAN-302 — the path test harness. Mounts the REAL `AITerminal`, `DocumentPanel`
 * and `ShellCommands` together under one `QueryClient` + `DeletionUndoProvider`,
 * so a later item can drive PATH_STEPS end to end with `userEvent` against the
 * actual composer + page surface, not components in isolation.
 *
 * The two existing KAN-302 tests each mount only one half, at opposite mock
 * granularity:
 *   - `propose-changes-flow-ui.test.tsx` mounts `AITerminal` alone, with
 *     `@/lib/change-log/store` and `@/lib/change-log/session-undo` mocked at the
 *     module boundary.
 *   - `undo-redraw-within-1s.test.tsx` mounts `DocumentPanel` + `ShellCommands`
 *     alone, with `sessionUndo.undo`/`redo` stubbed directly rather than driven
 *     through the real reducer.
 *
 * This harness mocks only the network/Supabase boundary — `@/lib/pages/client`'s
 * `getPage`/`updateTitle`, `@/lib/pages/commit`'s `commitBlocks`, and
 * `@/lib/change-log/store`'s raw Supabase-backed functions — behind ONE shared
 * in-memory fake (one page's blocks+title, one change-log array). The real
 * `@/lib/change-log/session-undo` (`sessionUndo`) and `@/lib/conversation/proposals`
 * (`reconcileCardStatus`) stay wired in, unmocked: they are the behavior under
 * test. `sessionUndo`'s real undo/redo reach `@/lib/change-log/undo`'s
 * `undoStep`/`redoStep`, which call `supabase.rpc('undo_change_log_record' |
 * 'redo_change_log_record', …)` directly (bypassing `store.ts`) — so the fake
 * Supabase client returned by the mocked `@/lib/supabase/client` implements
 * those two RPCs against the shared change-log array, mirroring migration
 * 0021's `private.change_log_step` for the one case this ticket's path needs:
 * a single `edit`/`create` record whose before/after are a page's `Block[]`.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'

import { AITerminal } from '@/components/organisms/AITerminal'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'

// ── Shared fakes: one page, one change log ──────────────────────────────────

const PAGE_ID = 'page-1'
const POND_ID = 'pond-1'
const USER_ID = 'user-1'

interface FakePage {
  id: string
  parentId: string | null
  type: 'page'
  title: string
  blocks: Block[]
  props: Record<string, unknown>
  order: number
}

let fakePage: FakePage
let fakeChangeLog: ChangeLogRecord[]
let nextRecordId: number

function resetFakes() {
  fakePage = {
    id: PAGE_ID,
    parentId: null,
    type: 'page',
    title: 'Untitled',
    blocks: [],
    props: {},
    order: 0,
  }
  fakeChangeLog = []
  nextRecordId = 1
}
resetFakes()

function mintRecordId(): string {
  return `rec-${nextRecordId++}`
}

function makeRecord(partial: Partial<ChangeLogRecord> & Pick<ChangeLogRecord, 'status' | 'action'>): ChangeLogRecord {
  const now = new Date().toISOString()
  return {
    id: mintRecordId(),
    userId: USER_ID,
    pondId: POND_ID,
    actor: 'you',
    targetPageId: fakePage.id,
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

// ── next/navigation, pond context ───────────────────────────────────────────

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  // The open page: every PATH_STEPS frame works against this one id, so
  // AITerminal's `currentPage` query (keyed off ?nodeId=) and DocumentPanel's
  // page query share the same cache entry.
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? PAGE_ID : null) }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: POND_ID, name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => POND_ID,
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

// ── Supabase: only auth.getUser() and the two undo/redo RPCs ───────────────

function postgrestError(detail: string): PostgrestError {
  return { message: detail, details: detail, hint: '', code: '' } as PostgrestError
}

/**
 * The one hop this harness's PATH_STEPS need: undo an accepted `edit`/`create`
 * record (writes `before` back, logs an `undo`), or redo the standing undo of
 * one (writes `after` back, logs a `redo`) — mirroring migration 0021's
 * `private.change_log_step` for block-shaped records on `fakePage` only.
 */
function runChangeLogStep(recordIds: string[], redo: boolean) {
  const made: ChangeLogRecord[] = []
  for (const id of recordIds) {
    const record = fakeChangeLog.find((r) => r.id === id)
    if (!record) return { error: postgrestError('not-found') }
    if (!redo && record.status !== 'accepted') return { error: postgrestError('already-undone') }
    if (redo && record.status !== 'undone') return { error: postgrestError('not-undone') }

    let from: unknown
    let to: unknown
    let standingUndo: ChangeLogRecord | undefined
    if (redo) {
      standingUndo = fakeChangeLog.find(
        (r) => r.links.undoOf === id && r.action === 'undo' && r.status === 'accepted'
      )
      if (!standingUndo) return { error: postgrestError('not-undone') }
      from = record.before
      to = record.after
    } else {
      from = record.after
      to = record.before
    }

    if (record.targetPageId === fakePage.id) {
      fakePage.blocks = Array.isArray(to) ? (to as Block[]) : []
    }

    const step = makeRecord({
      status: 'accepted',
      action: redo ? 'redo' : 'undo',
      before: from,
      after: to,
      targetPageId: record.targetPageId,
      links: redo ? { redoOf: id } : { undoOf: id },
    })
    fakeChangeLog.push(step)
    made.push(step)

    if (redo && standingUndo) {
      standingUndo.status = 'undone'
    } else if (!redo) {
      record.status = 'undone'
    }
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
      if (fn === 'undo_change_log_record' || fn === 'redo_change_log_record') {
        const result = runChangeLogStep(params.p_record_ids, fn === 'redo_change_log_record')
        if ('error' in result) return { data: null, error: result.error }
        return { data: result.made.map(toRow), error: null }
      }
      return { data: null, error: postgrestError('not-found') }
    }),
  }),
}))

// ── Pages: getPage/updateTitle backed by fakePage ───────────────────────────

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async (_supabase: unknown, id: string) => (id === fakePage.id ? { ...fakePage } : null)),
  listPages: jest.fn(async () => [{ ...fakePage }]),
  updateTitle: jest.fn(async (_supabase: unknown, id: string, title: string) => {
    if (id === fakePage.id) fakePage.title = title
  }),
  setProperty: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn(
    async (
      _supabase: unknown,
      _queryClient: unknown,
      pageId: string,
      blocks: Block[],
      opts?: { ownEdit?: true; before?: Block[]; pondId?: string | null }
    ) => {
      if (pageId !== fakePage.id) return
      fakePage.blocks = blocks
      if (opts?.ownEdit) {
        fakeChangeLog.push(
          makeRecord({
            status: 'accepted',
            action: 'edit',
            before: opts.before ?? null,
            after: blocks,
            targetPageId: pageId,
          })
        )
      }
    }
  ),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
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

// ── Change log: store's raw Supabase-backed functions, backed by fakeChangeLog.
// Pure helpers (`mapChangeLogRow`, `RecordChangedError`, …) stay real. ────────

jest.mock('@/lib/change-log/store', () => {
  const actual = jest.requireActual('@/lib/change-log/store')
  const { assertTransition } = jest.requireActual('@/lib/change-log/status')
  return {
    ...actual,
    listRecordsByToolCalls: jest.fn(async (_supabase: unknown, opts: { toolCallIds: readonly string[] }) =>
      fakeChangeLog.filter((r) => r.toolCallId !== null && opts.toolCallIds.includes(r.toolCallId))
    ),
    getRecordByToolCall: jest.fn(async (_supabase: unknown, opts: { toolCallId: string }) =>
      fakeChangeLog.find((r) => r.toolCallId === opts.toolCallId) ?? null
    ),
    resolveChainStatus: jest.fn(
      async (_supabase: unknown, opts: { recordId: string; status: string }) => {
        let current = opts.recordId
        let status = opts.status
        for (let depth = 0; depth < 1000; depth++) {
          const redo = fakeChangeLog.find((r) => r.links.redoOf === current)
          const undo = fakeChangeLog.find((r) => r.links.undoOf === current)
          const next = redo ?? undo
          if (!next) break
          current = next.id
          status = redo ? 'accepted' : 'undone'
        }
        return status
      }
    ),
    advanceStatus: jest.fn(async (_supabase: unknown, id: string, to: ChangeLogStatus, actor = 'you') => {
      const record = fakeChangeLog.find((r) => r.id === id)
      if (!record) throw new Error(`change log: record ${id} not found`)
      assertTransition(record.status, to)
      record.status = to
      record.statusAt = new Date().toISOString()
      record.transitions = [...record.transitions, { status: to, at: record.statusAt, actor }]
      return { ...record }
    }),
    acceptRecord: jest.fn(async (_supabase: unknown, id: string, blocks: unknown, actor = 'you') => {
      const record = fakeChangeLog.find((r) => r.id === id)
      if (!record) throw new Error(`change log: accept of record ${id} returned no record`)
      record.status = 'accepted'
      record.statusAt = new Date().toISOString()
      record.transitions = [...record.transitions, { status: 'accepted', at: record.statusAt, actor }]
      if (record.targetPageId === fakePage.id) fakePage.blocks = blocks as Block[]
      return { ...record }
    }),
    markOutdated: jest.fn(
      async (
        _supabase: unknown,
        opts: { targetPageId: string; exceptId?: string; actions?: string[] }
      ) => {
        const stale = fakeChangeLog.filter(
          (r) =>
            r.status === 'proposed' &&
            r.targetPageId === opts.targetPageId &&
            r.id !== opts.exceptId &&
            (!opts.actions || opts.actions.includes(r.action))
        )
        for (const r of stale) {
          r.status = 'outdated'
          r.statusAt = new Date().toISOString()
          r.transitions = [...r.transitions, { status: 'outdated', at: r.statusAt, actor: 'pond' }]
        }
        return stale
      }
    ),
    listRecords: jest.fn(
      async (
        _supabase: unknown,
        opts: { targetPageId?: string; status?: string | string[]; action?: string | string[] }
      ) => {
        let rows = [...fakeChangeLog]
        if (opts.targetPageId) rows = rows.filter((r) => r.targetPageId === opts.targetPageId)
        if (opts.status) {
          const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
          rows = rows.filter((r) => statuses.includes(r.status))
        }
        if (opts.action) {
          const actions = Array.isArray(opts.action) ? opts.action : [opts.action]
          rows = rows.filter((r) => actions.includes(r.action))
        }
        return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }
    ),
    appendOwnEdit: jest.fn(async (_supabase: unknown, input: Partial<ChangeLogRecord>) => {
      const record = makeRecord({ ...input, status: 'accepted', action: input.action ?? 'edit', actor: 'you' })
      fakeChangeLog.push(record)
      return record
    }),
  }
})

jest.mock('@/lib/change-log/revert', () => ({
  acceptRevert: jest.fn(),
  proposeRevert: jest.fn(),
}))

// ── The rest of AITerminal's boundary (conversation, notify, chat stream) ──

jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

let mockResolutions: Record<string, unknown> = { changes: {}, creates: {}, skipped: {} }
jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({ id: 'conv-1', messages: [], resolutions: mockResolutions })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

const mockSendMessage = jest.fn()
const mockRegenerate = jest.fn()
const mockSetMessages = jest.fn()
const mockAddToolOutput = jest.fn()
let mockMessages: Array<{
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}> = []
let mockStatus = 'ready'
let mockError: Error | undefined
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: mockSendMessage,
    regenerate: mockRegenerate,
    addToolOutput: mockAddToolOutput,
    setMessages: mockSetMessages,
    status: mockStatus,
    error: mockError,
  })),
}))

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ extractions: [] }) } as Response)

// ── The harness ──────────────────────────────────────────────────────────────

function renderPath() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <DeletionUndoProvider>
        <DocumentPanel />
        <ShellCommands />
        <AITerminal />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
  return { ...result, queryClient }
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

beforeEach(() => {
  jest.clearAllMocks()
  resetFakes()
  mockResolutions = { changes: {}, creates: {}, skipped: {} }
  mockMessages = []
  mockStatus = 'ready'
  mockError = undefined
})

describe('KAN-302 path test harness', () => {
  it('renders the seeded page and a usable composer', async () => {
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello world' }]

    renderPath()
    await ready()

    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })
})
