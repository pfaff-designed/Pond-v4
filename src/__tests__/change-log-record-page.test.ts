/**
 * The change log record page's view model — src/lib/change-log/record-page.ts.
 *
 * What it pins: the route's query shape, `?nodeId=__change_log__&record=<id>`,
 * and the title's two branches — the changed block's own preview, and
 * `describeChange`'s plain label when there is no live block to preview.
 */

import { formatClockTime } from '@/lib/change-log/page-changes'
import {
  changeLogRecordUrl,
  pageBlockField,
  proposedByField,
  RECORD_PARAM,
  recordTitle,
  statusField,
} from '@/lib/change-log/record-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'

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

describe('statusField', () => {
  it("reads the current status's own transition — actor and clock time", () => {
    const statusAt = '2026-09-30T09:31:00.000Z'
    const r = record({
      status: 'accepted',
      statusAt,
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:20:00.000Z', actor: 'pond' },
        { status: 'accepted', at: statusAt, actor: 'you' },
      ],
    })
    expect(statusField(r)).toBe(`accepted by you · ${formatClockTime(statusAt)}`)
  })

  it("falls back to the record's own actor with no transitions", () => {
    const statusAt = '2026-09-30T09:20:00.000Z'
    const r = record({ status: 'proposed', statusAt, actor: 'pond', transitions: [] })
    expect(statusField(r)).toBe(`proposed by pond · ${formatClockTime(statusAt)}`)
  })
})

describe('proposedByField', () => {
  it('reads who proposed the record and when', () => {
    const createdAt = '2026-09-30T09:20:00.000Z'
    const r = record({ actor: 'pond', createdAt })
    expect(proposedByField(r)).toBe(`pond · ${formatClockTime(createdAt)}`)
  })
})

describe('pageBlockField', () => {
  const pageTitleById = new Map([['page-1', 'kitchen renovation']])

  it("reads the page title and the changed block's own label off the record's snapshot", () => {
    const r = record({
      targetPageId: 'page-1',
      targetBlockId: 'a',
      after: [{ id: 'a', type: 'table', columns: ['x'], rows: [] }],
    })
    expect(pageBlockField(r, pageTitleById)).toEqual({ page: 'kitchen renovation', block: 'table' })
  })

  it("falls back to the page's current blocks when the record's own snapshot isn't a block array", () => {
    const r = record({
      action: 'add_row',
      targetPageId: 'page-1',
      targetBlockId: 'db-1',
      before: null,
      after: { id: 'row-1', title: 'chickpeas', values: {}, shown: {} },
    })
    const blocks = [{ id: 'db-1', type: 'view', mode: 'table', label: 'ingredients' } as Block]
    expect(pageBlockField(r, pageTitleById, blocks)).toEqual({
      page: 'kitchen renovation',
      block: 'ingredients',
    })
  })

  it('returns a null block when neither the snapshot nor the live blocks resolve it', () => {
    const r = record({
      action: 'create_page',
      targetPageId: 'page-1',
      targetBlockId: null,
      before: null,
      after: null,
    })
    expect(pageBlockField(r, pageTitleById).block).toBeNull()
  })
})
