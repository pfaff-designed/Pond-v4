/**
 * The change log record page's view model — src/lib/change-log/record-page.ts.
 *
 * What it pins: the route's query shape, `?nodeId=__change_log__&record=<id>`,
 * and the title's two branches — the changed block's own preview, and
 * `describeChange`'s plain label when there is no live block to preview.
 */

import { describeChange, formatClockTime } from '@/lib/change-log/page-changes'
import {
  buildChangeTimeline,
  changeLogRecordUrl,
  firstQuestionFromMessages,
  pageBlockField,
  proposedByField,
  readChipsOf,
  RECORD_PARAM,
  recordBreadcrumbTitle,
  recordDiffRows,
  recordTitle,
  revertedByField,
  statusField,
} from '@/lib/change-log/record-page'
import type { ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'
import type { UIMessage } from 'ai'

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

  it(
    "reads 'before → after' for an edit, even with no targetBlockId — " +
      'every composer-made edit stores targetBlockId: null (propose.ts never sets it)',
    () => {
      const r = record({
        targetBlockId: null,
        before: [{ id: 'a', type: 'text', content: 'alpha one' }],
        after: [{ id: 'a', type: 'text', content: 'apple one' }],
      })
      expect(recordTitle(r)).toBe('alpha one → apple one')
    }
  )

  it('reads the after preview alone for an insert (a block in after, not before), with no targetBlockId', () => {
    const r = record({
      targetBlockId: null,
      before: [{ id: 'a', type: 'text', content: 'alpha one' }],
      after: [
        { id: 'a', type: 'text', content: 'alpha one' },
        { id: 'b', type: 'text', content: 'a new paragraph' },
      ],
    })
    expect(recordTitle(r)).toBe('a new paragraph')
  })

  it('reads the before preview alone for a removal (a block dropped from after), with no targetBlockId', () => {
    const r = record({
      targetBlockId: null,
      before: [
        { id: 'a', type: 'text', content: 'alpha one' },
        { id: 'b', type: 'text', content: 'gone now' },
      ],
      after: [{ id: 'a', type: 'text', content: 'alpha one' }],
    })
    expect(recordTitle(r)).toBe('gone now')
  })

  it('trims a text block preview to one line, ~60 chars, with an ellipsis', () => {
    const long = 'a'.repeat(80)
    const r = record({
      targetBlockId: null,
      before: null,
      after: [{ id: 'a', type: 'text', content: `${long}\nsecond line` }],
    })
    expect(recordTitle(r)).toBe(`${'a'.repeat(60)}…`)
  })
})

