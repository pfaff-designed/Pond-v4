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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'

import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { applyProposedChanges } from '@/lib/pages/edits'
import { createDeterministicMintId } from '@/lib/change-log/mint-id'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { pagesKey } from '@/lib/pages/keys'
import { updateTitle } from '@/lib/pages/client'
import { changeLogKey } from '@/lib/change-log/keys'

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

function makeRecord(
  partial: Partial<ChangeLogRecord> & Pick<ChangeLogRecord, 'status' | 'action'>
): ChangeLogRecord {
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
  // page query share the same cache entry. `nodeName` is the breadcrumb's own
  // URL param (not the page query) — it is what `resolveStampTarget` uses to
  // name an UNSTAMPED same-page batch's target at the moment it streams in, so
  // it must read the page's title live, same as the real breadcrumb would.
  useSearchParams: () => ({
    get: (key: string) => (key === 'nodeId' ? PAGE_ID : key === 'nodeName' ? fakePage.title : null),
  }),
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
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: USER_ID, email: 'test@example.com' } } }),
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
  getPage: jest.fn(async (_supabase: unknown, id: string) =>
    id === fakePage.id ? { ...fakePage } : null
  ),
  listPages: jest.fn(async () => [{ ...fakePage }]),
  updateTitle: jest.fn(async (_supabase: unknown, id: string, title: string) => {
    if (id === fakePage.id) fakePage.title = title
  }),
  setProperty: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

const mockCommitBlocks = jest.fn(
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
)
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: (...args: unknown[]) =>
    mockCommitBlocks(...(args as Parameters<typeof mockCommitBlocks>)),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
  // KAN-495: the page-write queue's writer. Not a path this file's tests
  // drive (no typed/structural edit here goes through BlockCanvas/the
  // debounce — only AITerminal propose/accept and ⌘Z/⇧⌘Z), but
  // `use-page-draft.ts`'s seeding effect calls `createPageWriter` on every
  // mount to build the queue, so the mock still needs the export. Forwards
  // to the same `commitBlocks` mock above, matching the real writer's shape.
  createPageWriter:
    (supabase: unknown, queryClient: unknown, pageId: string, pondId: string | null) =>
    async (op: {
      kind: 'typed' | 'structural'
      before: { title: string; blocks: Block[] }
      after: { title: string; blocks: Block[] }
    }) => {
      if (op.kind === 'typed') await updateTitle(supabase as never, pageId, op.after.title)
      await mockCommitBlocks(supabase, queryClient, pageId, op.after.blocks, {
        ownEdit: true,
        before: op.before.blocks,
        pondId,
      })
    },
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
    listRecordsByToolCalls: jest.fn(
      async (_supabase: unknown, opts: { toolCallIds: readonly string[] }) =>
        fakeChangeLog.filter(
          (r) => r.toolCallId !== null && opts.toolCallIds.includes(r.toolCallId)
        )
    ),
    getRecordByToolCall: jest.fn(
      async (_supabase: unknown, opts: { toolCallId: string }) =>
        fakeChangeLog.find((r) => r.toolCallId === opts.toolCallId) ?? null
    ),
    // KAN-302: batched over every record a reconcile run is watching, walking
    // the SAME `fakeChangeLog` links the single-chain predecessor walked.
    resolveChainStatuses: jest.fn(
      async (
        _supabase: unknown,
        opts: { records: Array<{ id: string; status: ChangeLogStatus }> }
      ) => {
        const tips = new Map<string, ChangeLogStatus>()
        for (const record of opts.records) {
          let current = record.id
          let status = record.status
          for (let depth = 0; depth < 1000; depth++) {
            const redo = fakeChangeLog.find((r) => r.links.redoOf === current)
            const undo = redo ? undefined : fakeChangeLog.find((r) => r.links.undoOf === current)
            const next = redo ?? undo
            if (!next) break
            current = next.id
            const implied = redo ? 'accepted' : 'undone'
            status = next.status === 'accepted' ? implied : next.status
          }
          tips.set(record.id, status)
        }
        return tips
      }
    ),
    advanceStatus: jest.fn(
      async (_supabase: unknown, id: string, to: ChangeLogStatus, actor = 'you') => {
        const record = fakeChangeLog.find((r) => r.id === id)
        if (!record) throw new Error(`change log: record ${id} not found`)
        assertTransition(record.status, to)
        record.status = to
        record.statusAt = new Date().toISOString()
        record.transitions = [...record.transitions, { status: to, at: record.statusAt, actor }]
        return { ...record }
      }
    ),
    acceptRecord: jest.fn(
      async (_supabase: unknown, id: string, blocks: unknown, actor = 'you') => {
        const record = fakeChangeLog.find((r) => r.id === id)
        if (!record) throw new Error(`change log: accept of record ${id} returned no record`)
        record.status = 'accepted'
        record.statusAt = new Date().toISOString()
        record.transitions = [
          ...record.transitions,
          { status: 'accepted', at: record.statusAt, actor },
        ]
        if (record.targetPageId === fakePage.id) fakePage.blocks = blocks as Block[]
        return { ...record }
      }
    ),
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
      const record = makeRecord({
        ...input,
        status: 'accepted',
        action: input.action ?? 'edit',
        actor: 'you',
      })
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
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: mockResolutions,
  })),
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

