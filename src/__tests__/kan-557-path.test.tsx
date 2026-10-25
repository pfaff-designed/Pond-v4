/**
 * KAN-557 — the path test: a blank page → `/meeting notes` → apply in place
 * → ⌘Z leaves no blocks AND no properties frame (the schema/props write that
 * drew it is part of the same undo step, not left behind) → ⇧⌘Z brings the
 * whole template, frame included, back.
 *
 * Mirrors `kan-479-path.test.tsx`'s real-`DocumentPanel`-plus-`ShellCommands`
 * harness (fake pages + change log, `@/lib/pages/commit` and `sessionUndo`
 * kept REAL — only the network boundary below them is faked), asserting on
 * the rendered DOM (the `properties` card, PATH_STEPS' own words) rather than
 * only the mocks that `block-canvas-template-apply-undo-path.test.tsx`
 * already covers.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'

import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { withSchema } from '@/lib/properties/schema'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { findTextBlock, writeInTextBlock } from './helpers/text-block'

const POND_ID = 'pond-1'
const USER_ID = 'user-1'
const PAGE_ID = 'page-1'

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
    [PAGE_ID]: {
      id: PAGE_ID,
      parentId: null,
      type: 'page',
      title: 'Health',
      blocks: [],
      props: {},
      order: 0,
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

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? PAGE_ID : null) }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: POND_ID, name: 'Life' }, ponds: [], loading: false }),
  usePondId: () => POND_ID,
}))
jest.mock('@/lib/pond/name', () => ({ usePondName: () => 'Life' }))

function postgrestError(detail: string): PostgrestError {
  return { message: detail, details: detail, hint: '', code: '' } as PostgrestError
}

// Generic over undo and redo (shared shape with `kan-479-path.test.tsx`'s own
// fake): acts on whatever record id is passed, original or a prior redo's.
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

    if (record.targetPageId && pages[record.targetPageId]) {
      pages[record.targetPageId].blocks = Array.isArray(to) ? (to as Block[]) : []
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

    if (redo && standingUndo) standingUndo.status = 'undone'
    else if (!redo) record.status = 'undone'
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
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { first_run_done_at: new Date().toISOString() }, error: null }),
        }),
      }),
    }),
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
  saveProps: jest.fn(async (_supabase: unknown, id: string, props: Record<string, unknown>) => {
    if (pages[id]) pages[id].props = props
  }),
  defineSchema: jest.fn(async (_supabase: unknown, id: string, schema: unknown) => {
    if (pages[id]) pages[id].props = withSchema(pages[id].props, schema as never)
  }),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/pages/tree', () => ({
  ...jest.requireActual('@/lib/pages/tree'),
  fetchPages: jest.fn().mockImplementation(async () => [
    { id: PAGE_ID, parent_id: null, type: 'page', title: 'Health', order: 0, updated_at: '' },
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
      const record = makeRecord({
        ...input,
        status: 'accepted',
        action: input.action ?? 'edit',
        actor: 'you',
      })
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
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

describe('KAN-557 — applying `meeting notes` in place, ⌘Z/⇧⌘Z (path test)', () => {
  it('⌘Z leaves no blocks and no properties frame; ⇧⌘Z brings the whole template back', async () => {
    renderPath()

    // PATH_STEPS 1: a blank page's `/` leads with templates; applying `meeting
    // notes` draws its blocks AND its properties (record) frame.
    const gap = await screen.findByTestId('trailing-block-gap')
    fireEvent.click(gap)
    const editor = await findTextBlock()
    writeInTextBlock(editor, '/')
    const menu = await screen.findByRole('listbox', { name: 'blocks' })
    // The slash keystroke's own debounced save lands here, ahead of the
    // template's pick — `applyTemplateInPlaceUnguarded` flushes it first
    // (BlockCanvas.tsx's comment on that flush) so it can never land AFTER
    // the apply with a stale baseline. It is its own, already-correct undo
    // step. Snapshotting it once it's landed is what "no blocks… left
    // behind" (SPEC.md PATH_STEPS 2) means precisely: NONE of the template's
    // own blocks survive ⌘Z, not that the page was never typed into at all.
    await waitFor(() => expect(pages[PAGE_ID].blocks).toHaveLength(1))
    const blocksBeforeApply = [...pages[PAGE_ID].blocks]
    const meetingNotesRow = within(menu)
      .getAllByRole('option')
      .find((o) => o.querySelector('[data-part="label"]')?.textContent === 'meeting notes')!
    fireEvent.click(meetingNotesRow)

    await waitFor(() => expect(document.querySelector('[data-block-kind="properties"]')).not.toBeNull())
    expect(pages[PAGE_ID].props).toHaveProperty('_schema')
    expect(pages[PAGE_ID].blocks).not.toEqual(blocksBeforeApply)

    // PATH_STEPS 2: ⌘Z — one step undoes the whole apply: none of the
    // template's blocks remain, and the record block (the properties frame)
    // is gone, not left behind.
    fireEvent.keyDown(document, { key: 'z', metaKey: true })

    await waitFor(() => expect(document.querySelector('[data-block-kind="properties"]')).toBeNull())
    expect(pages[PAGE_ID].blocks).toEqual(blocksBeforeApply)
    expect(pages[PAGE_ID].props).not.toHaveProperty('_schema')

    // PATH_STEPS 3: ⇧⌘Z — the whole template is back, frame included.
    fireEvent.keyDown(document, { key: 'z', metaKey: true, shiftKey: true })

    await waitFor(() => expect(document.querySelector('[data-block-kind="properties"]')).not.toBeNull())
    expect(pages[PAGE_ID].props).toHaveProperty('_schema')
    expect(pages[PAGE_ID].blocks).not.toEqual(blocksBeforeApply)
  })
})
