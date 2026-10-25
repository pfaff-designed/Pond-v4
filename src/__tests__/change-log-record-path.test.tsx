/**
 * KAN-152 path test — PATH_STEPS 1–3 and 5 end to end, against the real
 * hosting surfaces (not the record-page lib helpers directly): the real
 * `Rail` beside the real `DocumentPanel` and `AITerminal`, sharing one
 * navigable URL through `change-log-path.test.tsx`'s own stateful
 * `next/navigation` fake — a click accepts an edit in the composer, the
 * rail opens the change log, clicking the record's row opens
 * `ChangeLogRecordPage`, revert raises a new record ("reverted by"
 * appears), and "open page" returns to the edited page.
 *
 * The composer/page boundary (supabase, pages/client, pages/commit,
 * change-log/store's raw functions) is faked exactly as
 * `kan-302-path.test.tsx` fakes it — one shared in-memory page + change log —
 * extended with `getRecord`/`listRevertsOf`/`listRevisionsOf` so
 * `ChangeLogRecordPage` can read them. `@/lib/change-log/revert` is left
 * UNMOCKED: `proposeRevert`'s own logic runs for real against the faked
 * store primitives, rather than re-describing its behaviour in the test.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { Rail } from '@/components/organisms/Rail'
import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { PondContext, type PondContextValue } from '@/lib/pond/context'
import type { Pond } from '@/lib/pond/client'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'
import { applyProposedChanges } from '@/lib/pages/edits'
import { createDeterministicMintId } from '@/lib/change-log/mint-id'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { pagesKey } from '@/lib/pages/keys'

// ── Shared fakes: one page, one change log ──────────────────────────────────

const PAGE_ID = 'page-1'
const POND_ID = 'pond-1'
const USER_ID = 'user-1'
const AT = '2026-01-01T00:00:00Z'

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
    title: 'Notes',
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

// ── next/navigation: the stateful fake `change-log-path.test.tsx` built —
// `push` advances one shared URL and notifies every mounted
// `useSearchParams()`, so Rail's click and DocumentPanel's/AITerminal's read
// see the SAME url. Starts on the seeded page, not the root. ───────────────

jest.mock('next/navigation', () => {
  const { useState, useEffect } = jest.requireActual('react') as typeof import('react')
  let current = new URLSearchParams({ nodeId: 'page-1' })
  const listeners = new Set<(params: URLSearchParams) => void>()
  const push = jest.fn((href: string) => {
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
    current = new URLSearchParams(qs)
    listeners.forEach((listener) => listener(current))
  })
  return {
    __push: push,
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
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: USER_ID, email: 'test@example.com' } } }),
    },
  }),
}))

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
  movePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/commit', () => ({
  ...jest.requireActual('./helpers/page-commit-mock').pageCommitMock({
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
  }),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn(async () => [
    { id: 'root-db', parent_id: null, type: 'page', title: 'databases', order: 9, updated_at: AT },
    { id: PAGE_ID, parent_id: null, type: 'page', title: 'Notes', order: 0, updated_at: AT },
  ]),
  insertPageOptimistic: jest.fn(),
}))

jest.mock('@/lib/pages/mark-client', () => ({
  setPageGlyph: jest.fn().mockResolvedValue(undefined),
  setAreaRole: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pond/client', () => ({
  pushRecentGlyphToPond: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

// ── Change log: store's raw Supabase-backed functions, backed by
// `fakeChangeLog` — `kan-302-path.test.tsx`'s own set, extended with the
// three reads `ChangeLogRecordPage` needs (`getRecord`/`listRevertsOf`/
// `listRevisionsOf`), each a direct read over the same array rather than a
// `supabase.from()` round trip. Pure helpers stay real via `actual`. ───────

jest.mock('@/lib/change-log/store', () => {
  const actual = jest.requireActual('@/lib/change-log/store')
  const { assertTransition, WAITING_STATUSES } = jest.requireActual('@/lib/change-log/status')
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
    resolveChainStatuses: jest.fn(
      async (
        _supabase: unknown,
        opts: { records: Array<{ id: string; status: ChangeLogStatus }> }
      ) => {
        const tips = new Map<string, ChangeLogStatus>()
        for (const record of opts.records) tips.set(record.id, record.status)
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
    markOutdated: jest.fn(async () => []),
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
    countWaiting: jest.fn(
      async () => fakeChangeLog.filter((r) => WAITING_STATUSES.includes(r.status)).length
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
    getRecord: jest.fn(
      async (_supabase: unknown, id: string) => fakeChangeLog.find((r) => r.id === id) ?? null
    ),
    listRevertsOf: jest.fn(async (_supabase: unknown, opts: { recordId: string }) =>
      fakeChangeLog
        .filter((r) => r.links.revertOf === opts.recordId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    ),
    listRevisionsOf: jest.fn(async (_supabase: unknown, opts: { recordId: string }) => {
      const byRevisedFrom = new Map<string, ChangeLogRecord>()
      for (const r of fakeChangeLog) {
        if (r.links.revisedFrom) byRevisedFrom.set(r.links.revisedFrom, r)
      }
      const chain: ChangeLogRecord[] = []
      const seen = new Set<string>([opts.recordId])
      let cursor = opts.recordId
      for (;;) {
        const next = byRevisedFrom.get(cursor)
        if (!next || seen.has(next.id)) break
        chain.push(next)
        seen.add(next.id)
        cursor = next.id
      }
      return chain
    }),
    appendRecord: jest.fn(
      async (
        _supabase: unknown,
        input: Partial<ChangeLogRecord> & { status: ChangeLogStatus; action: string }
      ) => {
        const now = new Date().toISOString()
        const actor = input.actor ?? 'you'
        const record: ChangeLogRecord = {
          id: mintRecordId(),
          userId: input.userId ?? USER_ID,
          pondId: input.pondId ?? POND_ID,
          status: input.status,
          action: input.action as ChangeLogRecord['action'],
          actor,
          targetPageId: input.targetPageId ?? null,
          targetBlockId: input.targetBlockId ?? null,
          before: input.before ?? null,
          after: input.after ?? null,
          sourceThreadId: input.sourceThreadId ?? null,
          toolCallId: input.toolCallId ?? null,
          read: input.read ?? null,
          links: input.links ?? {},
          transitions: [{ status: input.status, at: now, actor }],
          createdAt: now,
          statusAt: now,
        }
        fakeChangeLog.push(record)
        return record
      }
    ),
  }
})

// ── The rest of AITerminal's boundary (conversation, notify, chat stream) ──

jest.mock('@/lib/deletion/notify-bridge', () => ({ requestNotify: jest.fn() }))

jest.mock('@/lib/conversation/client', () => ({
  getOrCreateConversation: jest.fn(async () => ({
    id: 'conv-1',
    messages: [],
    resolutions: { changes: {}, creates: {}, skipped: {} },
  })),
  saveTranscript: jest.fn().mockResolvedValue(undefined),
  dissolveConversation: jest.fn().mockResolvedValue(undefined),
}))

let mockMessages: Array<{
  id: string
  role: string
  metadata?: Record<string, unknown>
  parts: Array<Record<string, unknown>>
}> = []
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: mockMessages,
    sendMessage: jest.fn(),
    regenerate: jest.fn(),
    addToolOutput: jest.fn(),
    setMessages: jest.fn(),
    status: 'ready',
  })),
}))

global.fetch = jest
  .fn()
  .mockResolvedValue({ ok: true, json: async () => ({ extractions: [] }) } as Response)

// Imported after the mocks above so AITerminal picks up the mocked `useChat`
// and every component below picks up the stateful `next/navigation` fake.
import { AITerminal } from '@/components/organisms/AITerminal'
import { openComposerIfClosed } from './helpers/open-composer'

const POND: Pond = {
  id: POND_ID,
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
  patchPond: () => {},
  removePond: () => {},
}

/** Pond proposes "change alpha to apple" against the one seeded block, `b0`. */
function editBatch(toolCallId: string) {
  return {
    type: 'tool-propose_changes',
    toolCallId,
    state: 'input-available',
    input: {
      changes: [{ op: 'edit', blockId: 'b0', data: { type: 'text', content: 'apple' } }],
    },
  }
}

