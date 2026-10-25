/**
 * KAN-552's "try to break it": an AI/proposed diff was recorded while a page's
 * paragraph/heading/list/divider still lived in ONE stored `text` block — its
 * `before` is that single unsplit block. By the time anyone accepts it, reading
 * the page splits that same block into four (read-time only, no write, so
 * nothing ever swept this record `outdated`). Accepting must not blindly apply
 * a blockId-keyed edit against only the FIRST split part while the rest of the
 * old content sits untouched beside it — that is a duplicated page, not a diff.
 *
 * Harness copied from accept-changes.test.ts.
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
import { commitBlocks } from '@/lib/pages/commit'
import { getRecordByToolCall, acceptRecord, advanceStatus, markOutdated } from '@/lib/change-log/store'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import { writeAcceptedChanges } from '@/lib/pages/accept'
import { emptyResolutions, type ConversationResolutions } from '@/lib/conversation/resolutions'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import type { Block } from '@/lib/documents/types'
import { splitStoredText } from '@/lib/modules/text/split-stored'
import { toBlocks } from '@/lib/pages/to-blocks'

const mockedGetPage = getPage as jest.MockedFunction<typeof getPage>
const mockedCommitBlocks = commitBlocks as jest.MockedFunction<typeof commitBlocks>
const mockedLookup = getRecordByToolCall as jest.MockedFunction<typeof getRecordByToolCall>
const mockedAcceptRecord = acceptRecord as jest.MockedFunction<typeof acceptRecord>
const mockedAdvance = advanceStatus as jest.MockedFunction<typeof advanceStatus>
const mockedMarkOutdated = markOutdated as jest.MockedFunction<typeof markOutdated>

const USER = 'user-1'
const PAGE_ID = 'stamped-id'

// The content as it was stored when the diff was proposed: one `text` block
// holding a paragraph, a heading, a list and a divider.
const UNSPLIT_CONTENT = 'alpha\n\n## heading\n\n- one\n- two\n\n---'

const oldBlock: Block = { id: 'blk-1', type: 'text', content: UNSPLIT_CONTENT }

function stamped(toolCallId: string, nodeId: string): ConversationResolutions {
  return {
    ...emptyResolutions(),
    targets: { [toolCallId]: { nodeId, nodeName: 'page' } },
  }
}

function logRecord(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: USER,
    pondId: 'pond-1',
    status: 'proposed',
    action: 'edit',
    actor: 'pond',
    targetPageId: PAGE_ID,
    targetBlockId: null,
    before: [oldBlock],
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

beforeEach(() => {
  jest.clearAllMocks()
  mockedMarkOutdated.mockResolvedValue([])
  mockedAdvance.mockResolvedValue(logRecord({ status: 'outdated' }))
  mockedAcceptRecord.mockResolvedValue(logRecord({ status: 'accepted' }))
  // The page as it reads NOW: the same old block, split at read time — nothing
  // was ever saved, so this is exactly `splitStoredText([oldBlock])`.
  mockedGetPage.mockResolvedValue({
    id: PAGE_ID,
    blocks: splitStoredText([oldBlock]),
  } as unknown as Awaited<ReturnType<typeof getPage>>)
})

describe('accepting a diff proposed against a now-split stored text block (KAN-552)', () => {
  it('never lands a page with the old content duplicated', async () => {
    mockedLookup.mockResolvedValue(logRecord())

    // The diff edits the WHOLE original block — as the AI could only ever see
    // it, before the split existed — changing just the first paragraph's words
    // while carrying the rest of the original content forward untouched.
    const changes: ModuleChange[] = [
      {
        op: 'edit',
        blockId: 'blk-1',
        data: { type: 'text', content: 'alpha edited\n\n## heading\n\n- one\n- two\n\n---' },
      },
    ] as ModuleChange[]

    await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', PAGE_ID),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    const wroteViaAccept = mockedAcceptRecord.mock.calls.length > 0
    const wroteViaCommit = mockedCommitBlocks.mock.calls.length > 0
    if (!wroteViaAccept && !wroteViaCommit) {
      // Refused to write at all — the diff went outdated instead. That is the
      // other acceptable outcome; either way nothing corrupted lands.
      return
    }

    const written = (
      wroteViaAccept ? mockedAcceptRecord.mock.calls[0]![2] : mockedCommitBlocks.mock.calls[0]![3]
    ) as Block[]
    const textContents = written
      .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
      .map((b) => b.content)

    // The heading, the list and the divider must each appear exactly once —
    // never once from the (re-expanded) edited block and again from the
    // untouched split remainder sitting beside it.
    expect(textContents.filter((c) => c.includes('## heading')).length).toBeLessThanOrEqual(1)
    expect(textContents.filter((c) => c.includes('- one')).length).toBeLessThanOrEqual(1)
    expect(textContents.filter((c) => c === '---').length).toBeLessThanOrEqual(1)
  })

  it('marks the diff outdated rather than applying it against the split page', async () => {
    mockedLookup.mockResolvedValue(logRecord())

    const changes: ModuleChange[] = [
      {
        op: 'edit',
        blockId: 'blk-1',
        data: { type: 'text', content: 'alpha edited\n\n## heading\n\n- one\n- two\n\n---' },
      },
    ] as ModuleChange[]

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc1', PAGE_ID),
      toolCallId: 'pc1',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(mockedAcceptRecord).not.toHaveBeenCalled()
    expect(mockedCommitBlocks).not.toHaveBeenCalled()
    expect(mockedAdvance).toHaveBeenCalledWith(supabase, 'rec-1', 'outdated', 'you')
  })

  it('a block that was already single when proposed still applies cleanly', async () => {
    // No split happened for this record's before — nothing here should be
    // treated as stale on that account.
    const single: Block = { id: 'blk-2', type: 'text', content: 'just one line' }
    mockedLookup.mockResolvedValue(logRecord({ before: [single], toolCallId: 'pc2' }))
    mockedGetPage.mockResolvedValue({
      id: PAGE_ID,
      blocks: [single],
    } as unknown as Awaited<ReturnType<typeof getPage>>)

    const changes: ModuleChange[] = [
      { op: 'edit', blockId: 'blk-2', data: { type: 'text', content: 'edited line' } },
    ] as ModuleChange[]

    const result = await writeAcceptedChanges({
      pondId: 'pond-1',
      supabase,
      queryClient,
      userId: USER,
      resolutions: stamped('pc2', PAGE_ID),
      toolCallId: 'pc2',
      openNodeId: null,
      changes,
    })

    expect(result.applied).toBe(1)
    expect(result.skipped).toBe(0)
    expect(mockedAdvance).not.toHaveBeenCalled()
  })

  describe('propose.ts/assemble.ts reading through toBlocks (KAN-552 fix)', () => {
    // Block X is the same splittable paragraph/heading/list/divider as above;
    // block Y is a separate, untouched block on the same page.
    const blockX: Block = { id: 'blk-x', type: 'text', content: UNSPLIT_CONTENT }
    const blockY: Block = { id: 'blk-y', type: 'text', content: 'untouched' }
    // What `propose.ts` now snapshots as `before` — the page read through
    // `toBlocks`, i.e. already split, exactly like `getPage` returns it.
    const splitPage = toBlocks([blockX, blockY])

    it('an edit to an unrelated block on the same page applies, never goes outdated', async () => {
      mockedLookup.mockResolvedValue(logRecord({ before: splitPage, toolCallId: 'pc3' }))
      mockedGetPage.mockResolvedValue({
        id: PAGE_ID,
        blocks: splitPage,
      } as unknown as Awaited<ReturnType<typeof getPage>>)

      const changes: ModuleChange[] = [
        { op: 'edit', blockId: 'blk-y', data: { type: 'text', content: 'edited y' } },
      ] as ModuleChange[]

      const result = await writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc3', PAGE_ID),
        toolCallId: 'pc3',
        openNodeId: null,
        changes,
      })

      expect(result.applied).toBe(1)
      expect(result.skipped).toBe(0)
      expect(mockedAdvance).not.toHaveBeenCalled()

      const wroteViaAccept = mockedAcceptRecord.mock.calls.length > 0
      const written = (
        wroteViaAccept ? mockedAcceptRecord.mock.calls[0]![2] : mockedCommitBlocks.mock.calls[0]![3]
      ) as Block[]
      const textContents = written
        .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
        .map((b) => b.content)
      // The heading, the list and the divider from block X survive exactly
      // once each — the edit to Y must not touch, lose or duplicate them.
      expect(textContents.filter((c) => c.includes('## heading')).length).toBe(1)
      expect(textContents.filter((c) => c.includes('- one')).length).toBe(1)
      expect(textContents.filter((c) => c === '---').length).toBe(1)
      expect(textContents).toContain('edited y')
    })

    it('a diff whose before really targets content that changed since goes outdated, never corrupts', async () => {
      // The push-based sweep (recordOwnEdit → markOutdated) already advanced
      // this record to `outdated` by the time anyone clicks accept — a real
      // edit landed on the page between propose and accept, unrelated to the
      // read-time split.
      mockedLookup.mockResolvedValue(
        logRecord({ before: splitPage, toolCallId: 'pc4', status: 'outdated' })
      )
      mockedGetPage.mockResolvedValue({
        id: PAGE_ID,
        // The page as it reads now: block X's first paragraph was actually
        // edited, not just read-split.
        blocks: [{ ...splitPage[0]!, content: 'alpha, really edited' }, ...splitPage.slice(1)],
      } as unknown as Awaited<ReturnType<typeof getPage>>)

      const changes: ModuleChange[] = [
        { op: 'edit', blockId: 'blk-y', data: { type: 'text', content: 'edited y' } },
      ] as ModuleChange[]

      const result = await writeAcceptedChanges({
        pondId: 'pond-1',
        supabase,
        queryClient,
        userId: USER,
        resolutions: stamped('pc4', PAGE_ID),
        toolCallId: 'pc4',
        openNodeId: null,
        changes,
      })

      expect(result.applied).toBe(0)
      expect(result.skipped).toBe(1)
      expect(mockedAcceptRecord).not.toHaveBeenCalled()
      expect(mockedCommitBlocks).not.toHaveBeenCalled()
    })
  })
})
