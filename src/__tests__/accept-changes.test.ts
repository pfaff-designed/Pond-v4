/**
 * Tests for the propose_changes accept path (src/lib/pages/accept.ts).
 *
 * BUG 1/2 fix (build-brief propose-changes-target): an accepted batch commits to
 * the page stamped at proposal time — not to whatever node happens to be open —
 * and when that target is missing (no stamp + no open node) or deleted, every
 * change counts as skipped so the card and the model both learn nothing landed.
 * Mirrors the mocked-dep approach in create-page-from-proposal.test.ts.
 */

jest.mock('@/lib/pages/client', () => ({ getPage: jest.fn() }))
jest.mock('@/lib/pages/commit', () => ({
  commitBlocks: jest.fn(),
  propagateBlockWrite: jest.fn(),
}))
jest.mock('@/lib/change-log/store', () => ({
  getRecordByToolCall: jest.fn(),
  acceptRecord: jest.fn(),
  advanceStatus: jest.fn(),
  markOutdated: jest.fn(),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/supabase/types'
import { getPage } from '@/lib/pages/client'
import { commitBlocks, propagateBlockWrite } from '@/lib/pages/commit'
import {
  getRecordByToolCall,
  acceptRecord,
  advanceStatus,
  markOutdated,
} from '@/lib/change-log/store'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { emptyResolutions, type ConversationResolutions } from '@/lib/conversation/resolutions'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import { applyProposedChanges } from '@/lib/pages/edits'
import { createDeterministicMintId } from '@/lib/change-log/mint-id'

const mockedGetPage = getPage as jest.MockedFunction<typeof getPage>
const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
const mockedPropagate = propagateBlockWrite as jest.MockedFunction<typeof propagateBlockWrite>
const mockedLookup = getRecordByToolCall as jest.MockedFunction<typeof getRecordByToolCall>
const mockedAcceptRecord = acceptRecord as jest.MockedFunction<typeof acceptRecord>
const mockedAdvance = advanceStatus as jest.MockedFunction<typeof advanceStatus>
const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>

const USER = 'user-1'

/** A logged proposal for tool call `pc1`, aimed at the stamped target page. */
function logRecord(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: USER,
    pondId: 'pond-1',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'stamped-id',
    targetBlockId: null,
    before: [],
    after: [],
    sourceThreadId: null,
    toolCallId: 'pc1',
    read: null,
    links: {},
    transitions: [{ status: 'proposed', at: '2026-01-01T00:00:00.000Z', actor: 'pond' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    statusAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const supabase = {} as SupabaseClient<Database>
const invalidateQueries = jest.fn()
const queryClient = { invalidateQueries } as unknown as QueryClient

const changes: ModuleChange[] = [
  { op: 'create', data: { type: 'text', content: 'hello' } } as ModuleChange,
]

function stamped(toolCallId: string, nodeId: string): ConversationResolutions {
  return {
    ...emptyResolutions(),
    targets: { [toolCallId]: { nodeId, nodeName: 'Garage' } },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default: this tool call has no change-log record, so the accept degrades to
  // the plain commit path — which is what every test written before the log
  // existed is asserting.
  mockedLookup.mockResolvedValue(null)
  mockedMarkOutdated.mockResolvedValue([])
  mockedGetPage.mockResolvedValue({
    id: 'stamped-id',
    blocks: [],
  } as unknown as Awaited<ReturnType<typeof getPage>>)
})

describe('writeAcceptedChanges', () => {
  it('commits to the stamped target, not the open node', async () => {
    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: 'somewhere-else',
      changes,
    })
    expect(result.skipped).toBe(0)
    // Fix-1 (F1a+F12): the honest receipt shape — applied count and target id.
    expect(result.applied).toBe(changes.length)
    expect(result.targetId).toBe('stamped-id')
    expect(result.skippedReasons).toEqual([])
    expect(mockedGetPage).toHaveBeenCalledWith(supabase, 'stamped-id')
    expect(mockedCommitBlocks).toHaveBeenCalledWith(
      supabase,
      queryClient,
      'stamped-id',
      expect.any(Array)
    )
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'stamped-id'] })
  })

  it('falls back to the open node for an unstamped (legacy) card', async () => {
    await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: emptyResolutions(),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes,
    })
    expect(mockedGetPage).toHaveBeenCalledWith(supabase, 'open-id')
    expect(mockedCommitBlocks).toHaveBeenCalledWith(supabase, queryClient, 'open-id', [
      expect.objectContaining({ type: 'text', content: 'hello' }),
    ])
  })

  it('no stamp and no open node → every change skipped (defence only — the card guard above must never let accept reach this)', async () => {
    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: emptyResolutions(),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })
    expect(result.skipped).toBe(changes.length)
    // Fix-1 (F1a): every skip carries a human reason for the card notice.
    expect(result.applied).toBe(0)
    expect(result.targetId).toBeNull()
    expect(result.skippedReasons).toEqual(['no target page to write to'])
    expect(mockedGetPage).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
  })

  it('deleted target page → every change skipped, nothing written', async () => {
    mockedGetPage.mockResolvedValue(null)
    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'gone-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes,
    })
    expect(result.skipped).toBe(changes.length)
    expect(result.skippedReasons).toEqual(['the target page no longer exists'])
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
  })

  it('cross-page edit resolves block ids against the TARGET page, not the open one (ticket-30)', async () => {
    // The open page and the target page have DIFFERENT blocks. An edit references a
    // block id that exists only on the TARGET page; it must resolve there (applied),
    // and commit to the target — proving the accept reads the stamped target's blocks.
    mockedGetPage.mockImplementation(async (_sb, id) => {
      if (id === 'ceramics-id') {
        return {
          id: 'ceramics-id',
          blocks: [{ id: 'blk-target', type: 'text', content: 'old plan' }],
        } as unknown as Awaited<ReturnType<typeof getPage>>
      }
      // The open page has an unrelated block — an edit to blk-target must NOT match here.
      return {
        id: 'open-id',
        blocks: [{ id: 'blk-open', type: 'text', content: 'something else' }],
      } as unknown as Awaited<ReturnType<typeof getPage>>
    })

    const editChanges: ModuleChange[] = [
      { op: 'edit', blockId: 'blk-target', data: { type: 'text', content: 'new plan' } },
    ] as ModuleChange[]

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'ceramics-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id', // user is elsewhere
      changes: editChanges,
    })

    // The edit's block id exists on the target, so nothing is skipped, and the write
    // lands on the target page's block array (with the edit applied).
    expect(result.skipped).toBe(0)
    expect(mockedGetPage).toHaveBeenCalledWith(supabase, 'ceramics-id')
    expect(mockedCommitBlocks).toHaveBeenCalledWith(supabase, queryClient, 'ceramics-id', [
      expect.objectContaining({ id: 'blk-target', type: 'text', content: 'new plan' }),
    ])
    // The target page's cache is invalidated so it is fresh when the user visits.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['page', 'ceramics-id'] })
  })

  it('cross-page edit whose block id is absent on the target is skipped (never wrong-page write)', async () => {
    // Edit references a block that lives on the OPEN page but not the stamped TARGET —
    // it must be skipped, not silently applied to the wrong block.
    mockedGetPage.mockResolvedValue({
      id: 'ceramics-id',
      blocks: [{ id: 'blk-target', type: 'text', content: 'plan' }],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'ceramics-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes: [
        { op: 'edit', blockId: 'blk-open', data: { type: 'text', content: 'x' } },
      ] as ModuleChange[],
    })
    expect(result.skipped).toBe(1)
    expect(result.skippedReasons).toEqual(['the block to edit no longer exists on the page'])
  })

  it('a create that fails validation is skipped WITH a reason, others still land (Fix-1)', async () => {
    // One good create + one whose data fails blockSchema at hydrate time. The
    // good one applies; the bad one reports "failed validation" so the card and
    // the receipt can both be honest about what did NOT land.
    const mixed: ModuleChange[] = [
      { op: 'create', data: { type: 'text', content: 'good' } },
      { op: 'create', data: { type: 'todo', items: 'not-an-array' } },
    ] as unknown as ModuleChange[]
    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes: mixed,
    })
    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.skippedReasons).toEqual(['the proposed todo failed validation'])
    expect(result.targetId).toBe('stamped-id')
    // The good block still committed.
    const blocks = mockedCommitBlocks.mock.calls[0][3] as Array<Record<string, unknown>>
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'text', content: 'good' })
  })

  it('a missing-target stamp skips a CREATE op — never appends to the open page (ticket-30 review)', async () => {
    // The batch named a target page that does not exist (deleted / hallucinated
    // id) and was stamped `missing`. Edits/removes would fail the block-id gate
    // anyway, but a CREATE has no gate — without the missing stamp it would
    // silently append to whatever page is open.
    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: {
        ...emptyResolutions(),
        targets: { pc1: { nodeId: 'gone-id', nodeName: '', missing: true } },
      },
      toolCallId: 'pc1',
      openNodeId: 'open-id', // a page IS open — it must not receive the write
      changes, // a create op
    })
    expect(result.skipped).toBe(changes.length)
    expect(mockedGetPage).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
  })

  // #111 deleted the `metric` block, the only module that ever consumed a same-batch
  // `source.ref`. The case that used to sit here — a keyed checklist plus a metric
  // ref'ing it, resolving inside a CROSS-PAGE proposal — asserted behaviour that no
  // longer exists, so it is gone rather than re-pointed at a type that cannot bind.
  // The resolver itself is still unit-pinned in `same-batch-refs.test.ts`.

  it('an empty accepted batch is a no-op', async () => {
    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes: [],
    })
    expect(result.skipped).toBe(0)
    expect(mockedGetPage).not.toHaveBeenCalled()
  })
})

