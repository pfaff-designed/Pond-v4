/**
 * @jest-environment node
 *
 * #98 — a revised diff is a NEW record linked to the one it answers.
 *
 * Request changes (and revise on an outdated card) send a note to Pond, whose
 * next propose_changes is the revision. The route tells `recordProposedToolCalls`
 * which call that revision answers; the record it writes must carry
 * `links.revisedFrom`, and the original must have left `proposed` — the note is
 * the person's decision, so if the browser's own advance has not landed yet the
 * route lands it. The log only grows: the original is never rewritten.
 */

jest.mock('@/lib/change-log/store', () => ({
  appendProposal: jest.fn(),
  reviseRecord: jest.fn(),
  getRecordByToolCall: jest.fn(),
  advanceStatus: jest.fn(),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  appendProposal,
  reviseRecord,
  getRecordByToolCall,
  advanceStatus,
} from '@/lib/change-log/store'
import { recordProposedToolCalls } from '@/lib/change-log/propose'
import type { ChangeLogRecord, ChangeLogStatus } from '@/lib/change-log/types'

const mockedAppend = appendProposal as jest.MockedFunction<typeof appendProposal>
const mockedRevise = reviseRecord as jest.MockedFunction<typeof reviseRecord>
const mockedLookup = getRecordByToolCall as jest.MockedFunction<typeof getRecordByToolCall>
const mockedAdvance = advanceStatus as jest.MockedFunction<typeof advanceStatus>

const USER = 'user-1'

function record(status: ChangeLogStatus): ChangeLogRecord {
  return {
    id: 'rec-orig',
    userId: USER,
    pondId: 'pond-1',
    status,
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: [],
    after: [],
    sourceThreadId: null,
    toolCallId: 'pc-orig',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    statusAt: '2026-01-01T00:00:00.000Z',
  }
}

/** A supabase double that serves the target page's blocks. */
const supabase = {
  from: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { blocks: [] }, error: null }),
    }
    return chain
  },
} as unknown as SupabaseClient<Database>

const revisionCall = {
  toolCallId: 'pc-rev',
  toolName: 'propose_changes',
  input: { changes: [{ op: 'create', data: { type: 'text', content: 'revised' } }] },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedAppend.mockImplementation(
    async (_sb, input) => ({ ...record('proposed'), ...input }) as never
  )
  mockedRevise.mockImplementation(
    async (_sb, original, input) =>
      ({ ...record('proposed'), ...input, links: { revisedFrom: original.id } }) as never
  )
  mockedAdvance.mockImplementation(async (_sb, _id, to) => record(to))
})

describe('recordProposedToolCalls — revision linking (#98)', () => {
  it('links the revision to a changes_requested original through reviseRecord', async () => {
    mockedLookup.mockResolvedValue(record('changes_requested'))
    await recordProposedToolCalls(supabase, {
      userId: USER,
      pondId: 'pond-1',
      openPageId: 'page-1',
      revisesToolCallId: 'pc-orig',
      toolCalls: [revisionCall],
    })
    expect(mockedRevise).toHaveBeenCalledTimes(1)
    const [, original, input] = mockedRevise.mock.calls[0]
    expect(original.id).toBe('rec-orig')
    expect(input).toMatchObject({ action: 'edit', toolCallId: 'pc-rev', targetPageId: 'page-1' })
    expect(mockedAppend).not.toHaveBeenCalled()
    // The original was already decided; nothing to advance.
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  it('revises an outdated original the same way (revise offered on outdated)', async () => {
    mockedLookup.mockResolvedValue(record('outdated'))
    await recordProposedToolCalls(supabase, {
      userId: USER,
      pondId: 'pond-1',
      openPageId: 'page-1',
      revisesToolCallId: 'pc-orig',
      toolCalls: [revisionCall],
    })
    expect(mockedRevise).toHaveBeenCalledTimes(1)
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  it('lands the request-changes decision first when the original is still proposed', async () => {
    mockedLookup.mockResolvedValue(record('proposed'))
    await recordProposedToolCalls(supabase, {
      userId: USER,
      pondId: 'pond-1',
      openPageId: 'page-1',
      revisesToolCallId: 'pc-orig',
      toolCalls: [revisionCall],
    })
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-orig', 'changes_requested', 'you')
    expect(mockedRevise).toHaveBeenCalledTimes(1)
    expect(mockedRevise.mock.calls[0][1].status).toBe('changes_requested')
  })

  it('falls back to a plain proposal when the original cannot be revised', async () => {
    // A rejected original is settled for good; the new diff is simply new.
    mockedLookup.mockResolvedValue(record('rejected'))
    await recordProposedToolCalls(supabase, {
      userId: USER,
      pondId: 'pond-1',
      openPageId: 'page-1',
      revisesToolCallId: 'pc-orig',
      toolCalls: [revisionCall],
    })
    expect(mockedRevise).not.toHaveBeenCalled()
    expect(mockedAppend).toHaveBeenCalledTimes(1)
  })

  it('falls back to a plain proposal when there is no original to link', async () => {
    mockedLookup.mockResolvedValue(null)
    await recordProposedToolCalls(supabase, {
      userId: USER,
      pondId: 'pond-1',
      openPageId: 'page-1',
      revisesToolCallId: 'pc-orig',
      toolCalls: [revisionCall],
    })
    expect(mockedRevise).not.toHaveBeenCalled()
    expect(mockedAppend).toHaveBeenCalledTimes(1)
  })

  it('only propose_changes revises — a create_page in the same turn is a plain proposal', async () => {
    mockedLookup.mockResolvedValue(record('changes_requested'))
    await recordProposedToolCalls(supabase, {
      userId: USER,
      pondId: 'pond-1',
      openPageId: 'page-1',
      revisesToolCallId: 'pc-orig',
      toolCalls: [{ toolCallId: 'cp1', toolName: 'create_page', input: { title: 'x' } }],
    })
    expect(mockedRevise).not.toHaveBeenCalled()
    expect(mockedAppend).toHaveBeenCalledTimes(1)
  })
})