/**
 * Seeds a `proposed` change-log record for `editBatch`'s edit, `before`/
 * `after` computed the same way `writeToTarget` (accept.ts) computes it —
 * real `applyProposedChanges` against the page's CURRENT blocks — so the
 * accept's own byte-identical check passes and the composer's card finds a
 * real record to advance. `targetBlockId` is set to the edited block, unlike
 * `kan-302-path.test.tsx`'s own `seedEditRecord` (which never needed it) —
 * `recordTitle`/`pageBlockField` read it to resolve the changed block.
 */
function seedEditRecord(toolCallId: string): ChangeLogRecord {
  const changes = editBatch(toolCallId).input.changes as ModuleChange[]
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
    targetBlockId: 'b0',
    targetPageId: fakePage.id,
  })
  fakeChangeLog.push(record)
  return record
}

function renderPath() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(pagesKey(POND_ID), [
    { id: 'root-db', parentId: null, type: 'page', title: 'databases', order: 9, updatedAt: AT },
    { id: PAGE_ID, parentId: null, type: 'page', title: 'Notes', order: 0, updatedAt: AT },
  ])
  const result = render(
    <QueryClientProvider client={queryClient}>
      <PondContext.Provider value={PROVIDER_VALUE}>
        <DeletionUndoProvider>
          <Rail />
          <div data-testid="document-panel">
            <DocumentPanel />
          </div>
          <AITerminal />
        </DeletionUndoProvider>
      </PondContext.Provider>
    </QueryClientProvider>
  )
  return { ...result, queryClient }
}

