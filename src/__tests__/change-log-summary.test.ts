/**
 * The short line a change-log record reads as — `describeChange` over the
 * record's own before/after: "wrote 3 paragraphs", "added chickpeas, harissa",
 * "electrician → w/c 6 oct", "revert of 09:31".
 */

import { describeChange, describeUndoneEffect } from '@/lib/change-log/page-changes'
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

  it('counts a heading written apart from a paragraph', () => {
    expect(describeEdit([], [text('b1', '# Morning')])).toBe('wrote 1 heading')
  })

  it('counts a heading and a paragraph written in the same pause as two phrases', () => {
    expect(describeEdit([], [text('b1', `# Morning\n\n${ENTRY}`)])).toBe(
      'wrote 1 heading, wrote 1 paragraph'
    )
  })

  it('counts a heading removed apart from a paragraph', () => {
    expect(describeEdit([text('b1', `## Plan\n\n${ENTRY}`)], [text('b1', ENTRY)])).toBe(
      'removed 1 heading'
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

  it('names an empty text block added or removed, rather than calling it a move', () => {
    expect(describeEdit([table('t1')], [table('t1'), text('b1', '')])).toBe('added text')
    expect(describeEdit([table('t1'), text('b1', '')], [table('t1')])).toBe('removed text')
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
  const row = (
    title: string,
    values: Record<string, unknown> = {},
    shown: Record<string, string> = {}
  ) => ({ id: 'row-1', title, values, shown })

  it('names the record that was added', () => {
    expect(describeChange(record('add_row', null, row('chickpeas, harissa')), null)).toBe(
      'added chickpeas, harissa'
    )
  })

  it('says "a record" when the added record has no title yet', () => {
    expect(describeChange(record('add_row', null, row('')), null)).toBe('added a record')
  })

  it('says "a record" for an add it cannot read as a record', () => {
    const call = { collectionId: 'col-1', title: 'dune', props: { status: 'reading' } }
    expect(describeChange(record('add_row', null, call), null)).toBe('added a record')
  })

  it('reads a value change as record → value, as the field shows it', () => {
    // A select stores its option id; the record carries the label the field showed.
    const before = row('electrician', { when: 'o-29' }, { when: 'w/c 29 sep' })
    const after = row('electrician', { when: 'o-6' }, { when: 'w/c 6 oct' })
    expect(describeChange(record('edit_row', before, after), null)).toBe('electrician → w/c 6 oct')
  })

  it('lists every field that changed in the pause', () => {
    const before = row('worktop', { when: 'a', who: 'x' }, { when: 'w/c 20 oct', who: 'sam' })
    const after = row('worktop', { when: 'b', who: 'y' }, { when: 'w/c 27 oct', who: 'j. hart' })
    expect(describeChange(record('edit_row', before, after), null)).toBe(
      'worktop → w/c 27 oct, j. hart'
    )
  })

  it('shows a cleared value as the empty mark', () => {
    const before = row('worktop', { when: 'a' }, { when: 'w/c 20 oct' })
    const after = row('worktop', { when: null }, { when: '' })
    expect(describeChange(record('edit_row', before, after), null)).toBe('worktop → —')
  })

  it('reads a rename as old to new', () => {
    expect(describeChange(record('edit_row', row('dal'), row('dal, weeknight')), null)).toBe(
      'renamed dal to dal, weeknight'
    )
  })

  it('names an untitled record "a record"', () => {
    expect(describeChange(record('edit_row', row(''), row('dal')), null)).toBe(
      'renamed a record to dal'
    )
    expect(
      describeChange(
        record(
          'edit_row',
          row('', { when: 'a' }, { when: 'mon' }),
          row('', { when: 'b' }, { when: 'tue' })
        ),
        null
      )
    ).toBe('a record → tue')
  })

  it('says "edited a record" when it cannot read the snapshots', () => {
    expect(describeChange(record('edit_row', null, { values: [] }), null)).toBe('edited a record')
  })
})

describe('Pond’s edit to a table reads as the record it changed', () => {
  const schedule = (rows: Array<[string, string, string]>): Block =>
    ({
      id: 't1',
      type: 'table',
      label: 'schedule',
      columns: ['task', 'when'],
      rows: rows.map(([id, task, when]) => ({ id, cells: [task, when] })),
    }) as Block

  const BEFORE = schedule([
    ['r1', 'electrician, second fix', 'provisional, w/c 29 sep'],
    ['r2', 'worktop template', 'not booked'],
  ])

  it('one cell changed reads as record → value', () => {
    const after = schedule([
      ['r1', 'electrician, second fix', 'w/c 6 oct'],
      ['r2', 'worktop template', 'not booked'],
    ])
    expect(describeEdit([BEFORE], [after])).toBe('electrician, second fix → w/c 6 oct')
  })

  it('one row added reads as the record added', () => {
    const after = schedule([
      ['r1', 'electrician, second fix', 'provisional, w/c 29 sep'],
      ['r2', 'worktop template', 'not booked'],
      ['r3', 'skip hire', 'mon'],
    ])
    expect(describeEdit([BEFORE], [after])).toBe('added skip hire')
  })

  it('more than one record changed reads as the table', () => {
    const after = schedule([
      ['r1', 'electrician, second fix', 'w/c 6 oct'],
      ['r2', 'worktop template', 'w/c 27 oct'],
    ])
    expect(describeEdit([BEFORE], [after])).toBe('edited schedule table')
  })
})

describe('the undo notice reads the undone record backwards', () => {
  const row = (
    title: string,
    values: Record<string, unknown> = {},
    shown: Record<string, string> = {}
  ) => ({ id: 'row-1', title, values, shown })

  it('reads an undone add_row as removed, the board’s own example', () => {
    expect(describeUndoneEffect(record('add_row', null, row('chickpeas, harissa')))).toBe(
      'removed chickpeas, harissa'
    )
  })

  it('reads an undone block edit as the reverse of what was written', () => {
    const before = [text('b1', ENTRY)]
    const after = [text('b1', `${ENTRY}\n\nSecond.`)]
    expect(describeUndoneEffect(record('edit', before, after))).toBe('removed 1 paragraph')
  })

  it('reads an undone edit_row as the value it had before', () => {
    const before = row('electrician', { when: 'o-29' }, { when: 'w/c 29 sep' })
    const after = row('electrician', { when: 'o-6' }, { when: 'w/c 6 oct' })
    expect(describeUndoneEffect(record('edit_row', before, after))).toBe(
      'electrician → w/c 29 sep'
    )
  })
})

describe('a schema edit reads as the field that changed (KAN-380)', () => {
  const field = (id: string, name: string) => ({ id, name, type: 'text' as const })

  it('reads a rename as old field to new', () => {
    const before = [field('f1', 'field 2')]
    const after = [field('f1', 'due')]
    expect(describeChange(record('edit_schema', before, after), null)).toBe(
      'renamed field field 2 to due'
    )
  })

  it('reads a delete, naming the field that was removed', () => {
    const before = [field('f1', 'due'), field('f2', 'priority')]
    const after = [field('f2', 'priority')]
    expect(describeChange(record('edit_schema', before, after), null)).toBe('deleted field due')
  })

  it('reads an add, naming the field that was appended', () => {
    const before = [field('f1', 'priority')]
    const after = [field('f1', 'priority'), field('f2', 'due')]
    expect(describeChange(record('edit_schema', before, after), null)).toBe('added field due')
  })

  it('says "edited the fields" when it cannot read the snapshots', () => {
    expect(describeChange(record('edit_schema', null, null), null)).toBe('edited the fields')
  })
})

describe('a revert reads as the change it sets back', () => {
  it('names the original by its time', () => {
    const original = record('edit', null, null)
    const revert = { ...record('revert', null, null), links: { revertOf: original.id } }
    const clock = new Date(original.createdAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    expect(describeChange(revert, original)).toBe(`revert of ${clock}`)
  })

  it('says "an earlier change" when the original is not at hand', () => {
    expect(describeChange(record('revert', null, null), null)).toBe('revert of an earlier change')
  })
})
