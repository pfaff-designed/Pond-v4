/**
 * The "changes to this page" view model — src/lib/change-log/page-changes.ts.
 */

import { describeChange, platformShortcutLabel, readMoveSnapshot } from '@/lib/change-log/page-changes'
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

  it('names a duplicate, including its own undo row', () => {
    const duplicate = record({
      id: 'dup-1',
      action: 'duplicate_page',
      before: null,
      after: { pageId: 'copy-1' },
    })
    expect(describeChange(duplicate, null)).toBe('duplicated this page')

    const undo = record({ action: 'undo', links: { undoOf: 'dup-1' } })
    const byId = new Map([[duplicate.id, duplicate]])
    expect(describeChange(undo, null, byId)).toBe('undo · duplicated this page')
  })

  it('names a glyph pick as a mark change, in Pond\'s words', () => {
    expect(
      describeChange(record({ action: 'edit_glyph', before: null, after: 'flower-02' }), null)
    ).toBe('mark → flower-02')
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

  it('names an unknown area role generically rather than misnaming it ink', () => {
    expect(
      describeChange(record({ action: 'edit_area_role', before: null, after: 'area-unknown' }), null)
    ).toBe('changed the colour')
  })

  it('names a delete and a restore from their trash snapshot, before and after respectively', () => {
    const snapshot = {
      title: 'old quotes',
      parentId: 'page-parent',
      order: 2,
      pageIds: ['page-1', 'page-2'],
      blockCount: 4,
      nestedPageCount: 1,
      parentPath: ['creativity', 'kitchen renovation'],
    }
    expect(
      describeChange(record({ action: 'delete', before: snapshot, after: null }), null)
    ).toBe('deleted old quotes')
    expect(
      describeChange(record({ action: 'restore', before: null, after: snapshot }), null)
    ).toBe('restored old quotes')
  })

  it('falls back to the bare verb when a delete or restore carries no usable snapshot', () => {
    expect(describeChange(record({ action: 'delete', before: null, after: null }), null)).toBe(
      'deleted'
    )
    expect(describeChange(record({ action: 'restore', before: null, after: null }), null)).toBe(
      'restored'
    )
  })

  it('names a move from its move snapshot\'s parent title', () => {
    const snapshot = { parentId: 'page-b', parentTitle: 'Page B', siblingOrder: ['page-1'] }
    expect(describeChange(record({ action: 'move', before: null, after: snapshot }), null)).toBe(
      'moved to Page B'
    )
  })

  it('falls back to the bare verb when a move carries no usable snapshot', () => {
    expect(describeChange(record({ action: 'move', before: null, after: null }), null)).toBe(
      'moved'
    )
    expect(
      describeChange(record({ action: 'move', before: null, after: { parentId: 'page-b' } }), null)
    ).toBe('moved')
  })

  it('never reads "moved to " bare — a null or untitled parent falls back to Untitled', () => {
    const noHomeRow = { parentId: null, parentTitle: null, siblingOrder: [] }
    expect(
      describeChange(record({ action: 'move', before: null, after: noHomeRow }), null)
    ).toBe('moved to Untitled')

    const untitledParent = { parentId: 'page-b', parentTitle: '', siblingOrder: [] }
    expect(
      describeChange(record({ action: 'move', before: null, after: untitledParent }), null)
    ).toBe('moved to Untitled')
  })
})

describe('readMoveSnapshot', () => {
  it('parses an old-shape record with no link fields', () => {
    const snapshot = { parentId: 'page-b', parentTitle: 'Page B', siblingOrder: ['page-1'] }
    expect(readMoveSnapshot(snapshot)).toEqual(snapshot)
  })

  it('parses a new-shape record carrying its link fields (KAN-467)', () => {
    const removedLinkBlock = { id: 'link-1', type: 'page-link', pageId: 'page-1' }
    const before = {
      parentId: 'page-a',
      parentTitle: 'Page A',
      siblingOrder: [],
      removedLinks: [{ block: removedLinkBlock, index: 2 }],
    }
    const after = {
      parentId: 'page-b',
      parentTitle: 'Page B',
      siblingOrder: ['page-1'],
      appendedLinkId: 'link-2',
    }
    expect(readMoveSnapshot(before)).toEqual(before)
    expect(readMoveSnapshot(after)).toEqual(after)
  })

  it('parses every entry of a multi-link removedLinks array', () => {
    const before = {
      parentId: 'page-a',
      parentTitle: 'Page A',
      siblingOrder: [],
      removedLinks: [
        { block: { id: 'link-1', type: 'page-link', pageId: 'page-1' }, index: 1 },
        { block: { id: 'link-2', type: 'page-link', pageId: 'page-1' }, index: 3 },
      ],
    }
    expect(readMoveSnapshot(before)).toEqual(before)
  })

  it('drops a malformed removedLinks entry rather than failing the whole snapshot', () => {
    const snapshot = {
      parentId: 'page-a',
      parentTitle: 'Page A',
      siblingOrder: [],
      removedLinks: [{ block: { id: 'link-1', type: 'not-a-real-block' }, index: 2 }],
    }
    expect(readMoveSnapshot(snapshot)).toEqual({
      parentId: 'page-a',
      parentTitle: 'Page A',
      siblingOrder: [],
    })
  })

  it('still rejects a malformed record outright', () => {
    expect(readMoveSnapshot(null)).toBeNull()
    expect(readMoveSnapshot({ parentId: 'page-b' })).toBeNull()
  })
})

describe('platformShortcutLabel', () => {
  it('is the Mac chord on a Mac', () => {
    expect(platformShortcutLabel(true)).toBe('⌥⌘H')
  })

  it('is the Windows/Linux chord elsewhere', () => {
    expect(platformShortcutLabel(false)).toBe('Ctrl+Alt+H')
  })
})
