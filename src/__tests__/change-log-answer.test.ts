/**
 * Answering a proposed-view card with no mounted thread — src/lib/change-log/answer.ts.
 *
 * `AITerminal.tsx`'s accept/reject work from `useChat`'s live batch state; a card
 * in the proposed view has only the settled record, and that record's own
 * `after` is a whole-page snapshot frozen at propose time. A block accept must
 * NOT replay it verbatim: a sibling card accepted first, or a hand edit, can
 * leave the live page holding more than the record knows about, and writing
 * `after` over it would silently destroy whichever of the two landed last. This
 * pins that the block path re-reads the record and the page fresh under the
 * page's write lock, derives the diff from before→after by block id, and
 * applies it onto the LIVE blocks through `acceptRecord` (the atomic RPC) only
 * — never a plain save. It also pins the `add_row` path and reject, unchanged.
 */

jest.mock('@/lib/pages/accept', () => ({
  // Isolate the diff/refusal logic from the real page-write queue; the queue
  // itself is pinned in accept-changes.test.ts.
  withPageWriteLock: (_pageId: string, run: () => Promise<unknown>) => run(),
}))
jest.mock('@/lib/change-log/resolve', () => ({
  refusalForAccept: jest.requireActual('@/lib/change-log/resolve').refusalForAccept,
}))
jest.mock('@/lib/change-log/store', () => ({
  advanceStatus: jest.fn(),
  getRecord: jest.fn(),
  acceptRecord: jest.fn(),
  markOutdated: jest.fn(),
}))
jest.mock('@/lib/pages/create-page', () => ({ addRowFromProposal: jest.fn() }))
jest.mock('@/lib/pages/client', () => ({ getPage: jest.fn() }))
jest.mock('@/lib/change-log/revert', () => ({ acceptRevert: jest.fn() }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/documents/types'
import { advanceStatus, getRecord, acceptRecord, markOutdated } from '@/lib/change-log/store'
import { addRowFromProposal } from '@/lib/pages/create-page'
import { getPage } from '@/lib/pages/client'
import { acceptRevert } from '@/lib/change-log/revert'
import { acceptRecordFromLog, rejectRecordFromLog } from '@/lib/change-log/answer'
import type { ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'

const mockedAdvance = advanceStatus as jest.MockedFunction<typeof advanceStatus>
const mockedGetRecord = getRecord as jest.MockedFunction<typeof getRecord>
const mockedAcceptRecord = acceptRecord as jest.MockedFunction<typeof acceptRecord>
const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>
const mockedAddRow = addRowFromProposal as jest.MockedFunction<typeof addRowFromProposal>
const mockedGetPage = getPage as jest.MockedFunction<typeof getPage>
const mockedAcceptRevert = acceptRevert as jest.MockedFunction<typeof acceptRevert>

const supabase = {} as SupabaseClient<Database>
const USER = 'user-1'

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: USER,
    pondId: 'pond-1',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: [{ id: 'b1', type: 'text', content: 'kiwi' }],
    after: [{ id: 'b1', type: 'text', content: 'fig' }],
    sourceThreadId: null,
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [{ status: 'proposed', at: '2026-01-01T00:00:00.000Z', actor: 'pond' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    statusAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function advancedTo(status: ChangeLogStatus, over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return record({ status, ...over })
}

function page(blocks: Block[]): Awaited<ReturnType<typeof getPage>> {
  return { id: 'page-1', blocks } as unknown as Awaited<ReturnType<typeof getPage>>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedAdvance.mockImplementation(async (_sb, id, to) => advancedTo(to, { id }))
  mockedMarkOutdated.mockResolvedValue([])
  mockedAddRow.mockResolvedValue({ id: 'row-1' } as unknown as Awaited<
    ReturnType<typeof addRowFromProposal>
  >)
  // The re-embed fire-and-forget fetch after a successful accept — not under
  // test here (it self-swallows its own errors).
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
})

describe('acceptRecordFromLog — block edit/revert', () => {
  it('derives the diff against the LIVE page and writes through the atomic RPC, not `after` verbatim', async () => {
    const r = record()
    mockedGetRecord.mockResolvedValue(r)
    mockedGetPage.mockResolvedValue(page(r.before as Block[]))
    mockedAcceptRecord.mockResolvedValue(advancedTo('accepted'))

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toMatchObject({
      refused: false,
      record: { status: 'accepted' },
      undoRecordId: 'rec-1',
    })
    expect(mockedAcceptRecord).toHaveBeenCalledWith(supabase, 'rec-1', [
      { id: 'b1', type: 'text', content: 'fig' },
    ])
    expect(mockedMarkOutdated).toHaveBeenCalledWith(supabase, {
      userId: USER,
      pondId: 'pond-1',
      targetPageId: 'page-1',
      exceptId: 'rec-1',
      actions: ['edit', 'revert'],
    })
  })

  it('keeps a sibling card’s already-accepted edit — accepting B after A merges onto A’s write, not A’s', async () => {
    // Two records, frozen at the SAME propose time, each touching a different
    // block on the same page: A edits `x`, B edits `y`. Both carry the
    // PRE-A page in their own before/after — that is what "frozen at propose
    // time" means. The old code wrote B's `after` verbatim and would have
    // reverted A's edit to `x` right back to its pre-A content.
    const a = record({
      id: 'rec-a',
      before: [
        { id: 'x', type: 'text', content: 'x-old' },
        { id: 'y', type: 'text', content: 'y-old' },
      ],
      after: [
        { id: 'x', type: 'text', content: 'x-new' },
        { id: 'y', type: 'text', content: 'y-old' },
      ],
    })
    const b = record({
      id: 'rec-b',
      before: [
        { id: 'x', type: 'text', content: 'x-old' },
        { id: 'y', type: 'text', content: 'y-old' },
      ],
      after: [
        { id: 'x', type: 'text', content: 'x-old' },
        { id: 'y', type: 'text', content: 'y-new' },
      ],
    })

    mockedGetRecord.mockResolvedValueOnce(a)
    mockedGetPage.mockResolvedValueOnce(page(a.before as Block[]))
    mockedAcceptRecord.mockResolvedValueOnce(advancedTo('accepted', { id: 'rec-a' }))

    const outcomeA = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: a })
    expect(outcomeA.refused).toBe(false)

    // B's own fresh read is still `proposed` (no sweep in this scenario — this
    // test is specifically about the MERGE, not the outdated-refusal path
    // pinned separately below) — but the live page now carries A's write.
    mockedGetRecord.mockResolvedValueOnce(b)
    mockedGetPage.mockResolvedValueOnce(
      page([
        { id: 'x', type: 'text', content: 'x-new' },
        { id: 'y', type: 'text', content: 'y-old' },
      ])
    )
    mockedAcceptRecord.mockResolvedValueOnce(advancedTo('accepted', { id: 'rec-b' }))

    const outcomeB = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: b })

    expect(outcomeB.refused).toBe(false)
    expect(mockedAcceptRecord).toHaveBeenLastCalledWith(supabase, 'rec-b', [
      { id: 'x', type: 'text', content: 'x-new' },
      { id: 'y', type: 'text', content: 'y-new' },
    ])
  })

  it('keeps a hand edit to an untouched block — merges onto it rather than replaying the frozen snapshot', async () => {
    const r = record({
      before: [
        { id: 'b1', type: 'text', content: 'kiwi' },
        { id: 'b2', type: 'text', content: 'plain' },
      ],
      after: [
        { id: 'b1', type: 'text', content: 'fig' },
        { id: 'b2', type: 'text', content: 'plain' },
      ],
    })
    mockedGetRecord.mockResolvedValue(r)
    // `b2` was hand-edited since this record was proposed; `b1` (what this
    // record touches) has not moved.
    mockedGetPage.mockResolvedValue(
      page([
        { id: 'b1', type: 'text', content: 'kiwi' },
        { id: 'b2', type: 'text', content: 'hand-edited' },
      ])
    )
    mockedAcceptRecord.mockResolvedValue(advancedTo('accepted'))

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome.refused).toBe(false)
    expect(mockedAcceptRecord).toHaveBeenCalledWith(supabase, 'rec-1', [
      { id: 'b1', type: 'text', content: 'fig' },
      { id: 'b2', type: 'text', content: 'hand-edited' },
    ])
  })

  it('refuses — writing nothing — when a record went outdated server-side since the card last fetched', async () => {
    const r = record() // the caller's cached copy still reads `proposed`
    mockedGetRecord.mockResolvedValue(record({ status: 'outdated' }))

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({
      refused: true,
      reason: 'this proposal is out of date — ask Pond to revise it',
    })
    expect(mockedGetPage).not.toHaveBeenCalled()
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })

  it('refuses when the touched block itself no longer matches its `before` — never falls back to a plain save', async () => {
    const r = record()
    mockedGetRecord.mockResolvedValue(r)
    // `b1` (the one this record touches) was itself changed by something else
    // since propose — its live content no longer equals `before`.
    mockedGetPage.mockResolvedValue(page([{ id: 'b1', type: 'text', content: 'someone else typed this' }]))

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({ refused: true, reason: 'the page changed since this was proposed' })
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })

  it('writes nothing when the atomic RPC itself refuses — no fallback save of the stale snapshot', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = record()
    mockedGetRecord.mockResolvedValue(r)
    mockedGetPage.mockResolvedValue(page(r.before as Block[]))
    // `22023` is `accept_change_log_record`'s own compare-and-swap refusal —
    // the record is no longer `proposed` underneath this write.
    mockedAcceptRecord.mockRejectedValue({ code: '22023', message: 'record is outdated' })

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({ refused: true, reason: 'the page changed since this was proposed' })
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('maps an unexpected RPC failure through the shared person-facing text, not the race wording', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = record()
    mockedGetRecord.mockResolvedValue(r)
    mockedGetPage.mockResolvedValue(page(r.before as Block[]))
    mockedAcceptRecord.mockRejectedValue(new Error('network blip'))

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({ refused: true, reason: 'that did not work' })
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('refuses an already-settled record from the caller’s own cached copy, before reading anything', async () => {
    const r = record({ status: 'accepted' })

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({ refused: true, reason: 'this proposal has already been decided' })
    expect(mockedGetRecord).not.toHaveBeenCalled()
  })
})

describe('acceptRecordFromLog — add_row', () => {
  it('re-reads the record, adds the row, and advances it to accepted', async () => {
    const r = record({
      action: 'add_row',
      before: null,
      after: { collectionId: 'coll-1', title: 'Dune', props: { Status: 'Reading' } },
    })
    mockedGetRecord.mockResolvedValue(r)

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(mockedGetRecord).toHaveBeenCalledWith(supabase, 'rec-1')
    expect(outcome).toMatchObject({ refused: false, record: { status: 'accepted' }, undoRecordId: null })
    expect(mockedAddRow).toHaveBeenCalledWith(
      supabase,
      { collectionId: 'coll-1', title: 'Dune', props: { Status: 'Reading' } },
      'pond-1'
    )
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'accepted', 'you')
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
  })

  it('refuses — writing no row — when a stale card’s add_row was already accepted elsewhere', async () => {
    const r = record({
      action: 'add_row',
      before: null,
      after: { collectionId: 'coll-1', title: 'Dune', props: { Status: 'Reading' } },
    })
    // The caller's own cached copy still reads `proposed`; the fresh read
    // (taken immediately before writing) shows it already settled.
    mockedGetRecord.mockResolvedValue(record({ ...r, status: 'accepted' }))

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({ refused: true, reason: 'this proposal has already been decided' })
    expect(mockedAddRow).not.toHaveBeenCalled()
    expect(mockedAdvance).not.toHaveBeenCalled()
  })
})

