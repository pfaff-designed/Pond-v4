/**
 * The "changes to this page" panel's rows — src/lib/change-log/page-change-rows.ts.
 */

import { buildPageChangeRows, panelTimeLabel } from '@/lib/change-log/page-change-rows'
import type { ChangeLogRecord } from '@/lib/change-log/types'

const BEFORE = [{ id: 'a', type: 'text', content: 'one' }]
const AFTER = [{ id: 'a', type: 'text', content: 'ONE' }]

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
    before: BEFORE,
    after: AFTER,
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

describe('buildPageChangeRows', () => {
  it('labels a row via recordTitle, times it via panelTimeLabel, newest first', () => {
    const rows = buildPageChangeRows([record({ id: 'b' }), record({ id: 'a' })], [])
    expect(rows.map((r) => r.record.id)).toEqual(['b', 'a'])
    expect(rows[0].label).toBe('one → ONE')
    expect(rows[0].time).toBe(panelTimeLabel(rows[0].record.createdAt))
  })

  it("carries fullLabel untrimmed, even when label (the row's display text) is cut to an ellipsis", () => {
    const long = 'a'.repeat(80)
    const rows = buildPageChangeRows(
      [record({ before: null, after: [{ id: 'a', type: 'text', content: long }] })],
      []
    )
    expect(rows[0].label).toBe(`${'a'.repeat(60)}…`)
    expect(rows[0].fullLabel).toBe(long)
  })

  it('pills a waiting status and leaves the rest plain, same rule as the log table', () => {
    const rows = buildPageChangeRows(
      [
        record({ id: 'r1', status: 'proposed' }),
        record({ id: 'r2', status: 'outdated' }),
        record({ id: 'r3', status: 'accepted' }),
      ],
      []
    )
    expect(rows.map((r) => r.status)).toEqual([
      { kind: 'pill', text: 'proposed' },
      { kind: 'pill', text: 'outdated' },
      { kind: 'plain', text: 'accepted' },
    ])
  })
})

describe('panelTimeLabel', () => {
  const NOW = new Date('2026-09-30T18:00:00.000Z')

  const clockOf = (iso: string): string =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  const weekdayOf = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).toLowerCase()

  const shortDateOf = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase()

  it('is a bare clock time for today', () => {
    const today = '2026-09-30T09:31:00.000Z'
    expect(panelTimeLabel(today, NOW)).toBe(clockOf(today))
  })

  it('is a lowercase short weekday for 1-6 days back', () => {
    const oneDayBack = '2026-09-29T09:31:00.000Z'
    const sixDaysBack = '2026-09-24T09:31:00.000Z'
    expect(panelTimeLabel(oneDayBack, NOW)).toBe(weekdayOf(oneDayBack))
    expect(panelTimeLabel(sixDaysBack, NOW)).toBe(weekdayOf(sixDaysBack))
  })

  it('is a lowercase short date for 7+ days back', () => {
    const sevenDaysBack = '2026-09-23T09:31:00.000Z'
    expect(panelTimeLabel(sevenDaysBack, NOW)).toBe(shortDateOf(sevenDaysBack))
  })
})
