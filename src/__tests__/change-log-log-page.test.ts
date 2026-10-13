/**
 * The change log page's view model — src/lib/change-log/log-page.ts.
 *
 * What it pins: day-header grouping against a fixed clock, the label staying
 * `describeChange`'s (never a second labelling path), the page-title fallback
 * chain, and the pill/plain split following `isWaitingStatus`.
 */

import { buildLogRows, isWaitingStatus } from '@/lib/change-log/log-page'
import { describeChange } from '@/lib/change-log/page-changes'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const NOW = new Date('2026-09-30T12:00:00.000Z')

function record(over: Partial<ChangeLogRecord> = {}): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action: 'edit',
    actor: 'pond',
    targetPageId: 'page-1',
    targetBlockId: null,
    before: [{ id: 'a', type: 'text', content: 'one' }],
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

describe('isWaitingStatus', () => {
  it('is true for proposed and outdated, false for every other status', () => {
    expect(isWaitingStatus('proposed')).toBe(true)
    expect(isWaitingStatus('outdated')).toBe(true)
    expect(isWaitingStatus('accepted')).toBe(false)
    expect(isWaitingStatus('rejected')).toBe(false)
    expect(isWaitingStatus('changes_requested')).toBe(false)
    expect(isWaitingStatus('withdrawn')).toBe(false)
    expect(isWaitingStatus('undone')).toBe(false)
    expect(isWaitingStatus('reverted')).toBe(false)
  })
})

describe('buildLogRows', () => {
  it('groups newest-first records under today / yesterday / a short date', () => {
    const groups = buildLogRows(
      [
        record({ id: 'r1', createdAt: '2026-09-30T09:31:00.000Z' }),
        record({ id: 'r2', createdAt: '2026-09-30T08:02:00.000Z' }),
        record({ id: 'r3', createdAt: '2026-09-29T20:00:00.000Z' }),
        record({ id: 'r4', createdAt: '2026-09-20T09:00:00.000Z' }),
      ],
      new Map(),
      NOW
    )

    expect(groups.map((g) => g.label)).toEqual(['today', 'yesterday', 'Sep 20'])
    expect(groups[0].rows.map((r) => r.record.id)).toEqual(['r1', 'r2'])
    expect(groups[1].rows.map((r) => r.record.id)).toEqual(['r3'])
    expect(groups[2].rows.map((r) => r.record.id)).toEqual(['r4'])
  })

  it('labels a row through describeChange, never a second labelling path', () => {
    const addRow = record({
      action: 'add_row',
      before: null,
      after: { id: 'row-1', title: 'chickpeas, harissa', values: {}, shown: {} },
    })
    const [group] = buildLogRows([addRow], new Map(), NOW)
    expect(group.rows[0].label).toBe(describeChange(addRow, null, new Map([['rec-1', addRow]])))
  })

  it('resolves the page column from pageTitleById, falling back for memory and deleted pages', () => {
    const onAPage = record({ id: 'r1', targetPageId: 'page-1' })
    const memoryNote = record({ id: 'r2', action: 'memory_note', targetPageId: null })
    const deletedTarget = record({ id: 'r3', targetPageId: 'page-gone' })
    const deletedNoTarget = record({ id: 'r4', action: 'edit', targetPageId: null })

    const [group] = buildLogRows(
      [onAPage, memoryNote, deletedTarget, deletedNoTarget],
      new Map([['page-1', 'kitchen renovation']])
    )
    const byId = new Map(group.rows.map((r) => [r.record.id, r]))

    expect(byId.get('r1')?.page).toBe('kitchen renovation')
    expect(byId.get('r2')?.page).toBe('memory')
    expect(byId.get('r3')?.page).toBe('deleted page')
    expect(byId.get('r4')?.page).toBe('deleted page')
  })

  it('carries actor verbatim as `by`', () => {
    const [group] = buildLogRows([record({ actor: 'you' })], new Map())
    expect(group.rows[0].by).toBe('you')
  })

  it('splits status into a pill for proposed/outdated, plain otherwise', () => {
    const [group] = buildLogRows(
      [
        record({ id: 'r1', status: 'outdated' }),
        record({ id: 'r2', status: 'accepted' }),
        record({ id: 'r3', status: 'proposed' }),
      ],
      new Map()
    )
    const byId = new Map(group.rows.map((r) => [r.record.id, r]))

    expect(byId.get('r1')?.status).toEqual({ kind: 'pill', text: 'outdated' })
    expect(byId.get('r2')?.status).toEqual({ kind: 'plain', text: 'accepted' })
    expect(byId.get('r3')?.status).toEqual({ kind: 'pill', text: 'proposed' })
  })
})
