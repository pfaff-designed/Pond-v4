/**
 * The short line a change-log record reads as — `describeChange` over the
 * record's own before/after (`Pond 06.17` 6q frame 11: "wrote 3 paragraphs ·
 * you"; `Pond 06.15` 6o frame 1: "added chickpeas, harissa · recipes · you").
 */

import { describeChange } from '@/lib/change-log/page-changes'
import type { ChangeLogAction, ChangeLogRecord } from '@/lib/change-log/types'
import type { Block } from '@/lib/documents/types'

function record(action: ChangeLogAction, before: unknown, after: unknown): ChangeLogRecord {
  return {
    id: 'rec-1',
    userId: 'user-1',
    pondId: 'pond-1',
    status: 'accepted',
    action,
    actor: 'you',
    targetPageId: 'page-1',
    targetBlockId: null,
    before,
    after,
    sourceThreadId: null,
    toolCallId: null,
    read: null,
    links: {},
    transitions: [],
    createdAt: '2026-09-21T10:39:00.000Z',
    statusAt: '2026-09-21T10:39:00.000Z',
  }
}

const text = (id: string, content: string, label?: string): Block =>
  ({ id, type: 'text', content, ...(label ? { label } : {}) }) as Block

const table = (id: string, label?: string): Block =>
  ({
    id,
    type: 'table',
    columns: ['task', 'when'],
    rows: [{ id: `${id}-r1`, cells: ['demolition', 'done'] }],
    ...(label ? { label } : {}),
  }) as Block

const checklist = (id: string): Block =>
  ({
    id,
    type: 'todo',
    items: [{ id: `${id}-i1`, label: 'ring the electrician', checked: false }],
  }) as Block

const describeEdit = (before: Block[], after: Block[]) =>
  describeChange(record('edit', before, after), null)

const ENTRY = 'Slept badly, up at six with the light.'

describe('an edit to a page reads as what was written', () => {
  it('counts the paragraphs written in one pause', () => {
    const after = text(
      'b1',
      `${ENTRY}\n\nKept thinking about the kitchen.\n\nMaybe that is the thing to write down.\n\nCooked the chickpeas again.`
    )
    expect(describeEdit([text('b1', ENTRY)], [after])).toBe('wrote 3 paragraphs')
  })

  it('says one paragraph, singular', () => {
    expect(describeEdit([], [text('b1', ENTRY)])).toBe('wrote 1 paragraph')
  })

  it('reads a paragraph changed in place as written, not as written-and-removed', () => {
    expect(describeEdit([text('b1', ENTRY)], [text('b1', `${ENTRY} Again.`)])).toBe(
      'wrote 1 paragraph'
    )
  })

  it('counts paragraphs cut with nothing written in their place', () => {
    expect(describeEdit([text('b1', `${ENTRY}\n\nSecond.\n\nThird.`)], [text('b1', ENTRY)])).toBe(
      'removed 2 paragraphs'
    )
  })

  it('names an added block by its label and kind', () => {
    expect(describeEdit([text('b1', ENTRY)], [text('b1', ENTRY), table('t1', 'schedule')])).toBe(
      'added schedule table'
    )
  })

  it('names an unlabelled block by its kind alone', () => {
    expect(describeEdit([text('b1', ENTRY), checklist('c1')], [text('b1', ENTRY)])).toBe(
      'removed checklist'
    )
  })

  it('counts several blocks under one verb', () => {
    const edited = (b: Block): Block => ({ ...b, label: 'renamed' }) as Block
    expect(
      describeEdit([table('t1'), checklist('c1')], [edited(table('t1')), edited(checklist('c1'))])
    ).toBe('edited 2 blocks')
  })

  it('joins the parts of a pause that did more than one thing', () => {
    expect(
      describeEdit(
        [text('b1', ENTRY)],
        [text('b1', `${ENTRY}\n\nKept thinking.\n\nMornings, mostly.`), table('t1', 'schedule')]
      )
    ).toBe('wrote 2 paragraphs, added schedule table')
  })

  it('reads a pure reorder as a move', () => {
    expect(describeEdit([text('b1', ENTRY), table('t1')], [table('t1'), text('b1', ENTRY)])).toBe(
      'moved a block'
    )
  })

  it('falls back to the plain line when the record carries no block snapshots', () => {
    expect(describeChange(record('edit', null, null), null)).toBe('edited this page')
  })
})

describe('a record edit reads as the record', () => {
  const row = (title: string, values: Record<string, unknown> = {}) => ({
    id: 'row-1',
    title,
    values,
  })

  it('names the row that was added', () => {
    expect(describeChange(record('add_row', null, row('chickpeas, harissa')), null)).toBe(
      'added chickpeas, harissa'
    )
  })

  it('says "a row" when the added row has no title yet', () => {
    expect(describeChange(record('add_row', null, row('')), null)).toBe('added a row')
  })

  it('names the row whose value changed', () => {
    expect(
      describeChange(
        record(
          'edit_row',
          row('dal, weeknight', { status: 'a' }),
          row('dal, weeknight', { status: 'b' })
        ),
        null
      )
    ).toBe('edited dal, weeknight')
  })

  it('reads a rename as old → new', () => {
    expect(describeChange(record('edit_row', row('dal'), row('dal, weeknight')), null)).toBe(
      'renamed dal to dal, weeknight'
    )
  })
})
