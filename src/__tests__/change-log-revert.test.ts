/**
 * Revert-as-new-diff — src/lib/change-log/revert.ts (issue #103, spec #110).
 *
 * The contract this file pins, straight off the design:
 *
 *   - Revert adds a NEW record and never touches the one it reverts. The original
 *     goes `reverted` only when the revert is ACCEPTED, which is why nothing here
 *     advances it: that edge lives inside `accept_revert_record` (0013) and is
 *     proved in change-log-revert.pglite.test.ts against real Postgres.
 *   - "Sets the block back" means the blocks the original touched, not the page.
 *     A whole-page rollback to `record.before` would silently undo every unrelated
 *     edit made since — the test that matters most here.
 *   - "If the block has moved on, the revert arrives outdated" — measured per
 *     block, against the original's own `after`, so an unrelated block changing
 *     does NOT make a revert stale.
 *   - Only `edit` records offer a revert, because they are the only ones carrying
 *     a block snapshot to set back (#146 item 4).
 */

jest.mock('@/lib/change-log/store', () => ({
  ...jest.requireActual('@/lib/change-log/store'),
  appendRecord: jest.fn(),
  advanceStatus: jest.fn(),
  markOutdated: jest.fn(),
}))

import type { Block } from '@/lib/documents/types'
import { appendRecord, advanceStatus, markOutdated } from '@/lib/change-log/store'
import { acceptRevert, proposeRevert } from '@/lib/change-log/revert'
import { listRevertsOf } from '@/lib/change-log/store'
import {
  canRevertRecord,
  jsonEqual,
  planRevert,
  readBlockSnapshot,
  revertRefusal,
  touchedBlockIds,
} from '@/lib/change-log/revert-plan'
import type { ChangeLogAction, ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'

const mockedAppend = appendRecord as jest.MockedFunction<typeof appendRecord>
const mockedAdvance = advanceStatus as jest.MockedFunction<typeof advanceStatus>
const mockedSweep = markOutdated as jest.MockedFunction<typeof markOutdated>

const USER = 'user-1'
const PAGE = 'page-1'

/** A text block, the simplest content module. */
function text(id: string, content: string): Block {
  return { id, type: 'text', content } as Block
}

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: USER,
    workspace: 'main',
    status: 'accepted' as ChangeLogStatus,
    action: 'edit' as ChangeLogAction,
    actor: 'pond',
    targetPageId: PAGE,
    targetBlockId: null,
    before: [text('a', 'one'), text('b', 'two')],
    after: [text('a', 'one'), text('b', 'TWO')],
    sourceThreadId: 'thread-1',
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [{ status: 'accepted', at: '2026-01-01T00:00:00.000Z', actor: 'pond' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    statusAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

/** A chainable PostgREST stand-in whose terminal await yields `result`. */
function fakeSupabase(result: { data?: unknown; error?: unknown }) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const q: any = {}
  for (const method of ['from', 'select', 'eq', 'in', 'order', 'limit']) {
    q[method] = jest.fn(() => q)
  }
  q.then = (onOk: any, onErr: any) => Promise.resolve(result).then(onOk, onErr)
  q.rpc = jest.fn()
  return q as any
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedSweep.mockResolvedValue([])
})

// ── Snapshot reading ─────────────────────────────────────────────────────────

describe('readBlockSnapshot', () => {
  it('accepts a stored array of id-carrying objects', () => {
    expect(readBlockSnapshot([text('a', 'one')])).toHaveLength(1)
  })

  it('rejects a non-array and an array of scalars', () => {
    expect(readBlockSnapshot({ blocks: [] })).toBeNull()
    expect(readBlockSnapshot(null)).toBeNull()
    expect(readBlockSnapshot(['a', 'b'])).toBeNull()
    expect(readBlockSnapshot([{ type: 'text' }])).toBeNull()
  })

  it('does NOT re-validate against the module schema', () => {
    // A snapshot is history: it was written by whatever build was running at
    // propose time. A module that has since gained a required field must still be
    // revertable — throwing the record away over a schema drift loses the diff.
    expect(readBlockSnapshot([{ id: 'x', type: 'text-from-the-future', wat: 1 }])).toHaveLength(1)
  })
})

describe('jsonEqual', () => {
  it('ignores object key order, which JSONB does not preserve', () => {
    // JSON.stringify would call these different, and every revert would then be
    // born `outdated` because every block looked like it had moved on.
    expect(jsonEqual({ id: 'a', type: 'text' }, { type: 'text', id: 'a' })).toBe(true)
  })

  it('separates missing keys from undefined-valued ones and null from absent', () => {
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(jsonEqual({ a: null }, {})).toBe(false)
    expect(jsonEqual([1, 2], [2, 1])).toBe(false)
    expect(jsonEqual(null, undefined)).toBe(false)
  })

  it('compares nested structures', () => {
    expect(jsonEqual({ a: [{ b: 1 }] }, { a: [{ b: 1 }] })).toBe(true)
    expect(jsonEqual({ a: [{ b: 1 }] }, { a: [{ b: 2 }] })).toBe(false)
  })
})

// ── What offers a revert ─────────────────────────────────────────────────────

describe('revertRefusal', () => {
  it('offers a revert on an accepted edit with a real snapshot', () => {
    expect(revertRefusal(record())).toBeNull()
    expect(canRevertRecord(record())).toBe(true)
  })

  it.each<ChangeLogStatus>(['proposed', 'rejected', 'outdated', 'withdrawn', 'undone', 'reverted'])(
    'refuses a %s record — only an accepted change can be reverted',
    (status) => {
      expect(revertRefusal(record({ status }))).toBe('not-accepted')
    }
  )

  it.each<ChangeLogAction>([
    'create_page',
    'define_schema',
    'add_row',
    'promote_table',
    'configure_view',
    'link_records',
  ])('refuses %s — those five store the call, not a block snapshot', (action) => {
    // propose.ts writes `before: null` for them (#146 item 4). There is nothing to
    // set back, so no affordance is offered rather than one that cannot work.
    expect(revertRefusal(record({ action, before: null, after: { pageId: PAGE } }))).toBe(
      'not-a-block-diff'
    )
  })

  it('offers a revert on an accepted REVERT — it is an accepted record like any other', () => {
    // "Any accepted record can be reverted." A revert's before/after are block
    // arrays exactly like an edit's, so the reason the other tools are excluded
    // does not apply to it. accept_revert_record handles the chain (pglite test).
    expect(revertRefusal(record({ action: 'revert', links: { revertOf: 'rec-0' } }))).toBeNull()
  })

  it('refuses a record whose page is gone', () => {
    // target_page_id is ON DELETE SET NULL — the record outlives the page.
    expect(revertRefusal(record({ targetPageId: null }))).toBe('no-target-page')
  })

  it('refuses a record with no usable snapshot', () => {
    expect(revertRefusal(record({ before: null }))).toBe('no-snapshot')
    expect(revertRefusal(record({ after: 'not blocks' }))).toBe('no-snapshot')
  })

  it('refuses a record that altered no blocks', () => {
    const same = [text('a', 'one')]
    expect(revertRefusal(record({ before: same, after: [text('a', 'one')] }))).toBe(
      'nothing-to-revert'
    )
  })

  it('refuses a pure reorder, rather than half-restoring it', () => {
    // Comparison is by id, so a reorder touches no block's content. Declared, not
    // silently half-done: there is no honest way to reimpose an old sequence on a
    // page that has gained and lost blocks since.
    const before = [text('a', 'one'), text('b', 'two')]
    const after = [text('b', 'two'), text('a', 'one')]
    expect(revertRefusal(record({ before, after }))).toBe('nothing-to-revert')
  })
})

describe('touchedBlockIds', () => {
  it('finds updates, creates and deletes, and ignores untouched blocks', () => {
    const before = [text('a', 'one'), text('b', 'two'), text('gone', 'bye')]
    const after = [text('a', 'one'), text('b', 'TWO'), text('new', 'hi')]
    expect(touchedBlockIds(before, after).sort()).toEqual(['b', 'gone', 'new'])
  })
})

// ── The plan ─────────────────────────────────────────────────────────────────

describe('planRevert', () => {
  it('sets an edited block back and leaves untouched blocks exactly where they are', () => {
    const original = record({
      before: [text('a', 'one'), text('b', 'two')],
      after: [text('a', 'one'), text('b', 'TWO')],
    })
    const plan = planRevert(original, [text('a', 'one'), text('b', 'TWO')])

    expect(plan.blocks).toEqual([text('a', 'one'), text('b', 'two')])
    expect(plan.touchedIds).toEqual(['b'])
    expect(plan.movedOn).toBe(false)
    expect(plan.status).toBe('proposed')
  })

  it('KEEPS unrelated blocks added since — it is not a whole-page rollback', () => {
    // The single most important behaviour here. Writing `record.before` back
    // wholesale would delete `c` and `d`, silently undoing work nobody asked to
    // revert. "Sets the block back" is about the blocks the original touched.
    const original = record({
      before: [text('a', 'one'), text('b', 'two')],
      after: [text('a', 'one'), text('b', 'TWO')],
    })
    const current = [text('a', 'one'), text('b', 'TWO'), text('c', 'added later'), text('d', 'too')]

    const plan = planRevert(original, current)

    expect(plan.blocks).toEqual([
      text('a', 'one'),
      text('b', 'two'),
      text('c', 'added later'),
      text('d', 'too'),
    ])
    expect(plan.movedOn).toBe(false)
  })

  it('removes a block the original created', () => {
    const original = record({
      before: [text('a', 'one')],
      after: [text('a', 'one'), text('new', 'from pond')],
    })
    const plan = planRevert(original, [text('a', 'one'), text('new', 'from pond')])

    expect(plan.blocks).toEqual([text('a', 'one')])
  })

  it('brings back a block the original deleted, next to the neighbour it had', () => {
    const original = record({
      before: [text('a', 'one'), text('gone', 'bye'), text('c', 'three')],
      after: [text('a', 'one'), text('c', 'three')],
    })
    const plan = planRevert(original, [text('a', 'one'), text('c', 'three')])

    expect(plan.blocks.map((b) => b.id)).toEqual(['a', 'gone', 'c'])
  })

  it('anchors a restored block to the top when its predecessors are all gone', () => {
    const original = record({
      before: [text('a', 'one'), text('gone', 'bye')],
      after: [text('a', 'one')],
    })
    // `a` has since been deleted by someone else, so there is nothing to anchor to.
    const plan = planRevert(original, [text('z', 'later')])

    expect(plan.blocks.map((b) => b.id)).toEqual(['gone', 'z'])
  })

  it('finds a CREATED block under the id the client actually minted', () => {
    // propose.ts: "the ids minted for CREATED blocks here are provisional: the
    // client mints its own on accept." Seen live on record 86cae7d7 — `after`
    // named block e00ac26c…, the page held the identical block as 36a32c65…. A
    // by-id match would call that "moved on" and the revert could never land,
    // for every block Pond has ever created.
    const original = record({
      before: [],
      after: [text('provisional', 'advance path live check')],
    })
    const plan = planRevert(original, [text('minted-on-accept', 'advance path live check')])

    expect(plan.movedOn).toBe(false)
    expect(plan.status).toBe('proposed')
    // Removed under the id it actually landed as.
    expect(plan.blocks).toEqual([])
  })

  it('matches two identical creates one-to-one, not both to the first block', () => {
    const original = record({
      before: [],
      after: [text('p1', 'same'), text('p2', 'same')],
    })
    const plan = planRevert(original, [text('r1', 'same'), text('r2', 'same'), text('keep', 'x')])

    expect(plan.movedOn).toBe(false)
    expect(plan.blocks).toEqual([text('keep', 'x')])
  })

  it('still calls a created block moved on once its content was edited', () => {
    // Value matching must not become "remove anything vaguely similar".
    const original = record({ before: [], after: [text('provisional', 'as proposed')] })
    const plan = planRevert(original, [text('minted', 'edited since')])

    expect(plan.movedOn).toBe(true)
    expect(plan.blocks).toEqual([text('minted', 'edited since')])
  })

  it('arrives outdated when a touched block has moved on since', () => {
    // "If the block has moved on, the revert arrives outdated and Pond offers a
    // revision" — measured against the original's own `after`, the state it left.
    const original = record({
      before: [text('a', 'one'), text('b', 'two')],
      after: [text('a', 'one'), text('b', 'TWO')],
    })
    const plan = planRevert(original, [text('a', 'one'), text('b', 'THREE')])

    expect(plan.movedOn).toBe(true)
    expect(plan.status).toBe('outdated')
  })

  it('arrives outdated when a touched block was deleted since', () => {
    const original = record({
      before: [text('a', 'one'), text('b', 'two')],
      after: [text('a', 'one'), text('b', 'TWO')],
    })
    const plan = planRevert(original, [text('a', 'one')])

    expect(plan.movedOn).toBe(true)
  })

  it('stays proposed when an UNTOUCHED block changed since — staleness is per block', () => {
    // A page-level freshness check would make every revert outdated the moment
    // anyone typed anywhere on the page. The design says "if the BLOCK has moved
    // on", and `b` has not.
    const original = record({
      before: [text('a', 'one'), text('b', 'two')],
      after: [text('a', 'one'), text('b', 'TWO')],
    })
    const plan = planRevert(original, [text('a', 'EDITED BY HAND'), text('b', 'TWO')])

    expect(plan.movedOn).toBe(false)
    expect(plan.status).toBe('proposed')
    expect(plan.blocks).toEqual([text('a', 'EDITED BY HAND'), text('b', 'two')])
  })

  it('throws rather than guessing when the record offers no revert', () => {
    expect(() => planRevert(record({ status: 'proposed' }), [])).toThrow(/cannot be reverted/)
  })
})

// ── Raising a revert ─────────────────────────────────────────────────────────

describe('proposeRevert', () => {
  it('appends ONE new record, linked back, and never touches the original', async () => {
    const supabase = fakeSupabase({ data: [], error: null })
    const original = record()
    mockedAppend.mockResolvedValue(record({ id: 'rev-1', action: 'revert', status: 'proposed' }))

    await proposeRevert(supabase, {
      userId: USER,
      workspace: 'main',
      record: original,
      current: [text('a', 'one'), text('b', 'TWO')],
    })

    expect(mockedAppend).toHaveBeenCalledTimes(1)
    expect(mockedAppend).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        userId: USER,
        workspace: 'main',
        status: 'proposed',
        action: 'revert',
        // The person asked for it, so it is theirs — unlike a proposal, which is Pond's.
        actor: 'you',
        targetPageId: PAGE,
        links: { revertOf: 'rec-1' },
        // The blocks this sets back — NOT a whole-page array. `a` is untouched by
        // the original, so it is no part of the revert's diff.
        before: [text('b', 'TWO')],
        after: [text('b', 'two')],
        // A button-click revert did not come from the original's thread.
        sourceThreadId: null,
      })
    )
    // "Revert doesn't rewrite history."
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  it('records a diff that stays true after an unrelated edit lands', async () => {
    // The defect this replaced: `after` was the whole page frozen at propose time,
    // while accept re-plans and commits a different array. The record permanently
    // claimed a page state that never existed — and 0011 freezes `after`, so it
    // could never be corrected. Block-scoped, it stays true however the rest of
    // the page moves.
    const supabase = fakeSupabase({ data: [], error: null })
    mockedAppend.mockResolvedValue(record({ id: 'rev-1', action: 'revert' }))

    await proposeRevert(supabase, {
      userId: USER,
      record: record(),
      current: [text('a', 'one'), text('b', 'TWO'), text('z', 'unrelated, added since')],
    })

    const input = mockedAppend.mock.calls[0][1]
    expect(input.before).toEqual([text('b', 'TWO')])
    expect(input.after).toEqual([text('b', 'two')])
  })

  it('records a created block as a removal — before only, no after', async () => {
    const supabase = fakeSupabase({ data: [], error: null })
    mockedAppend.mockResolvedValue(record({ id: 'rev-1', action: 'revert' }))

    await proposeRevert(supabase, {
      userId: USER,
      record: record({ before: [], after: [text('provisional', 'from pond')] }),
      current: [text('minted', 'from pond')],
    })

    const input = mockedAppend.mock.calls[0][1]
    // Under the id it actually landed as, which is the whole point.
    expect(input.before).toEqual([text('minted', 'from pond')])
    expect(input.after).toEqual([])
  })

  it('is born outdated when the block has already moved on', async () => {
    const supabase = fakeSupabase({ data: [], error: null })
    mockedAppend.mockResolvedValue(record({ id: 'rev-1', action: 'revert', status: 'outdated' }))

    await proposeRevert(supabase, {
      userId: USER,
      record: record(),
      current: [text('a', 'one'), text('b', 'MOVED ON')],
    })

    expect(mockedAppend).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ status: 'outdated' })
    )
  })

  it('refuses a second revert while one is still waiting', async () => {
    // Two open reverts of one change would race: accepting both would advance the
    // original twice, and `reverted → reverted` is illegal — so the person would
    // meet the failure at accept time rather than at the click that caused it.
    const supabase = fakeSupabase({
      data: [
        {
          id: 'rev-1',
          user_id: USER,
          workspace: 'main',
          status: 'proposed',
          action: 'revert',
          actor: 'you',
          target_page_id: PAGE,
          target_block_id: null,
          before: null,
          after: null,
          source_thread_id: null,
          tool_call_id: null,
          read: null,
          links: { revert_of: 'rec-1' },
          transitions: [],
          created_at: '2026-01-01T00:00:00.000Z',
          status_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    })

    await expect(
      proposeRevert(supabase, { userId: USER, record: record(), current: [] })
    ).rejects.toThrow(/already has a revert waiting/)
    expect(mockedAppend).not.toHaveBeenCalled()
  })

  it('allows a fresh revert once the previous one was rejected', async () => {
    const supabase = fakeSupabase({
      data: [
        {
          id: 'rev-1',
          user_id: USER,
          workspace: 'main',
          status: 'rejected',
          action: 'revert',
          actor: 'you',
          target_page_id: PAGE,
          target_block_id: null,
          before: null,
          after: null,
          source_thread_id: null,
          tool_call_id: null,
          read: null,
          links: { revert_of: 'rec-1' },
          transitions: [],
          created_at: '2026-01-01T00:00:00.000Z',
          status_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    })
    mockedAppend.mockResolvedValue(record({ id: 'rev-2', action: 'revert' }))

    await proposeRevert(supabase, {
      userId: USER,
      record: record(),
      current: [text('a', 'one'), text('b', 'TWO')],
    })

    expect(mockedAppend).toHaveBeenCalledTimes(1)
  })

  it('refuses outright when the record offers no revert', async () => {
    const supabase = fakeSupabase({ data: [], error: null })
    await expect(
      proposeRevert(supabase, { userId: USER, record: record({ action: 'add_row' }), current: [] })
    ).rejects.toThrow(/cannot be reverted/)
  })
})

describe('listRevertsOf', () => {
  it('raises on a failed query instead of reading it as "no reverts yet"', async () => {
    // Swallowing this would let a second revert be raised over one already
    // waiting, and would blank the record page's `reverted by` field silently.
    const supabase = fakeSupabase({ data: null, error: { message: 'boom' } })
    await expect(listRevertsOf(supabase, { userId: USER, recordId: 'rec-1' })).rejects.toBeTruthy()
  })
})

// ── Answering a revert ───────────────────────────────────────────────────────

describe('acceptRevert', () => {
  const original = record()
  const revert = record({
    id: 'rev-1',
    action: 'revert',
    status: 'proposed',
    actor: 'you',
    links: { revertOf: 'rec-1' },
  })

  it('re-plans against the page NOW, so edits made since are not dropped', async () => {
    const supabase = fakeSupabase({})
    supabase.rpc = jest.fn().mockResolvedValue({
      data: { ...toRow(revert), status: 'accepted' },
      error: null,
    })
    // `c` arrived after the revert was raised; the frozen `after` on the record
    // knows nothing about it. Replaying that array would delete it.
    const current = [text('a', 'one'), text('b', 'TWO'), text('c', 'arrived since')]

    const out = await acceptRevert(supabase, { userId: USER, revert, original, current })

    expect(out.kind).toBe('accepted')
    expect(supabase.rpc).toHaveBeenCalledWith('accept_revert_record', {
      p_record_id: 'rev-1',
      p_blocks: [text('a', 'one'), text('b', 'two'), text('c', 'arrived since')],
      // The compare-and-swap: what the plan was computed against.
      p_expected: current,
      p_actor: 'you',
    })
  })

  it('withdraws accept and goes outdated when the block moved on, writing nothing', async () => {
    const supabase = fakeSupabase({})
    supabase.rpc = jest.fn()
    mockedAdvance.mockResolvedValue(record({ id: 'rev-1', action: 'revert', status: 'outdated' }))

    const out = await acceptRevert(supabase, {
      userId: USER,
      revert,
      original,
      current: [text('a', 'one'), text('b', 'MOVED ON')],
    })

    expect(out.kind).toBe('outdated')
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rev-1', 'outdated', 'you')
  })

  it('sweeps the page’s other block diffs once the revert lands', async () => {
    const supabase = fakeSupabase({})
    supabase.rpc = jest
      .fn()
      .mockResolvedValue({ data: { ...toRow(revert), status: 'accepted' }, error: null })

    await acceptRevert(supabase, {
      userId: USER,
      revert,
      original,
      current: [text('a', 'one'), text('b', 'TWO')],
    })

    expect(mockedSweep).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        targetPageId: PAGE,
        exceptId: 'rev-1',
        // A revert is a block diff exactly like an edit, so both go stale together.
        actions: ['edit', 'revert'],
      })
    )
  })

  it('does not report a failed accept when only the sweep throws', async () => {
    // The page is already written by then. Letting this escape would re-arm the
    // card over a decision that has landed.
    const supabase = fakeSupabase({})
    supabase.rpc = jest
      .fn()
      .mockResolvedValue({ data: { ...toRow(revert), status: 'accepted' }, error: null })
    mockedSweep.mockRejectedValue(new Error('sweep down'))
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {})

    const out = await acceptRevert(supabase, {
      userId: USER,
      revert,
      original,
      current: [text('a', 'one'), text('b', 'TWO')],
    })

    expect(out.kind).toBe('accepted')
    quiet.mockRestore()
  })

  it('surfaces an RPC failure rather than claiming the revert landed', async () => {
    const supabase = fakeSupabase({})
    supabase.rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'conflict' } })

    await expect(
      acceptRevert(supabase, {
        userId: USER,
        revert,
        original,
        current: [text('a', 'one'), text('b', 'TWO')],
      })
    ).rejects.toBeTruthy()
    expect(mockedSweep).not.toHaveBeenCalled()
  })
})

/** The record → row shape the RPC returns. */
function toRow(r: ChangeLogRecord) {
  return {
    id: r.id,
    user_id: r.userId,
    workspace: r.workspace,
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
    links: {},
    transitions: [],
    created_at: r.createdAt,
    status_at: r.statusAt,
  }
}