global.fetch = jest
  .fn()
  .mockResolvedValue({ ok: true, json: async () => ({ extractions: [] }) } as Response)

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
  openComposerIfClosed()
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

/** Pond proposes "change world to moon" against the one seeded block, `b0`. */
function editBatch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'Hello moon' } }],
    },
  }
}

/**
 * Seeds a `proposed` change-log record for `editBatch`'s edit, with `after`
 * computed the same way `writeToTarget` (accept.ts) computes it — real
 * `applyProposedChanges` against the page's CURRENT blocks — so the accept's
 * own byte-identical check (accept.ts's `jsonEqual` gate) passes and `recordId`
 * comes back non-null. Only then does `sessionUndo.remember` fire and ⌘Z/⇧⌘Z
 * have a real record to walk.
 */
function seedEditRecord(toolCallId: string): ChangeLogRecord {
  const changes = editBatch(toolCallId).input.changes as ModuleChange[]
  const before = fakePage.blocks.map((b) => ({ ...b }))
  // `edits.ts` preserves a block's own `width` unconditionally, including
  // `undefined` (KAN-43) — a real jsonb-backed record strips that key on
  // write, so round-trip through JSON here too, or accept.ts's byte-identical
  // `jsonEqual` gate (which compares against the SAME round-tripped shape)
  // never matches and `recordId` comes back null.
  const after = JSON.parse(
    JSON.stringify(
      applyProposedChanges(fakePage.blocks, changes, createDeterministicMintId(toolCallId), {
        batch: changes,
      }).blocks
    )
  )
  const record = makeRecord({
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    before,
    after,
    toolCallId,
    targetPageId: fakePage.id,
  })
  fakeChangeLog.push(record)
  return record
}

/** Pond proposes adding one new text block — a create-diff batch. */
function createBatch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'create', data: { type: 'text', content: 'the new block' } }],
    },
  }
}

/** Same shape as `seedEditRecord`, for `createBatch`'s add. */
function seedCreateRecord(toolCallId: string): ChangeLogRecord {
  const changes = createBatch(toolCallId).input.changes as ModuleChange[]
  const before = fakePage.blocks.map((b) => ({ ...b }))
  const after = JSON.parse(
    JSON.stringify(
      applyProposedChanges(fakePage.blocks, changes, createDeterministicMintId(toolCallId), {
        batch: changes,
      }).blocks
    )
  )
  const record = makeRecord({
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    before,
    after,
    toolCallId,
    targetPageId: fakePage.id,
  })
  fakeChangeLog.push(record)
  return record
}

