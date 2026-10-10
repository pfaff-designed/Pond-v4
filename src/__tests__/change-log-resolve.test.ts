/**
 * Resolving a proposal card into the change log — src/lib/change-log/resolve.ts.
 *
 * The transcript → log bridge for every decision EXCEPT an accepted block edit.
 * A block accept has to commit the page and advance the record in one
 * transaction, so `writeAcceptedChanges` owns that one (see accept-changes.test.ts);
 * everything else — a reject on any card, and an accept on the six tools whose
 * write is not a block write — is a plain status advance, and lands here.
 *
 * The contract this file pins: the advance happens ONCE, a card that was already
 * settled is left alone rather than re-advanced, and a log failure never reaches
 * the person. The log is a side-record of the turn; the card must still resolve.
 */

jest.mock('@/lib/change-log/store', () => ({
  getRecordByToolCall: jest.fn(),
  advanceStatus: jest.fn(),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getRecordByToolCall, advanceStatus } from '@/lib/change-log/store'
import { resolveChangeLogRecord } from '@/lib/change-log/resolve'
import type { ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'

const mockedLookup = getRecordByToolCall as jest.MockedFunction<typeof getRecordByToolCall>
const mockedAdvance = advanceStatus as jest.MockedFunction<typeof advanceStatus>

const supabase = {} as SupabaseClient<Database>
const USER = 'user-1'

function record(status: ChangeLogStatus = 'proposed'): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: USER,
    pondId: 'pond-1',
    status,
    action: 'add_row',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: null,
    after: { rows: 1 },
    sourceThreadId: null,
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [{ status, at: '2026-01-01T00:00:00.000Z', actor: 'pond' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    statusAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedAdvance.mockImplementation(async (_sb, _id, to) => record(to))
})

describe('resolveChangeLogRecord', () => {
  it('advances a rejected card’s record to rejected, by you', async () => {
    mockedLookup.mockResolvedValue(record('proposed'))

    const out = await resolveChangeLogRecord(supabase, {
      pondId: 'pond-1',
      userId: USER,
      toolCallId: 'call-1',
      decision: 'rejected',
    })

    expect(out?.status).toBe('rejected')
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'rejected', 'you')
  })

  it('leaves an already-settled record alone instead of re-advancing it', async () => {
    // A card resolves more than once in practice: propose_changes dispatches one
    // `resolve` per change index and then a second time to carry the skip counts.
    // The state machine calls accepted → accepted illegal, so without this guard
    // the second dispatch throws on a decision the person already made.
    mockedLookup.mockResolvedValue(record('accepted'))

    const out = await resolveChangeLogRecord(supabase, {
      pondId: 'pond-1',
      userId: USER,
      toolCallId: 'call-1',
      decision: 'accepted',
    })

    expect(out).toBeNull()
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  it('reads null for a card with no record, rather than treating it as an error', async () => {
    mockedLookup.mockResolvedValue(null)

    await expect(
      resolveChangeLogRecord(supabase, {
        pondId: 'pond-1',
        userId: USER,
        toolCallId: 'never-logged',
        decision: 'accepted',
      })
    ).resolves.toBeNull()
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  it('swallows a log failure — the person’s decision must still stand', async () => {
    // The log is a side-record of the turn. This runs after the card has already
    // resolved optimistically, so throwing here would surface as an unhandled
    // rejection and change nothing the person can act on. It is logged instead.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedLookup.mockResolvedValue(record('proposed'))
    mockedAdvance.mockRejectedValue(new Error('lost the race'))

    await expect(
      resolveChangeLogRecord(supabase, {
        pondId: 'pond-1',
        userId: USER,
        toolCallId: 'call-1',
        decision: 'rejected',
      })
    ).resolves.toBeNull()
    expect(spy).toHaveBeenCalled()

    mockedLookup.mockRejectedValue(new Error('offline'))
    await expect(
      resolveChangeLogRecord(supabase, {
        pondId: 'pond-1',
        userId: USER,
        toolCallId: 'call-1',
        decision: 'rejected',
      })
    ).resolves.toBeNull()
    spy.mockRestore()
  })
})