// ── Advancing the change-log record (#146 item 1, spec #110 criteria 3 + 5) ──
//
// Before this, every record the propose path wrote stayed `proposed` forever:
// accept committed the page and never touched the log, so the log's own headline
// figure counted proposals the person had already accepted.

describe('writeAcceptedChanges — the change-log record', () => {
  it('commits the page and advances the record in ONE call, never a bare write', async () => {
    mockedLookup.mockResolvedValue(logRecord())
    mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted' }))

    await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    // Criterion 3: never an accepted record without the committed block, nor a
    // committed block without the record. Two round trips cannot promise that,
    // so the page write rides inside accept_change_log_record.
    expect(mockedAcceptRecord).toHaveBeenCalledWith(supabase, 'rec-1', expect.any(Array))
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
    // The RPC writes pages.blocks and nothing else, so the propagation half of
    // commitBlocks — rail refresh + re-embed — still has to run.
    expect(mockedPropagate).toHaveBeenCalledWith(queryClient, 'stamped-id')
  })

  it('writes the page the person chose, not the one the record froze', async () => {
    // A record's target_page_id is stamped at propose time and frozen by the
    // append-only trigger, but the person can correct the target before accepting
    // (ticket-30). accept_change_log_record commits to the RECORD's page, so using
    // it here would write to a page they had already redirected away from.
    mockedLookup.mockResolvedValue(logRecord({ targetPageId: 'a-page-they-redirected-from' }))
    mockedAdvance.mockResolvedValue(logRecord({ status: 'accepted' }))

    await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).toHaveBeenCalledWith(
      supabase,
      queryClient,
      'stamped-id',
      expect.any(Array)
    )
    // The record still advances — it just loses the shared transaction, and goes
    // on naming a page nothing was written to (#146 item 5).
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'accepted', 'you')
  })

  it('lets a second accept click through without re-advancing the record', async () => {
    // Accepting is per-change: the card calls this once per click with a subset of
    // the batch, so the record is already `accepted` by the second click. The RPC
    // raises on anything but a proposed record, and accepted → accepted is an
    // illegal edge, so both write paths have to step aside — while the blocks from
    // this click still have to land.
    mockedLookup.mockResolvedValue(logRecord({ status: 'accepted' }))

    await expect(
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc1', 'stamped-id'),
        toolCallId: 'pc1',
        openNodeId: null,
        changes,
      })
    ).resolves.toMatchObject({ applied: changes.length })

    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedAdvance).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
  })

  it('sweeps the page’s other proposals to outdated, never itself', async () => {
    // Criterion 5 / G2: the other proposals on this page were written against a
    // state that no longer exists, so their accept affordance has to go and revise
    // is offered instead. The sweep is whole-page because no record carries a
    // target_block_id yet (#146 item 2) — every record is page-level, and
    // markOutdated already treats a page-level proposal as stale on any page write.
    mockedLookup.mockResolvedValue(logRecord())
    mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted' }))

    await writeAcceptedChanges({
      supabase,
      queryClient,
      userId: USER,
      pondId: 'pond-2',
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(mockedMarkOutdated).toHaveBeenCalledWith(supabase, {
      userId: USER,
      pondId: 'pond-2',
      targetPageId: 'stamped-id',
      exceptId: 'rec-1',
      // Only block diffs. A pending add_row on this page is untouched by a block
      // write and stays applicable, so the sweep must not reach it — but a pending
      // `revert` (#103) IS a block diff, and goes stale with the edits.
      actions: ['edit', 'revert'],
    })
  })

  it('keeps the accept when the sweep fails — the blocks are already committed', async () => {
    // markOutdated runs AFTER the page write has landed, and it raises on a failed
    // query by design. Letting that out of here would tell the card the accept
    // failed and re-arm it, when the person's edit is on the page.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedLookup.mockResolvedValue(logRecord())
    mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted' }))
    mockedMarkOutdated.mockRejectedValue(new Error('sweep query failed'))

    await expect(
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc1', 'stamped-id'),
        toolCallId: 'pc1',
        openNodeId: null,
        changes,
      })
    ).resolves.toMatchObject({ applied: changes.length, targetId: 'stamped-id' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('applies the edit even when the record cannot be read at all', async () => {
    // Refusing here would be SAFE — nothing has been written yet — but it would
    // also decline to apply an edit the person accepted because a side-record
    // query was unavailable. The edit wins; the log takes the loss, loudly.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedLookup.mockRejectedValue(new Error('offline'))

    await expect(
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc1', 'stamped-id'),
        toolCallId: 'pc1',
        openNodeId: null,
        changes,
      })
    ).resolves.toMatchObject({ applied: changes.length })

    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('touches the log not at all when there is no signed-in user', async () => {
    // `userId` is nullable rather than absent so a caller has to say which case it
    // is. No session means no pond to scope a record to — and the write below
    // fails on its own merits, exactly as it did before the log existed.
    await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: null,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(mockedLookup).not.toHaveBeenCalled()
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
  })

  it('never stamps `accepted` when nothing actually landed', async () => {
    // Every change skipped ⇒ the page's blocks come back unchanged. Advancing the
    // record here would put an `accepted` on a diff that was never applied, and
    // the log only grows, so that lie could never be taken back. Criterion 3:
    // "never an accepted record without the committed block."
    mockedLookup.mockResolvedValue(logRecord({ targetPageId: 'ceramics-id' }))
    mockedGetPage.mockResolvedValue({
      id: 'ceramics-id',
      blocks: [{ id: 'blk-target', type: 'text', content: 'plan' }],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'ceramics-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes: [
        { op: 'edit', blockId: 'blk-open', data: { type: 'text', content: 'x' } },
      ] as ModuleChange[],
    })

    expect(result.applied).toBe(0)
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedAdvance).not.toHaveBeenCalled()
    // The page did not move on either, so nothing else on it went stale.
    expect(mockedMarkOutdated).not.toHaveBeenCalled()
  })

  it('refuses to apply a proposal the log has already outdated', async () => {
    // Criterion 5 withdraws the accept affordance from an outdated record and
    // offers revise instead. No card reads the log yet (#147), so the button is
    // still live — enforcing it here is what stops a stale diff being written to a
    // page that has moved on, leaving the log permanently disagreeing with itself.
    mockedLookup.mockResolvedValue(logRecord({ status: 'outdated' }))

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(changes.length)
    expect(result.skippedReasons[0]).toMatch(/out of date/i)
    expect(result.targetId).toBeNull()
    // Nothing written, nothing advanced, nothing swept.
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  it('still writes a second accept click on an already-accepted record', async () => {
    // The mirror of the test above: `accepted` is NOT stale. Accepting is per
    // change, so the record is already accepted by the second click and those
    // blocks still have to land.
    mockedLookup.mockResolvedValue(logRecord({ status: 'accepted' }))

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
  })

  it('lands the edit anyway when the atomic accept raises', async () => {
    // The RPC refuses anything but a `proposed` record, so a record swept
    // `outdated` between the read and the call makes it raise. It is all-or-nothing,
    // so nothing was written — and the person's accepted edit must not be lost to a
    // race in a side-record. It falls back to the ordinary commit.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedLookup.mockResolvedValue(logRecord())
    mockedAcceptRecord.mockRejectedValue(new Error('record is outdated'))

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('keeps the accept when the retargeted advance raises after the commit', async () => {
    // The blocks are already in by this point. Letting the advance's failure escape
    // would report a failed accept for an edit that is on the page — and there is
    // no try/catch around the caller, so it would surface as an unhandled rejection
    // with no receipt at all.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedLookup.mockResolvedValue(logRecord({ targetPageId: 'somewhere-else' }))
    mockedAdvance.mockRejectedValue(new Error('illegal transition'))

    await expect(
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc1', 'stamped-id'),
        toolCallId: 'pc1',
        openNodeId: null,
        changes,
      })
    ).resolves.toMatchObject({ applied: changes.length, targetId: 'stamped-id' })

    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('still applies an accepted change after a SIBLING change was rejected', async () => {
    // One record per tool call, but the card decides per change: rejecting change 0
    // advances the single record to `rejected`, and accepting change 1 afterwards
    // must still write. Only `outdated` withdraws the accept affordance — #110
    // criterion 5 is about "a proposed record whose target block is changed by a
    // later accepted diff", not about a batch one of whose changes was declined.
    mockedLookup.mockResolvedValue(logRecord({ status: 'rejected' }))

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(mockedCommitBlocks).toHaveBeenCalledTimes(1)
    // Settled for good, so nothing to advance — but the blocks still land.
    expect(mockedAdvance).not.toHaveBeenCalled()
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
  })

  it('does not re-save the page when the post-RPC propagation fails', async () => {
    // acceptRecord has already committed the blocks. A propagation failure must not
    // fall through to the ordinary commit — that would re-save what the RPC wrote,
    // and if the re-save threw, the error would escape after the blocks had landed.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedLookup.mockResolvedValue(logRecord())
    mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted' }))
    mockedPropagate.mockRejectedValue(new Error('invalidate failed'))

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  const recordIdCases: Array<[string, ModuleChange[], Block[]]> = [
    ['create', changes, []],
    [
      // edits.ts's edit branch builds `{ ...hydrated, width: target.width }`
      // unconditionally — a block with no width gives the written blocks an own
      // `width: undefined` key that jsonb never stores, so this is the case
      // `jsonEqual`'s key-count check used to miss (KAN-93 fix).
      'edit',
      [{ op: 'edit', blockId: 'blk-1', data: { type: 'text', content: 'new' } }] as ModuleChange[],
      [{ id: 'blk-1', type: 'text', content: 'old' }] as Block[],
    ],
    [
      'remove',
      [{ op: 'remove', blockId: 'blk-1' }] as ModuleChange[],
      [{ id: 'blk-1', type: 'text', content: 'old' }] as Block[],
    ],
  ]

  it.each(recordIdCases)(
    'surfaces the advanced record’s id when its action is undoable (%s)',
    async (_op, opChanges, pageBlocks) => {
      // Not mocked: `after` computed the same way propose.ts computes it, seeded by
      // the same toolCallId, then round-tripped through JSON the way jsonb storage
      // does (dropping undefined-valued keys) — a real-shaped `after`, not a
      // fixture, so this proves the accept write lands blocks that are what
      // commitBlocks/the RPC actually store, byte-identical to it (KAN-93 fix).
      const after = JSON.parse(
        JSON.stringify(
          applyProposedChanges(pageBlocks, opChanges, createDeterministicMintId('pc1'), {
            batch: opChanges,
          }).blocks
        )
      )
      mockedLookup.mockResolvedValue(logRecord({ after }))
      mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted', after }))
      mockedGetPage.mockResolvedValue({
        id: 'stamped-id',
        blocks: pageBlocks,
      } as unknown as Awaited<ReturnType<typeof getPage>>)

      const result = await writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc1', 'stamped-id'),
        toolCallId: 'pc1',
        openNodeId: null,
        changes: opChanges,
      })

      expect(result.recordId).toBe('rec-1')
      expect(mockedAcceptRecord).toHaveBeenCalledWith(supabase, 'rec-1', after)
    }
  )

  it('gives no recordId when the page drifted since propose (a typed edit landed in between)', async () => {
    // `after` is the snapshot propose.ts would have computed against the page as
    // it stood at propose time (empty). Accept time re-reads the page and finds
    // a block someone typed in the meantime — same record, same toolCallId, but
    // applying the identical change to the DRIFTED page yields different blocks:
    // this is exactly the case 0021's set_back CAS would refuse, so ⌘Z must never
    // be offered on it.
    const after = applyProposedChanges([], changes, createDeterministicMintId('pc1'), {
      batch: changes,
    }).blocks
    mockedLookup.mockResolvedValue(logRecord({ after }))
    mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted', after }))
    mockedGetPage.mockResolvedValue({
      id: 'stamped-id',
      blocks: [{ id: 'blk-typed', type: 'text', content: 'typed by hand' }],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(result.recordId).toBeNull()
  })

  it('gives no recordId when the record’s action is not undoable (add_row)', async () => {
    mockedLookup.mockResolvedValue(logRecord({ action: 'add_row' }))
    mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted', action: 'add_row' }))

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.recordId).toBeNull()
  })

  it('gives no recordId when nothing actually applied', async () => {
    mockedLookup.mockResolvedValue(logRecord({ targetPageId: 'ceramics-id' }))
    mockedGetPage.mockResolvedValue({
      id: 'ceramics-id',
      blocks: [{ id: 'blk-target', type: 'text', content: 'plan' }],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'ceramics-id'),
      toolCallId: 'pc1',
      openNodeId: 'open-id',
      changes: [
        { op: 'edit', blockId: 'blk-open', data: { type: 'text', content: 'x' } },
      ] as ModuleChange[],
    })

    expect(result.applied).toBe(0)
    expect(result.recordId).toBeNull()
  })

  it('gives no recordId when the accept was retargeted to a page the record never named', async () => {
    // Same shape as "writes the page the person chose, not the one the record
    // froze" above, but this time the retargeted write still lands blocks
    // byte-identical to `after` — the one condition that would otherwise pass
    // every other recordId guard. set_back's CAS is scoped to the RECORD's
    // frozen target_page_id (0021), so an id surfaced here would have ⌘Z read
    // the retargeted page, find it never matched, and refuse forever with
    // "page changed" — a step that can never be undone must never be offered.
    const after = applyProposedChanges([], changes, createDeterministicMintId('pc1'), {
      batch: changes,
    }).blocks
    mockedLookup.mockResolvedValue(logRecord({ targetPageId: 'a-page-they-redirected-from', after }))
    mockedAdvance.mockResolvedValue(logRecord({ status: 'accepted', after }))
    mockedGetPage.mockResolvedValue({
      id: 'retargeted-id',
      blocks: [],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'retargeted-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'accepted', 'you')
    expect(result.recordId).toBeNull()
  })

  it('gives no recordId when there is no change-log record at all', async () => {
    mockedLookup.mockResolvedValue(null)

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', 'stamped-id'),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(changes.length)
    expect(result.recordId).toBeNull()
  })

  it.each(['outdated', 'withdrawn', 'undone', 'reverted', 'changes_requested'] as const)(
    'refuses to write a proposal the log has moved past: %s',
    async (status) => {
      // Only `outdated` is reachable today. `undone` and `reverted` become
      // reachable the moment #104 and #103 land, and re-applying an edit that was
      // undone or reverted is plainly wrong — so the refusal is a list, not one
      // special case waiting to be forgotten.
      mockedLookup.mockResolvedValue(logRecord({ status }))

      const result = await writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc1', 'stamped-id'),
        toolCallId: 'pc1',
        openNodeId: null,
        changes,
      })

      expect(result.applied).toBe(0)
      expect(result.skipped).toBe(changes.length)
      expect(mockedCommitBlocks).not.toHaveBeenCalled()
      expect(mockedAcceptRecord).not.toHaveBeenCalled()
      expect(mockedAdvance).not.toHaveBeenCalled()
    }
  )
})

/**
 * #98 review, BLOCKING 2 — two batches accepted at once on ONE page.
 *
 * Each accept is a read-modify-write: getPage, apply, saveBlocks the WHOLE
 * array. "accept all" fired one per pending card in parallel, and one assistant
 * message can raise several cards aimed at the same page — so both read the
 * pre-write blocks and the second save silently overwrote the first batch. No
 * error, no skip count, just a change the person accepted that is not there.
 *
 * The page here is a live store: getPage hands back whatever was last committed,
 * and the read is slow enough that an unserialised pair WILL interleave.
 */
describe('concurrent accepts on the same page', () => {
  /** The page as it actually stands, mutated by each commit. */
  let stored: Block[]

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

  beforeEach(() => {
    stored = []
    mockedGetPage.mockImplementation(async () => {
      // A real round-trip: long enough that a parallel pair would both read []
      // and the loser's blocks would never be seen again.
      await delay(5)
      return { id: 'stamped-id', blocks: [...stored] } as unknown as Awaited<
        ReturnType<typeof getPage>
      >
    })
    mockedCommitBlocks.mockImplementation(async (_sb, _qc, _id, next) => {
      await delay(5)
      stored = [...(next as Block[])]
    })
  })

  function textChange(content: string): ModuleChange {
    return { op: 'create', data: { type: 'text', content } } as ModuleChange
  }

  it('both batches survive — neither accept clobbers the other', async () => {
    const resolutions: ConversationResolutions = {
      ...emptyResolutions(),
      targets: {
        pc1: { nodeId: 'stamped-id', nodeName: 'Garage' },
        pc2: { nodeId: 'stamped-id', nodeName: 'Garage' },
      },
    }
    const accept = (toolCallId: string, content: string) =>
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions,
        toolCallId,
        openNodeId: null,
        changes: [textChange(content)],
      })

    // Exactly what onAcceptAll does: both in flight at once.
    const [first, second] = await Promise.all([
      accept('pc1', 'from batch one'),
      accept('pc2', 'from batch two'),
    ])

    expect(first.applied).toBe(1)
    expect(second.applied).toBe(1)
    const contents = stored.map((b) => (b as { content?: string }).content)
    expect(contents).toHaveLength(2)
    expect(contents).toEqual(expect.arrayContaining(['from batch one', 'from batch two']))
  })

  it('a failed accept does not wedge the queue behind it', async () => {
    const resolutions: ConversationResolutions = {
      ...emptyResolutions(),
      targets: {
        pc1: { nodeId: 'stamped-id', nodeName: 'Garage' },
        pc2: { nodeId: 'stamped-id', nodeName: 'Garage' },
      },
    }
    mockedGetPage.mockRejectedValueOnce(new Error('network'))
    const failing = writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions,
      toolCallId: 'pc1',
      openNodeId: null,
      changes: [textChange('lost')],
    })
    const following = writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions,
      toolCallId: 'pc2',
      openNodeId: null,
      changes: [textChange('still lands')],
    })

    await expect(failing).rejects.toThrow('network')
    await expect(following).resolves.toMatchObject({ applied: 1 })
  })

  it('writes to DIFFERENT pages still overlap — the lock is per page', async () => {
    const resolutions: ConversationResolutions = {
      ...emptyResolutions(),
      targets: {
        pc1: { nodeId: 'page-a', nodeName: 'A' },
        pc2: { nodeId: 'page-b', nodeName: 'B' },
      },
    }
    const open: string[] = []
    let peak = 0
    mockedGetPage.mockImplementation(async (_sb, id) => {
      open.push(id as string)
      peak = Math.max(peak, open.length)
      await delay(5)
      open.pop()
      return { id, blocks: [] } as unknown as Awaited<ReturnType<typeof getPage>>
    })

    await Promise.all([
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions,
        toolCallId: 'pc1',
        openNodeId: null,
        changes: [textChange('a')],
      }),
      writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions,
        toolCallId: 'pc2',
        openNodeId: null,
        changes: [textChange('b')],
      }),
    ])

    expect(peak).toBe(2)
  })
})