describe('recordBreadcrumbTitle', () => {
  it("drops the ' → ' and everything after it, leaving the record's own name (s6o3/s6o4 breadcrumb)", () => {
    const r = record({
      action: 'edit_row',
      targetBlockId: 'db-1',
      before: {
        id: 'row-1',
        title: 'electrician, second fix',
        values: { due: 'w/c 13 oct' },
        shown: { due: 'w/c 13 oct' },
      },
      after: {
        id: 'row-1',
        title: 'electrician, second fix',
        values: { due: 'w/c 6 oct' },
        shown: { due: 'w/c 6 oct' },
      },
    })
    expect(recordTitle(r)).toBe('electrician, second fix → w/c 6 oct')
    expect(recordBreadcrumbTitle(r)).toBe('electrician, second fix')
  })

  it('leaves a title with no arrow unchanged', () => {
    expect(recordBreadcrumbTitle(record())).toBe('ONE')
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

describe('readChipsOf', () => {
  it('passes an array of strings through as-is', () => {
    const r = record({ read: ['kitchen renovation', 'w/c 6 oct'] })
    expect(readChipsOf(r)).toEqual(['kitchen renovation', 'w/c 6 oct'])
  })

  it('reads anything else as nothing to show', () => {
    expect(readChipsOf(record({ read: null }))).toEqual([])
    expect(readChipsOf(record({ read: { not: 'an array' } }))).toEqual([])
    expect(readChipsOf(record({ read: ['ok', 42] }))).toEqual([])
  })
})

describe('revertedByField', () => {
  it('returns null with no reverts', () => {
    expect(revertedByField([])).toBeNull()
  })

  it("names the one revert's clock time and current status", () => {
    const createdAt = '2026-09-30T10:02:00.000Z'
    const revert = record({ id: 'rec-2', action: 'revert', status: 'proposed', createdAt })
    expect(revertedByField([revert])).toEqual({
      recordId: 'rec-2',
      clockLabel: `revert · ${formatClockTime(createdAt)}`,
      statusPillText: 'proposed',
    })
  })

  it('picks the newest (first) of two or more reverts', () => {
    const newest = record({
      id: 'rec-3',
      status: 'accepted',
      createdAt: '2026-09-30T11:00:00.000Z',
    })
    const older = record({ id: 'rec-2', status: 'proposed', createdAt: '2026-09-30T10:02:00.000Z' })
    expect(revertedByField([newest, older])?.recordId).toBe('rec-3')
    expect(revertedByField([newest, older])?.statusPillText).toBe('accepted')
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

  it("resolves the changed block by diffing before/after when targetBlockId is null (every composer-made edit), never empty", () => {
    const r = record({
      targetPageId: 'page-1',
      targetBlockId: null,
      before: [{ id: 'a', type: 'text', content: 'alpha one' }],
      after: [{ id: 'a', type: 'text', content: 'apple one' }],
    })
    expect(pageBlockField(r, pageTitleById)).toEqual({ page: 'kitchen renovation', block: 'text' })
  })
})

describe('recordDiffRows', () => {
  it('builds before/after rows for an edit record', () => {
    const r = record({
      action: 'edit',
      before: [{ id: 'a', type: 'text', content: 'ONE' }],
      after: [{ id: 'a', type: 'text', content: 'TWO' }],
    })
    expect(recordDiffRows(r)).toEqual([
      {
        op: 'edit',
        before: { id: 'a', type: 'text', content: 'ONE' },
        after: { id: 'a', type: 'text', content: 'TWO' },
      },
    ])
  })

  it('returns null for a non-block record', () => {
    const r = record({
      action: 'add_row',
      before: null,
      after: { id: 'row-1', title: 'chickpeas', values: {}, shown: {} },
    })
    expect(recordDiffRows(r)).toBeNull()
  })

  it('returns null for an outdated revert (no after snapshot), never a removal row per before block', () => {
    const r = record({
      action: 'revert',
      status: 'outdated',
      before: [
        { id: 'a', type: 'text', content: 'kiwi' },
        { id: 'b', type: 'text', content: 'fig' },
      ],
      after: null,
      links: { revertOf: 'rec-original' },
    })
    expect(recordDiffRows(r)).toBeNull()
  })
})

describe('firstQuestionFromMessages', () => {
  it('returns null with no messages', () => {
    expect(firstQuestionFromMessages([])).toBeNull()
  })

  it('returns null with no user message', () => {
    const messages = [
      { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
    ] as UIMessage[]
    expect(firstQuestionFromMessages(messages)).toBeNull()
  })

  it("joins the first user message's text parts", () => {
    const messages = [
      {
        id: 'm1',
        role: 'user',
        parts: [
          { type: 'text', text: 'change alpha ' },
          { type: 'text', text: 'to apple' },
        ],
      },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'done' }] },
      { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'and the rest' }] },
    ] as UIMessage[]
    expect(firstQuestionFromMessages(messages)).toBe('change alpha to apple')
  })
})

describe('buildChangeTimeline', () => {
  it('flattens a proposed → changes requested → revised → accepted chain, labelling the revision and highlighting the viewed record', () => {
    const original = record({
      id: 'rec-1',
      status: 'changes_requested',
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:12:00.000Z', actor: 'pond' },
        { status: 'changes_requested', at: '2026-09-30T09:16:00.000Z', actor: 'you' },
      ],
    })
    const revision = record({
      id: 'rec-2',
      status: 'accepted',
      links: { revisedFrom: 'rec-1' },
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:20:00.000Z', actor: 'pond' },
        { status: 'accepted', at: '2026-09-30T09:31:00.000Z', actor: 'you' },
      ],
    })

    const rows = buildChangeTimeline([original, revision], 'rec-2')

    expect(rows).toEqual([
      {
        time: formatClockTime('2026-09-30T09:12:00.000Z'),
        event: 'proposed',
        detail: describeChange(original, null),
        highlighted: false,
      },
      {
        time: formatClockTime('2026-09-30T09:16:00.000Z'),
        event: 'changes requested',
        detail: 'you',
        highlighted: false,
      },
      {
        time: formatClockTime('2026-09-30T09:20:00.000Z'),
        event: 'revised',
        detail: describeChange(revision, null),
        highlighted: true,
      },
      {
        time: formatClockTime('2026-09-30T09:31:00.000Z'),
        event: 'accepted',
        detail: 'you',
        highlighted: true,
      },
    ])
  })

  it('interleaves a revert record as "reverted" / its own status, in time order with the chain', () => {
    const original = record({
      id: 'rec-1',
      status: 'reverted',
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:20:00.000Z', actor: 'pond' },
        { status: 'accepted', at: '2026-09-30T09:31:00.000Z', actor: 'you' },
        { status: 'reverted', at: '2026-09-30T10:05:00.000Z', actor: 'you' },
      ],
    })
    const revert = record({
      id: 'rec-revert',
      status: 'accepted',
      action: 'revert',
      links: { revertOf: 'rec-1' },
      transitions: [
        { status: 'proposed', at: '2026-09-30T10:02:00.000Z', actor: 'you' },
        { status: 'accepted', at: '2026-09-30T10:05:00.000Z', actor: 'you' },
      ],
    })

    const rows = buildChangeTimeline([original], 'rec-1', [revert])

    expect(rows.map((r) => r.event)).toEqual(['proposed', 'accepted', 'reverted', 'accepted'])
    expect(rows.map((r) => r.time)).toEqual([
      formatClockTime('2026-09-30T09:20:00.000Z'),
      formatClockTime('2026-09-30T09:31:00.000Z'),
      formatClockTime('2026-09-30T10:02:00.000Z'),
      formatClockTime('2026-09-30T10:05:00.000Z'),
    ])
    // The revert's own "reverted" row is not the viewed record (rec-1) — only
    // rec-1's own rows (the first two) highlight.
    expect(rows.map((r) => r.highlighted)).toEqual([true, true, false, false])
  })

  it('renders a single record with no revision as its own proposed/accepted rows', () => {
    const r = record({
      id: 'rec-1',
      status: 'accepted',
      transitions: [
        { status: 'proposed', at: '2026-09-30T09:20:00.000Z', actor: 'pond' },
        { status: 'accepted', at: '2026-09-30T09:31:00.000Z', actor: 'you' },
      ],
    })

    expect(buildChangeTimeline([r], 'rec-1')).toEqual([
      {
        time: formatClockTime('2026-09-30T09:20:00.000Z'),
        event: 'proposed',
        detail: describeChange(r, null),
        highlighted: true,
      },
      {
        time: formatClockTime('2026-09-30T09:31:00.000Z'),
        event: 'accepted',
        detail: 'you',
        highlighted: true,
      },
    ])
  })
})
