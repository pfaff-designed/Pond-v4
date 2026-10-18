/**
 * KAN-368 — path test: mounts the REAL `DocumentPanel` beside the real
 * `ShellCommands`, sharing one real `sessionUndo` stack, with only the
 * network/Supabase boundary mocked — the same shared-fake pattern
 * `kan-302-path.test.tsx` uses (one page's blocks, one change-log array, the
 * `undo_change_log_record`/`redo_change_log_record` RPCs backed by a real
 * before/after swap), trimmed to the one page this ticket's path touches and
 * without `AITerminal`: PATH_STEPS never reach the composer.
 *
 * Part 1: ⌘⌫ then ⌘Z restores the deleted block. Part 2: typing then ⌘⌫
 * within the typing's own pause are two separate ⌘Z steps, undone and redone
 * in order.
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { textEditorOf } from './helpers/text-block'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'

import { DocumentPanel } from '@/components/organisms/DocumentPanel'
import { ShellCommands } from '@/components/organisms/ShellCommands'
import { DeletionUndoProvider } from '@/lib/deletion/useDeletionUndo'
import { sessionUndo } from '@/lib/change-log/session-undo'
import { commitBlocks } from '@/lib/pages/commit'
import { closeBlockHistory } from '@/lib/modules/text/active-editor'
import { EDIT_PAUSE_MS } from '@/lib/change-log/pause'
import type { Block } from '@/lib/documents/types'
import type { ChangeLogRecord } from '@/lib/change-log/types'

// ── Shared fakes: one page, one change log ──────────────────────────────────

const PAGE_ID = 'page-1'
const POND_ID = 'pond-1'
const USER_ID = 'user-1'

interface FakePage {
  id: string
  title: string
  blocks: Block[]
}

let fakePage: FakePage
let fakeChangeLog: ChangeLogRecord[]
let nextRecordId: number

function resetFakes() {
  fakePage = { id: PAGE_ID, title: 'Workshop', blocks: [] }
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
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? PAGE_ID : null) }),
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/pond/context', () => ({
  ...jest.requireActual('@/lib/pond/context'),
  usePond: () => ({ pond: { id: POND_ID, name: 'Workshop' }, ponds: [], loading: false }),
  usePondId: () => POND_ID,
}))

jest.mock('@/lib/pages/tree', () => ({
  fetchPages: jest.fn().mockResolvedValue([]),
  insertPageOptimistic: jest.fn(),
  applyPagePropsOptimistic: jest.fn(),
}))

jest.mock('@/lib/templates/client', () => ({
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue(null),
}))

// ── Supabase: auth.getUser() and the two undo/redo RPCs ────────────────────

function postgrestError(detail: string): PostgrestError {
  return { message: detail, details: detail, hint: '', code: '' } as PostgrestError
}

/**
 * The one hop PATH_STEPS need: undo an accepted `edit` record (writes
 * `before` back, logs an `undo`) or redo the standing undo of one (writes
 * `after` back, logs a `redo`) — `kan-302-path.test.tsx`'s own fake, trimmed
 * to the one page this ticket's path touches.
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

// ── Pages: getPage/updateTitle/saveBlocks backed by fakePage ───────────────

jest.mock('@/lib/pages/client', () => ({
  getPage: jest.fn(async (_supabase: unknown, id: string) => (id === fakePage.id ? { ...fakePage } : null)),
  updateTitle: jest.fn(async (_supabase: unknown, id: string, title: string) => {
    if (id === fakePage.id) fakePage.title = title
  }),
  saveBlocks: jest.fn(async (_supabase: unknown, id: string, blocks: Block[]) => {
    if (id === fakePage.id) fakePage.blocks = blocks
  }),
  setProperty: jest.fn().mockResolvedValue(undefined),
  createPage: jest.fn(),
  deletePage: jest.fn().mockResolvedValue(undefined),
  defineSchema: jest.fn().mockResolvedValue(undefined),
}))

// `commitBlocks` is the debounced save's own path (the typing half of part 2's
// test) — distinct from `persistBlocksAsOwnEdit`'s direct `saveBlocks` +
// `appendOwnEdit` calls that part 1's delete already exercises. Mocked at the
// same fidelity `kan-302-path.test.tsx` uses (writes `fakePage.blocks`, logs an
// own-edit record), plus the two things that test doesn't need: remembering the
// record on the real `sessionUndo` stack, and closing the saved block's own
// editor history (KAN-139, comment 10064) — both of which the production
// `recordOwnEdit`/`logged.then` do, and without the second, a ⌘Z pressed once
// focus lands back on this field (part 2's own path) would hit the field's
// still-nonempty ProseMirror history instead of falling through to the shell's
// session undo.
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn(
    async (
      _supabase: unknown,
      _queryClient: unknown,
      pageId: string,
      blocks: Block[],
      opts?: {
        ownEdit?: true
        before?: Block[]
        pondId?: string | null
        onPending?: (recordIds: readonly string[] | null) => void
      }
    ) => {
      // KAN-355: `runSave` destructures commitBlocks' `{ remembered }`.
      const done = { remembered: Promise.resolve() }
      if (pageId !== fakePage.id) return done
      fakePage.blocks = blocks
      if (opts?.ownEdit) {
        const record = makeRecord({
          status: 'accepted',
          action: 'edit',
          before: opts.before ?? null,
          after: blocks,
          targetPageId: pageId,
        })
        fakeChangeLog.push(record)
        // KAN-368: mirrors `commit.ts`'s own `onPending`/`sessionUndo.remember`
        // split — a caller that already reserved its own pending slot (every
        // production caller, `use-page-draft.ts`'s `runSave`) is handed the
        // record ids instead of this mock remembering a fresh, wrongly-ordered
        // step itself.
        if (opts.onPending) opts.onPending([record.id])
        else if (opts.pondId) sessionUndo.remember({ pondId: opts.pondId, recordIds: [record.id] })
        for (const block of blocks) {
          if ('content' in block) closeBlockHistory(block.id, block.content)
        }
      }
      return done
    }
  ),
  propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
}))

// ── Change log: store's appendOwnEdit backed by fakeChangeLog, the rest real ─

jest.mock('@/lib/change-log/store', () => {
  const actual = jest.requireActual('@/lib/change-log/store')
  return {
    ...actual,
    appendOwnEdit: jest.fn(async (_supabase: unknown, input: Partial<ChangeLogRecord>) => {
      const record = makeRecord({ ...input, status: 'accepted', action: input.action ?? 'edit', actor: 'you' })
      fakeChangeLog.push(record)
      return record
    }),
  }
})

// ── The harness ──────────────────────────────────────────────────────────────

const onPlatform = (platform: string) =>
  jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

beforeEach(() => {
  jest.clearAllMocks()
  resetFakes()
  sessionUndo.clear()
  onPlatform('MacIntel')
})

afterEach(() => jest.restoreAllMocks())

function renderPath(blocks: Block[]) {
  fakePage.blocks = blocks
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DeletionUndoProvider>
        <ShellCommands />
        <DocumentPanel />
      </DeletionUndoProvider>
    </QueryClientProvider>
  )
}

const blockRoot = (id: string) => document.getElementById(`block-${id}`)!
const textBlockIn = (id: string) => within(blockRoot(id)).findByRole('textbox', { name: 'text block' })

describe('KAN-368 path test', () => {
  it('⌘⌫ on block B removes it, and ⌘Z brings it back', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    renderPath([a, b])
    await screen.findByLabelText('Page title')
    expect(screen.getByText('B text')).toBeInTheDocument()

    const field = await textBlockIn('b-b')
    field.focus()
    await waitFor(() => expect(field).toHaveFocus())

    fireEvent.keyDown(field, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    await waitFor(() => expect(fakeChangeLog.length).toBe(1))

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
  })

  it('typing in A then ⌘⌫ on B are two steps: ⌘Z/⌘Z/⇧⌘Z/⇧⌘Z replay them in order', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    // jsdom's ProseMirror view can't resolve a pointer position (no
    // `elementFromPoint`), so the tap that would place the caret is simulated
    // the way `block-menu.test.tsx` does: focus the editor directly, at the
    // end of its text, then type with `skipClick` so `userEvent` never tries
    // its own mousedown-driven click.
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' extra', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text extra'))

    // ⌘⌫ on B lands within the typing's own 600ms pause: the action flushes
    // A's pending debounced save (closing it as its own step) before writing
    // its own.
    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    await waitFor(() => expect(fakeChangeLog.length).toBe(2))

    // ⌘Z at once undoes exactly the delete: B comes back, A's word stays.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
    expect(screen.getByText('A text extra')).toBeInTheDocument()

    // ⌘Z again undoes the typing step: A's word goes.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text extra')).not.toBeInTheDocument())
    expect(screen.getByText('A text')).toBeInTheDocument()

    // ⇧⌘Z redoes the typing step: A's word is back.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByText('A text extra')).toBeInTheDocument())

    // A second ⇧⌘Z redoes the delete step: B is gone again, in order.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    expect(screen.getByText('A text extra')).toBeInTheDocument()
  })

  it('⌘Z fired before either write lands still undoes the delete first, the typing second', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' extra', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text extra'))

    // Hold A's flush (its `commitBlocks`) unresolved, so ⌘⌫ on B — and the ⌘Z
    // right after it — both land before EITHER write's record ids are known,
    // not just before the delete's.
    const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
    const realImpl = mockedCommitBlocks.getMockImplementation()!
    let releaseFlush: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseFlush = resolve
    })
    mockedCommitBlocks.mockImplementationOnce(async (...callArgs) => {
      await gate
      return realImpl(...callArgs)
    })

    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())

    // ⌘Z before anything has resolved: both pending steps are still on the
    // stack unsettled. Resolving `undo()`'s outcome requires it to wait for
    // the step it actually popped (B's delete) rather than falling through
    // to whatever settled step sat beneath it.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })

    releaseFlush()
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
    expect(screen.getByText('A text extra')).toBeInTheDocument()

    // A second ⌘Z reaches the typing step underneath, by its own record.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text extra')).not.toBeInTheDocument())
    expect(screen.getByText('A text')).toBeInTheDocument()
  })

  it('a debounced save chained behind an in-flight one logs its own before, not the structural edit racing it', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())

    // Hold save 1 (the first word's debounced save) on an unresolved gate, so
    // it's still in flight when the second word's save is scheduled and B is
    // deleted.
    const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
    const realImpl = mockedCommitBlocks.getMockImplementation()!
    let releaseSave1: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseSave1 = resolve
    })
    mockedCommitBlocks.mockImplementationOnce(async (...callArgs) => {
      await gate
      return realImpl(...callArgs)
    })

    await userEvent.type(fieldA, ' one', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one'))

    // Past the pause: save 1's debounce timer fires and it starts (gated, in
    // flight).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, EDIT_PAUSE_MS + 50))
    })

    await userEvent.type(fieldA, ' two', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one two'))

    // ⌘⌫ on B flushes save 2 (chained behind the still-gated save 1) before
    // writing its own own-edit record.
    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())

    releaseSave1()
    await waitFor(() => expect(fakeChangeLog.length).toBe(3))

    const [save1Record, save2Record, deleteRecord] = fakeChangeLog
    expect(save1Record.before).toEqual([a, b])
    expect(save1Record.after).toEqual([{ ...a, content: 'A text one' }, b])
    // The regression: save 2's `before` must be what save 1 actually left
    // behind — not the structural delete's own `after`, which lands locally
    // before save 2's chained write runs.
    expect(save2Record.before).toEqual([{ ...a, content: 'A text one' }, b])
    expect(save2Record.after).toEqual([{ ...a, content: 'A text one two' }, b])
    expect(deleteRecord.before).toEqual([{ ...a, content: 'A text one two' }, b])
    expect(deleteRecord.after).toEqual([{ ...a, content: 'A text one two' }])

    // ⌘Z undoes the delete first: B comes back, both words still there.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
    expect(screen.getByText('A text one two')).toBeInTheDocument()

    // A second ⌘Z undoes save 2's typing step — ONLY the second word goes,
    // B stays. (The bug this guards: a wrongly-ordered save 2 record undoes
    // back to "no B", deleting it again and losing the second word for good.)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text one two')).not.toBeInTheDocument())
    expect(screen.getByText('A text one')).toBeInTheDocument()
    expect(screen.getByText('B text')).toBeInTheDocument()
  })
})