beforeEach(() => {
  jest.clearAllMocks()
  resetFakes()
  sessionUndo.clear()
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

  // Path test part 1a (PATH_STEPS bullet 1, "the record's before, never the
  // page's current text"): accept an edit, then simulate the person's own
  // further edit landing at the fake-server boundary — the accepted card's
  // "−" line must stay frozen on the record's `before`, not re-read the page.
  it('an accepted card freezes its "−" line past a later edit to the page (KAN-302 item 1)', async () => {
    const user = userEvent.setup()
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello world' }]
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [editBatch('pc1')] }]

    const { queryClient } = renderPath()
    await ready()

    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(within(card).getByText('Hello world')).toBeInTheDocument()
    expect(within(card).getByText('Hello moon')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))

    expect(within(card).getByText('Hello world')).toBeInTheDocument()
    expect(within(card).getByText('Hello moon')).toBeInTheDocument()

    // The person's own edit, simulated at the fake-server boundary — exactly
    // what `use-page-draft.ts`'s save path does: mutate the row, invalidate
    // the page query.
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello moon xyz' }]
    await queryClient.invalidateQueries({ queryKey: ['page', PAGE_ID] })
    await waitFor(() => expect(screen.getByText('Hello moon xyz')).toBeInTheDocument())

    expect(within(card).getByText('Hello world')).toBeInTheDocument()
    expect(within(card).queryByText('Hello moon xyz')).not.toBeInTheDocument()
  })

  // Path test part 1b (PATH_STEPS bullet 2, "header follows rename"): from an
  // accepted card, the person renames the page at the fake-server boundary —
  // the SAME card's header must follow the live title, not the name stamped
  // at proposal time.
  it("an accepted card's header follows a rename of its target page (KAN-302 item 2)", async () => {
    const user = userEvent.setup()
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello world' }]
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [editBatch('pc1')] }]

    const { queryClient } = renderPath()
    await ready()

    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(within(card).getByText(/— Untitled/)).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))

    // The person's own rename, simulated at the fake-server boundary — exactly
    // what the title input's save path does: mutate the row, invalidate the
    // page query AND the pages list the header's live title is read from.
    fakePage.title = 'Plans'
    await queryClient.invalidateQueries({ queryKey: ['page', PAGE_ID] })
    await queryClient.invalidateQueries({ queryKey: [...pagesKey(POND_ID), 'full'] })

    await waitFor(() => expect(within(card).getByText(/— Plans/)).toBeInTheDocument())
    expect(within(card).queryByText(/— Untitled/)).not.toBeInTheDocument()
  })

  // Path test part 2 (PATH_STEPS bullet 4, "card follows the chain's tip"): from
  // an accepted card, a real ⌘Z/⇧⌘Z — the `ShellCommands` chord, the real
  // `sessionUndo`, the real change-log fake's undo/redo RPCs — must drive the
  // card's status, never a mocked `resolveChainStatuses`.
  it('an accepted card reads "undone" after ⌘Z and "accepted" again after ⇧⌘Z (KAN-302 item 4)', async () => {
    const user = userEvent.setup()
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello world' }]
    seedEditRecord('pc1')
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [editBatch('pc1')] }]

    renderPath()
    await ready()

    const card = screen.getByRole('group', { name: /proposed edit/ })
    await user.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'undone'))
    expect(within(card).getByText('undone')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))
    expect(within(card).getByText('accepted')).toBeInTheDocument()

    platform.mockRestore()
  })

  // Path test part 3 (PATH_STEPS bullet 3, "Pond's next read is fresh"): a
  // title edit sitting in `use-page-draft.ts`'s 600ms save debounce, driven
  // through the REAL title input (not a hand-mutated `fakePage`) — sending a
  // composer message must flush that save and WAIT for it to resolve before
  // the chat transport is reached, per `AITerminal.tsx`'s `flushPendingPageSave`
  // await (~line 1373). `updateTitle` is held open on a gate so the test can
  // prove the ORDER directly: `sendMessage` must not fire until the save has
  // resolved, not just "eventually both happen".
  it('sending a composer message waits out a pending page save before the chat request (KAN-302 item 3)', async () => {
    const user = userEvent.setup()
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello world' }]
    mockMessages = []

    const order: string[] = []
    let releaseUpdateTitle: () => void = () => {}
    const updateTitleGate = new Promise<void>((resolve) => {
      releaseUpdateTitle = resolve
    })
    ;(updateTitle as jest.Mock).mockImplementationOnce(
      async (_supabase: unknown, id: string, title: string) => {
        order.push('updateTitle:called')
        await updateTitleGate
        if (id === fakePage.id) fakePage.title = title
        order.push('updateTitle:resolved')
      }
    )
    mockSendMessage.mockImplementationOnce(() => {
      order.push('sendMessage:called')
    })

    renderPath()
    await ready()

    // The person's own rename — the real title input's own `onChange` — leaves
    // a save sitting in the debounce (never fired; we send well under 600ms).
    await user.type(screen.getByRole('textbox', { name: 'Page title' }), ' v2')

    await user.type(screen.getByRole('textbox', { name: 'Message Pond' }), 'change xyz to plum')
    await user.keyboard('{Enter}')

    // The composer's send path has already flushed the pending save (it is
    // awaiting the held gate) — the chat transport must NOT be reached yet.
    await waitFor(() => expect(order).toContain('updateTitle:called'))
    expect(order).not.toContain('sendMessage:called')
    expect(mockSendMessage).not.toHaveBeenCalled()

    releaseUpdateTitle()
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1))

    expect(order.indexOf('updateTitle:resolved')).toBeLessThan(order.indexOf('sendMessage:called'))
  })

  // Path test part 4 (PATH_STEPS bullet 5, "one ⇧⌘Z redraws within ~1s"): a
  // create diff, accepted, then ⌘Z (the block leaves the page) and ONE ⇧⌘Z —
  // inside a single `waitFor`, the block must be back on the page AND the
  // already-open ⌥⌘H panel must show the redo row, with no second keypress.
  it('one ⇧⌘Z puts a ⌘Z-removed created block back on the page and in the ⌥⌘H panel (KAN-302 item 6)', async () => {
    const user = userEvent.setup()
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    fakePage.blocks = []
    seedCreateRecord('pc1')
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [createBatch('pc1')] }]

    renderPath()
    await ready()

    const card = screen.getByRole('group', { name: /proposed edit/ })
    await user.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))

    const pageColumn = within(screen.getByTestId('page-column'))
    await waitFor(() => expect(pageColumn.getByText('the new block')).toBeInTheDocument())

    // Open the ⌥⌘H panel BEFORE the undo/redo sequence, as
    // `undo-redraw-within-1s.test.tsx` does, so it is already mounted to redraw.
    fireEvent.keyDown(document.body, { key: 'h', altKey: true, metaKey: true, code: 'KeyH' })
    const panel = screen.getByRole('complementary', { name: 'Changes to this page' })

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(pageColumn.queryByText('the new block')).not.toBeInTheDocument())

    // ONE ⇧⌘Z — both the page and the panel must redraw inside this one waitFor.
    // The redo lands a third record (the create, its undo, and now its redo) —
    // the panel's own row count is the redraw signal, since `recordTitle` gives
    // every one of the three the same label here.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => {
      expect(pageColumn.getByText('the new block')).toBeInTheDocument()
      expect(within(panel).getAllByText('the new block')).toHaveLength(3)
    })

    platform.mockRestore()
  })

  // KAN-96: the proposed view answers a diff through `answer.ts`, entirely
  // outside this composer — it never calls AITerminal's own accept path. The
  // composer's card must still pick up the settle, because the view's own
  // `invalidateAfterAnswer` always invalidates `changeLogKey()`, which the
  // chain-tip query (AITerminal.tsx) now sits under.
  it("a view accept updates the composer's own card to accepted with no remount (KAN-96)", async () => {
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'Hello world' }]
    const record = seedEditRecord('pc1')
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [editBatch('pc1')] }]

    const { queryClient } = renderPath()
    await ready()

    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(card).toHaveAttribute('data-status', 'pending')

    // The view's own accept (`acceptRecordFromLog`), simulated at the
    // store boundary — settles the record and writes the page, exactly as
    // `answer.ts` does, with no call into AITerminal at all.
    record.status = 'accepted'
    fakePage.blocks = record.after as Block[]
    await queryClient.invalidateQueries({ queryKey: changeLogKey() })

    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))
    // Same node, not a re-mounted replacement — the id survives in the DOM.
    expect(screen.getByRole('group', { name: /proposed edit/ })).toBe(card)
  })
})
