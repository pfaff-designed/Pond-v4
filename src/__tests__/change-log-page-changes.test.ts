/**
 * The "changes to this page" view model — src/lib/change-log/page-changes.ts.
 *
 * What it pins: which rows offer a revert, and the `reverted by` backlink being
 * DERIVED from `links.revertOf` rather than read off the original (migration 0011
 * freezes `links` at insert, so the original never gains a pointer back).
 */

import { buildPageChanges, describeChange } from '@/lib/change-log/page-changes'
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

describe('buildPageChanges', () => {
  it('offers a revert on an accepted edit', () => {
    const [row] = buildPageChanges([record()])
    expect(row.revertable).toBe(true)
    expect(row.revertBlockedBy).toBeNull()
  })

  it('withdraws the revert while one is already waiting, and says so', () => {
    // The panel's half of the guard `proposeRevert` enforces: the button goes
    // away rather than throwing when it is pressed.
    const original = record()
    const revert = record({
      id: 'rev-1',
      action: 'revert',
      status: 'proposed',
      actor: 'you',
      links: { revertOf: 'rec-1' },
    })

    const rows = buildPageChanges([revert, original])
    const originalRow = rows.find((r) => r.record.id === 'rec-1')!

    expect(originalRow.revertable).toBe(false)
    expect(originalRow.revertBlockedBy).toBe('waiting')
    // Derived, not stored — the original carries no link to its revert. The
    // backlink itself is the record page's to render (#147); this panel only
    // needs to know that one is waiting.
    expect(originalRow.record.links).toEqual({})
  })

  it('offers the revert again once the waiting one was rejected', () => {
    const rows = buildPageChanges([
      record({ id: 'rev-1', action: 'revert', status: 'rejected', links: { revertOf: 'rec-1' } }),
      record(),
    ])
    const originalRow = rows.find((r) => r.record.id === 'rec-1')!

    expect(originalRow.revertable).toBe(true)
    expect(originalRow.revertBlockedBy).toBeNull()
  })

  it('offers no revert on a record that is not an accepted edit', () => {
    const rows = buildPageChanges([
      record({ id: 'r1', status: 'proposed' }),
      record({ id: 'r2', action: 'add_row', before: null, after: { rows: 1 } }),
      record({ id: 'r3', status: 'reverted' }),
    ])
    expect(rows.map((r) => r.revertable)).toEqual([false, false, false])
    // Nothing is "waiting" here — these simply do not qualify.
    expect(rows.map((r) => r.revertBlockedBy)).toEqual([null, null, null])
  })

  it('resolves what a revert row reverts, when it is on the same page', () => {
    const rows = buildPageChanges([
      record({ id: 'rev-1', action: 'revert', links: { revertOf: 'rec-1' } }),
      record(),
    ])
    expect(rows[0].reverts?.id).toBe('rec-1')
  })

  it('leaves a revert whose original is not on this page unresolved, not crashed', () => {
    const rows = buildPageChanges([
      record({ id: 'rev-1', action: 'revert', links: { revertOf: 'elsewhere' } }),
    ])
    expect(rows[0].reverts).toBeNull()
    expect(rows[0].label).toBe('revert of an earlier change')
  })

  it('keeps the order it was given — newest first, as listRecords returns', () => {
    const rows = buildPageChanges([record({ id: 'b' }), record({ id: 'a' })])
    expect(rows.map((r) => r.record.id)).toEqual(['b', 'a'])
  })
})

describe('describeChange', () => {
  it('names every action the log can hold', () => {
    // An edit reads as its diff (change-log-summary.test.ts); without snapshots it
    // falls back to the plain line.
    expect(describeChange(record({ action: 'edit' }), null)).toBe('wrote 1 paragraph')
    expect(describeChange(record({ action: 'edit', before: null, after: null }), null)).toBe(
      'edited this page'
    )
    expect(describeChange(record({ action: 'create_page' }), null)).toBe('created this page')
    expect(describeChange(record({ action: 'memory_note' }), null)).toBe('recorded a memory note')
  })

  it('names a glyph pick as a mark change, in Pond\'s words', () => {
    expect(
      describeChange(record({ action: 'edit_glyph', before: null, after: 'flower-02' }), null)
    ).toBe('mark → flower 02')
    expect(
      describeChange(record({ action: 'edit_glyph', before: null, after: 'asset-161' }), null)
    ).toBe('mark → 161')
    expect(
      describeChange(record({ action: 'edit_glyph', before: 'flower-02', after: null }), null)
    ).toBe('mark → automatic')
  })

  it('names an area colour pick as a colour change, in the picker\'s own words', () => {
    expect(
      describeChange(record({ action: 'edit_area_role', before: null, after: 'area-a' }), null)
    ).toBe('colour → sage')
    expect(
      describeChange(record({ action: 'edit_area_role', before: null, after: 'area-b' }), null)
    ).toBe('colour → mist')
    expect(
      describeChange(record({ action: 'edit_area_role', before: null, after: 'area-c' }), null)
    ).toBe('colour → navy')
    expect(
      describeChange(record({ action: 'edit_area_role', before: 'area-a', after: null }), null)
    ).toBe('colour → ink')
  })
})