async function ready() {
  openComposerIfClosed()
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message Pond' })).toBeEnabled())
}

beforeEach(() => {
  jest.clearAllMocks()
  resetFakes()
  mockMessages = []
})

describe('KAN-152 path test — accept, open the record page, revert, open page', () => {
  it('walks PATH_STEPS 1–3 and 5', async () => {
    const user = userEvent.setup()
    fakePage.blocks = [{ id: 'b0', type: 'text', content: 'alpha' }]
    seedEditRecord('pc1')
    mockMessages = [{ id: 'm1', role: 'assistant', parts: [editBatch('pc1')] }]

    renderPath()
    await ready()

    // PATH_STEPS 1 — accept the proposed edit in the composer.
    const card = screen.getByRole('group', { name: /proposed edit/ })
    expect(within(card).getByText('alpha')).toBeInTheDocument()
    expect(within(card).getByText('apple')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'accept' }))
    await waitFor(() => expect(card).toHaveAttribute('data-status', 'accepted'))

    // PATH_STEPS 2 — the rail opens databases → change log, then the record's row.
    const foot = screen.getByRole('tree', { name: 'Databases' })
    fireEvent.click(within(foot).getByRole('treeitem', { name: 'databases' }))
    const changeLogRow = await within(foot).findByRole('treeitem', { name: 'change log' })
    fireEvent.click(changeLogRow)

    const panel = screen.getByTestId('document-panel')
    const recordRow = await within(panel).findByTestId('change-log-status-rec-1')
    fireEvent.click(recordRow.closest('button') as HTMLButtonElement)

    expect(await within(panel).findByTestId('change-log-record-title')).toBeInTheDocument()
    expect(within(panel).getByText(/accepted by/)).toBeInTheDocument()
    expect(within(panel).getByText(/pond ·/)).toBeInTheDocument()
    const diffCard = within(panel).getByTestId('change-log-record-diff-card')
    expect(within(diffCard).getByText('alpha')).toBeInTheDocument()
    expect(within(diffCard).getByText('apple')).toBeInTheDocument()
    const openPageButton = within(panel).getByRole('button', { name: 'open page' })
    const revertButton = within(panel).getByRole('button', { name: 'revert' })

    // PATH_STEPS 3 — revert raises one new record; "reverted by" appears.
    await user.click(revertButton)
    await waitFor(() => expect(within(panel).getByText(/revert · /)).toBeInTheDocument())
    expect(fakeChangeLog.filter((r) => r.action === 'revert')).toHaveLength(1)

    // Double-clicking revert raises only one (AUDIT G9).
    await user.click(within(panel).getByRole('button', { name: 'revert' }))
    expect(fakeChangeLog.filter((r) => r.action === 'revert')).toHaveLength(1)

    // PATH_STEPS 5 — "open page" returns to the edited page.
    await user.click(openPageButton)
    await waitFor(() =>
      expect(within(screen.getByTestId('page-column')).getByText('apple')).toBeInTheDocument()
    )
  })
})
