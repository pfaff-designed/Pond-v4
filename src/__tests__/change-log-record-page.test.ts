/**
 * The change log record page's view model — src/lib/change-log/record-page.ts.
 *
 * What it pins: the route's query shape, `?nodeId=__change_log__&record=<id>`,
 * and the title's two branches — the changed block's own preview, and
 * `describeChange`'s plain label when there is no live block to preview.
 */

import { changeLogRecordUrl, recordTitle, RECORD_PARAM } from '@/lib/change-log/record-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'

describe('changeLogRecordUrl', () => {
  it('builds the change log route with the record id as a query param', () => {
    const url = changeLogRecordUrl('rec-1')
    const params = new URLSearchParams(url.slice(1))
    expect(params.get('nodeId')).toBe('__change_log__')
    expect(params.get(RECORD_PARAM)).toBe('rec-1')
  })
})

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: 'a',
    before: null,
    after: [{ id: 'a', type: 'text', content: 'ONE' }],
    sourceThreadId: null,
    toolCallId: 'call-1',
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-30T09:31:00.000Z',
    statusAt: '2026-09-30T09:31:00.000Z',
    ...over,
  }
}

describe('recordTitle', () => {
  it("previews the changed block through its own type's preview facet", () => {
    expect(recordTitle(record())).toBe('ONE')
  })

  it('falls back to before when after carries no block snapshot', () => {
    const r = record({
      before: [{ id: 'a', type: 'text', content: 'ONE' }],
      after: null,
    })
    expect(recordTitle(r)).toBe('ONE')
  })

  it("falls back to describeChange's plain label for a non-block action", () => {
    const r = record({
      action: 'create_page',
      targetBlockId: null,
      before: null,
      after: null,
    })
    expect(recordTitle(r)).toBe('created this page')
  })

  it('falls back to describeChange when a block action carries no live snapshot', () => {
    const r = record({ before: null, after: null })
    expect(recordTitle(r)).toBe('edited this page')
  })
})
