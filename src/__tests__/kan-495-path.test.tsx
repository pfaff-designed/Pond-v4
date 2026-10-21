/**
 * KAN-495 — the write queue's proof. Harness lifted from `kan-368-path.test.tsx`
 * (feat/kan-368, not merged; read-only reference via `git show feat/kan-368:<path>`).
 * The suite was committed red, against today's four-separate-records save path,
 * before the queue replaced it: 73d96f71's chained-save-before, 27eb534b's
 * chained-save-after-a-failure, and a reload check all pass unchanged once the
 * queue lands. The person's-path sequence — type in A, ⌘⌫ on B within the pause,
 * ⌘Z/⌘Z/⇧⌘Z/⇧⌘Z — is kept last: it is PATH_STEPS' acceptance walk, on the real
 * `DocumentPanel` (which renders `BlockCanvas`) plus `ShellCommands`.
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

// The URL's `nodeId` — mutable so a test that needs its own page id (isolated
// from the page-write registry's module-level, never-cleared queue other
// tests in this file leave behind under `PAGE_ID`) can point it elsewhere.
let activeNodeId: string = PAGE_ID

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
  useSearchParams: () => ({ get: (key: string) => (key === 'nodeId' ? activeNodeId : null) }),
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

// `commitBlocks` is the debounced save's own path — distinct from
// `persistBlocksAsOwnEdit`'s direct `saveBlocks` + `appendOwnEdit` calls that
// the delete step exercises. Mocked at the fidelity `kan-302-path.test.tsx`
// uses (writes `fakePage.blocks`, logs an own-edit record), plus remembering
// the record on the real `sessionUndo` stack and closing the saved block's
// own editor history (KAN-139, comment 10064).
jest.mock('@/lib/pages/commit', () => {
  const commitBlocks = jest.fn(
    async (
      _supabase: unknown,
      _queryClient: unknown,
      pageId: string,
      blocks: Block[],
      opts?: {
        ownEdit?: true
        before?: Block[]
        pondId?: string | null
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
        if (opts.pondId) sessionUndo.remember({ pondId: opts.pondId, recordIds: [record.id] })
        for (const block of blocks) {
          if ('content' in block) closeBlockHistory(block.id, block.content)
        }
      }
      return done
    }
  )
  return {
    commitBlocks,
    propagateBlockWrite: jest.fn().mockResolvedValue(undefined),
    // KAN-495: `use-page-draft.ts`'s seeding effect calls `createPageWriter`
    // on every mount to build the page-write queue. Forwards to the same
    // `commitBlocks` mock above, matching the real writer's shape
    // (`commit.ts`'s `createPageWriter`).
    createPageWriter:
      (supabase: unknown, queryClient: unknown, pageId: string, pondId: string | null) =>
      async (op: {
        kind: 'typed' | 'structural'
        before: { title: string; blocks: Block[] }
        after: { title: string; blocks: Block[] }
      }) => {
        if (op.kind === 'typed') {
          await (
            jest.requireMock('@/lib/pages/client') as {
              updateTitle: (supabase: unknown, pageId: string, title: string) => Promise<void>
            }
          ).updateTitle(supabase, pageId, op.after.title)
        }
        await commitBlocks(supabase, queryClient, pageId, op.after.blocks, {
          ownEdit: true,
          before: op.before.blocks,
          pondId,
        })
      },
  }
})

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
  activeNodeId = PAGE_ID
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

describe('KAN-495 path test', () => {
  it('SPEC.md Tests (a) / 73d96f71: a save chained behind one that fails is retried by the next write, and every edit stays undoable', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())

    // Save 1 (the first word's debounced save) is gated to REJECT once —
    // SPEC.md brief 7(a): make it fail while save 2 and the ⌘⌫ are already
    // queued behind it.
    const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    let rejectSave1: (err: Error) => void = () => {}
    const gate = new Promise<void>((_resolve, reject) => {
      rejectSave1 = reject
    })
    mockedCommitBlocks.mockImplementationOnce(async () => {
      await gate
      throw new Error('unreachable')
    })

    await userEvent.type(fieldA, ' one', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one'))

    // Past the pause: save 1's debounce timer fires and it starts (gated, in
    // flight, bound to fail).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, EDIT_PAUSE_MS + 50))
    })

    await userEvent.type(fieldA, ' two', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one two'))

    // ⌘⌫ on B flushes save 2 (queued behind the still-gated save 1) and
    // enqueues its own structural delete op right behind that — both wait
    // on save 1's outcome.
    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())

    rejectSave1(new Error('network error'))

    // Save 1 fails: it logs nothing, and save 2 + the delete stay pending
    // behind it rather than applying with a guessed `before` (design brief
    // point 2) — nothing is remembered yet.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(fakeChangeLog.length).toBe(0)

    // The next write retries the halted save first, then drains save 2 and
    // the delete queued behind it, then applies itself — all four land, in
    // order, each its own record.
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' three', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one two three'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, EDIT_PAUSE_MS + 50))
    })
    await waitFor(() => expect(fakeChangeLog.length).toBe(4))

    const [retriedSave1, save2Record, deleteRecord, save3Record] = fakeChangeLog
    expect(retriedSave1.before).toEqual([a, b])
    expect(retriedSave1.after).toEqual([{ ...a, content: 'A text one' }, b])
    // The regression 73d96f71 fixed: save 2's `before` must be what save 1
    // actually left behind once it finally applied — not the structural
    // delete's own `after`, which landed locally before save 2's write ran.
    expect(save2Record.before).toEqual([{ ...a, content: 'A text one' }, b])
    expect(save2Record.after).toEqual([{ ...a, content: 'A text one two' }, b])
    expect(deleteRecord.before).toEqual([{ ...a, content: 'A text one two' }, b])
    expect(deleteRecord.after).toEqual([{ ...a, content: 'A text one two' }])
    expect(save3Record.before).toEqual([{ ...a, content: 'A text one two' }])
    expect(save3Record.after).toEqual([{ ...a, content: 'A text one two three' }])

    // Every edit stays undoable — including the one that had to be
    // retried — and each ⌘Z lands on a state the store actually held.
    act(() => {
      fieldA.blur()
    })
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text one two three')).not.toBeInTheDocument())
    expect(screen.getByText('A text one two')).toBeInTheDocument()
    expect(screen.queryByText('B text')).not.toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
    expect(screen.getByText('A text one two')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text one two')).not.toBeInTheDocument())
    expect(screen.getByText('A text one')).toBeInTheDocument()
    expect(screen.getByText('B text')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text one')).not.toBeInTheDocument())
    expect(screen.getByText('A text')).toBeInTheDocument()
    expect(screen.getByText('B text')).toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('a failed save halts the queue and keeps the chained save pending, rather than merging or losing either', async () => {
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    renderPath([a])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())

    // Save 1 (the first word's debounced save) is gated to reject — it never
    // actually stores anything.
    const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    let rejectSave1: (err: Error) => void = () => {}
    const gate = new Promise<void>((_resolve, reject) => {
      rejectSave1 = reject
    })
    mockedCommitBlocks.mockImplementationOnce(async () => {
      await gate
      throw new Error('unreachable')
    })

    await userEvent.type(fieldA, ' one', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one'))

    // Past the pause: save 1's debounce timer fires and it starts (gated, in
    // flight, bound to fail).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, EDIT_PAUSE_MS + 50))
    })

    await userEvent.type(fieldA, ' two', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one two'))

    // Past the pause again: save 2's debounce timer fires too, chaining
    // behind the still-gated (failing) save 1.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, EDIT_PAUSE_MS + 50))
    })

    rejectSave1(new Error('network error'))

    // Design brief point 2 (SPEC.md): "a failed write stops the queue, keeps
    // later writes pending (KAN-407's retry hooks into this), and logs
    // nothing for the failed op." Save 1 never stored anything and save 2 —
    // already queued behind it — stays pending rather than silently applying
    // with a guessed `before`: neither is remembered, so neither shows up as
    // a change-log record yet. (KAN-368's original fix chained saves so a
    // predecessor's failure never blocked its successor; this ticket
    // deliberately trades that for "nothing is ever misattributed", until
    // KAN-407 adds the retry that resumes the queue.)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(fakeChangeLog.length).toBe(0)
    // Nothing is lost locally — the typed content is still on screen even
    // though its own-edit record hasn't landed.
    expect(screen.getByText('A text one two')).toBeInTheDocument()

    // ⌘Z has nothing to undo: no step was ever remembered, so it's a no-op
    // — but it must still RESOLVE. `runUndoStep` (ShellCommands.tsx) flushes
    // the page first and only calls `sessionUndo.undo` once that flush
    // settles; a halted queue whose `drained()` never settles would park
    // this chord forever (KAN-495's own drained()/maybeResolveDrain bug),
    // and a parked ⌘Z firing later would land on whatever step is current
    // THEN, not this one. Spying on `sessionUndo.undo` and awaiting its
    // outcome (rather than asserting the unchanged DOM, which would pass
    // whether or not the chord ever ran) is what would fail if it were parked.
    // Blurred first (as if focus had moved to the title or away from the
    // field): `fieldA`'s own Tiptap history is still non-empty (its save
    // never landed to close it, KAN-139), which would otherwise route the
    // chord to the field's own undo instead of the shell's — this test is
    // about the shell's `runUndoStep`/queue interaction, not the editor's.
    act(() => {
      fieldA.blur()
    })
    const undoSpy = jest.spyOn(sessionUndo, 'undo')
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(undoSpy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(undoSpy.mock.results[0]?.value).resolves.toEqual({ outcome: 'empty' }))
    expect(screen.getByText('A text one two')).toBeInTheDocument()

    // Typing afterwards must not trigger an extra undo on top of this one
    // (the parked-chord bug also described the undo firing late, on the
    // wrong step, once the queue's next edit finally woke it up).
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' three', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one two three'))
    expect(undoSpy).toHaveBeenCalledTimes(1)

    undoSpy.mockRestore()
    consoleError.mockRestore()
  })

  // SPEC.md's Tests section, sequence (b) — distinct from the "27eb534b" `it()`
  // above, which is the real feat/kan-368 commit 27eb534b's own fix (a failed
  // chained save). This is the ⌘Z-mid-flight sequence SPEC.md's prose actually
  // describes under that same label: a structural delete's flush holds an
  // earlier typed save in flight, a second typed edit queues behind it, and
  // ⌘Z is pressed before any of the three has landed.
  it('SPEC.md Tests (b): ⌘Z pressed while a flushed save is still in flight waits for the queue, then undoes each of the three writes in order', async () => {
    activeNodeId = 'page-midflight'
    fakePage.id = 'page-midflight'
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())

    // Hold save X (the first word's save) in flight — ⌘⌫ below flushes it
    // immediately (bypassing the 600ms pause), but it won't resolve until
    // released.
    const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
    const realImpl = mockedCommitBlocks.getMockImplementation()!
    let releaseSaveX: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseSaveX = resolve
    })
    mockedCommitBlocks.mockImplementationOnce(async (...callArgs) => {
      await gate
      return realImpl(...callArgs)
    })

    await userEvent.type(fieldA, ' one', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one'))

    // ⌘⌫ on B flushes save X (gated, now in flight) and enqueues the delete
    // as its own structural op, queued behind X.
    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    expect(fakeChangeLog.length).toBe(0)

    // Type a second word. Its debounced save queues behind the delete —
    // nothing has applied yet, X is still gated.
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' two', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text one two'))
    expect(fakeChangeLog.length).toBe(0)

    // Move focus off the still-focused editor before ⌘Z: field A's own
    // Tiptap history isn't empty yet (its commit hasn't closed it — none of
    // the three writes has applied), so a ⌘Z while it still has focus is
    // its OWN undo chord to keep (KAN-139: "an input, a select, and a text
    // block that still has history all keep theirs"), not the session step.
    // Every other sequence in this file gets this for free because its
    // last focused editable element (B) is the one that gets unmounted.
    act(() => {
      fieldA.blur()
    })

    // ⌘Z while X is still in flight: `runUndoStep` flushes the pending typed
    // save (queuing it third) and awaits the queue's drain before picking an
    // undo target — so once X is released, all three apply, in order, before
    // the undo itself runs.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    expect(fakeChangeLog.length).toBe(0)
    releaseSaveX()
    // All 3 writes must apply before the chord's own undo can target the
    // last of them — but the undo's own RPC (a 4th change-log record, action
    // `undo`) may land before this check gets a chance to observe exactly 3,
    // since both ride the same `drained()`-then-`undo()` chain. `>=` instead
    // of `===` so the check isn't racing the very thing it unblocks.
    await waitFor(() => expect(fakeChangeLog.length).toBeGreaterThanOrEqual(3))

    const [record1, record2, record3] = fakeChangeLog
    expect(record1.before).toEqual([a, b])
    expect(record1.after).toEqual([{ ...a, content: 'A text one' }, b])
    expect(record2.before).toEqual([{ ...a, content: 'A text one' }, b])
    expect(record2.after).toEqual([{ ...a, content: 'A text one' }])
    expect(record3.before).toEqual([{ ...a, content: 'A text one' }])
    expect(record3.after).toEqual([{ ...a, content: 'A text one two' }])

    // ⌘Z #1 takes back only " two" — the shell's flush enqueued it third, so
    // it's the most recently remembered step. Neither the delete nor the
    // first word is touched: B stays gone.
    await waitFor(() => expect(screen.queryByText('A text one two')).not.toBeInTheDocument())
    expect(screen.getByText('A text one')).toBeInTheDocument()
    expect(screen.queryByText('B text')).not.toBeInTheDocument()

    // ⌘Z #2 brings B back.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
    expect(screen.getByText('A text one')).toBeInTheDocument()

    // ⌘Z #3 takes back " one" — never blocked `page-changed`: each step
    // landed on the state the one before it actually left, so this third
    // step finds its own record exactly where it expects it.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text one')).not.toBeInTheDocument())
    expect(screen.getByText('A text')).toBeInTheDocument()
    expect(screen.getByText('B text')).toBeInTheDocument()

    // ⇧⌘Z ×3 re-applies all three in order.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByText('A text one')).toBeInTheDocument())
    expect(screen.getByText('B text')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    expect(screen.getByText('A text one')).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByText('A text one two')).toBeInTheDocument())
    expect(screen.queryByText('B text')).not.toBeInTheDocument()
  })

  it('reload (PATH_STEPS step 7): remounting for the same page shows exactly the last applied state', async () => {
    // Its own page id: the page-write registry (`page-flush.ts`) is a
    // module-level map this file's beforeEach never clears, and the prior
    // test above leaves `page-1`'s queue HALTED (a rejected save). Reusing
    // `page-1` here would make this test's own first write silently retry
    // that stale halted op first — exactly the cross-test contamination the
    // registry's own design accepts for a real page reload (a save in
    // flight from the page just left finishes in its own queue) but which a
    // fresh `it()` must not inherit. A page id no earlier test in this file
    // has touched gets a brand-new queue instead.
    activeNodeId = 'page-reload'
    fakePage.id = 'page-reload'
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    const { unmount } = renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' extra', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text extra'))

    // ⌘⌫ on B flushes the still-pending typed save and enqueues its own
    // structural op in the same tick — by the time the change log shows both
    // records, the queue has settled and the fake store holds exactly what
    // it applied, nothing more.
    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    await waitFor(() => expect(fakeChangeLog.length).toBe(2))
    await waitFor(() => expect(fakePage.blocks).toEqual([{ ...a, content: 'A text extra' }]))
    const recordCountBeforeReload = fakeChangeLog.length

    unmount()

    // A reload mounts a fresh tree with its own QueryClient — a real refetch
    // of the mocked `getPage`, not a read off the previous mount's cache —
    // and must land on exactly the state the queue actually stored: no write
    // lost (B still gone, A still has its extra word) and none doubled (no
    // record is appended by the remount itself).
    const freshClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={freshClient}>
        <DeletionUndoProvider>
          <ShellCommands />
          <DocumentPanel />
        </DeletionUndoProvider>
      </QueryClientProvider>
    )
    await screen.findByLabelText('Page title')

    expect(await textBlockIn('b-a')).toHaveTextContent('A text extra')
    expect(document.getElementById('block-b-b')).toBeNull()
    expect(screen.queryByText('B text')).not.toBeInTheDocument()
    expect(fakeChangeLog.length).toBe(recordCountBeforeReload)
  })

  // PATH_STEPS' acceptance walk, kept last: the real `DocumentPanel` (which
  // renders `BlockCanvas`) plus `ShellCommands`, driven with userEvent/fireEvent.
  it("person's path: type in A, ⌘⌫ on B within the pause, ⌘Z/⌘Z/⇧⌘Z/⇧⌘Z replay in order", async () => {
    // Its own page id: the earlier tests in this file leave `page-1`'s
    // module-level queue (`page-flush.ts`) halted or mid-sequence, and a
    // fresh `it()` must not inherit that (same reasoning as the reload
    // test's `page-reload` above).
    activeNodeId = 'page-acceptance'
    const a: Block = { id: 'b-a', type: 'text', content: 'A text' }
    const b: Block = { id: 'b-b', type: 'text', content: 'B text' }
    fakePage.id = 'page-acceptance'
    renderPath([a, b])
    await screen.findByLabelText('Page title')

    const fieldA = await textBlockIn('b-a')
    act(() => {
      textEditorOf(fieldA).commands.focus('end')
    })
    await waitFor(() => expect(fieldA).toHaveFocus())
    await userEvent.type(fieldA, ' alpha', { skipClick: true })
    await waitFor(() => expect(fieldA.textContent).toBe('A text alpha'))

    // ⌘⌫ on B lands within the typing's own 600ms pause.
    const fieldB = await textBlockIn('b-b')
    fieldB.focus()
    await waitFor(() => expect(fieldB).toHaveFocus())
    fireEvent.keyDown(fieldB, { key: 'Backspace', metaKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    await waitFor(() => expect(fakeChangeLog.length).toBe(2))

    // ⌘Z at once undoes exactly the delete: B comes back, A's word stays.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.getByText('B text')).toBeInTheDocument())
    expect(screen.getByText('A text alpha')).toBeInTheDocument()

    // ⌘Z again undoes the typing step: A's word goes.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(screen.queryByText('A text alpha')).not.toBeInTheDocument())
    expect(screen.getByText('A text')).toBeInTheDocument()

    // ⇧⌘Z redoes the typing step: A's word is back.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByText('A text alpha')).toBeInTheDocument())

    // A second ⇧⌘Z redoes the delete step: B is gone again, in order.
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true })
    await waitFor(() => expect(screen.queryByText('B text')).not.toBeInTheDocument())
    expect(screen.getByText('A text alpha')).toBeInTheDocument()
  })
})