describe('acceptRecordFromLog — revert', () => {
  it('routes through acceptRevert (0013) so the original is marked reverted — not acceptRecord, which only advances the revert itself', async () => {
    const r = record({ id: 'rec-revert', action: 'revert', links: { revertOf: 'rec-original' } })
    mockedGetPage.mockResolvedValue(page(r.before as Block[]))
    mockedAcceptRevert.mockResolvedValue({
      kind: 'accepted',
      revert: advancedTo('accepted', { id: 'rec-revert', action: 'revert' }),
    })

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(mockedAcceptRevert).toHaveBeenCalledWith(supabase, {
      userId: USER,
      pondId: 'pond-1',
      revert: r,
      current: r.before,
    })
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ refused: false, record: { id: 'rec-revert', status: 'accepted' } })
  })

  it('refuses when the revert has gone outdated against the live page — writes nothing', async () => {
    const r = record({ id: 'rec-revert', action: 'revert', links: { revertOf: 'rec-original' } })
    mockedGetPage.mockResolvedValue(page(r.before as Block[]))
    mockedAcceptRevert.mockResolvedValue({
      kind: 'outdated',
      revert: advancedTo('outdated', { id: 'rec-revert', action: 'revert' }),
    })

    const outcome = await acceptRecordFromLog(supabase, { userId: USER, pondId: 'pond-1', record: r })

    expect(outcome).toEqual({ refused: true, reason: 'the page changed since this was proposed' })
  })
})

describe('rejectRecordFromLog', () => {
  it('advances an open record to rejected', async () => {
    const r = record({ status: 'proposed' })

    const out = await rejectRecordFromLog(supabase, r)

    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'rejected', 'you')
    expect(out.status).toBe('rejected')
  })

  it('advances an outdated record to rejected — its accept is withdrawn, but reject still clears the card', async () => {
    const r = record({ status: 'outdated' })

    const out = await rejectRecordFromLog(supabase, r)

    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'rejected', 'you')
    expect(out.status).toBe('rejected')
  })

  it('no-ops on an already-settled record', async () => {
    const r = record({ status: 'rejected' })

    const out = await rejectRecordFromLog(supabase, r)

    expect(mockedAdvance).not.toHaveBeenCalled()
    expect(out).toBe(r)
  })
})
