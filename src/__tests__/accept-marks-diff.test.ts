/**
 * `touchedMarks` (KAN-143) — the finest-unit mark targets an accept leaves.
 */

import type { Block } from '@/lib/documents/types'
import type { TodoItem } from '@/lib/modules/todo/schema'
import { touchedMarks } from '@/lib/change-log/accept-marks-diff'

function text(id: string, content: string): Block {
  return { id, type: 'text', content } as Block
}

function item(id: string, label: string, checked = false): TodoItem {
  return { id, label, checked }
}

function todo(id: string, items: TodoItem[], over: Record<string, unknown> = {}): Block {
  return { id, type: 'todo', items, ...over } as Block
}

function table(id: string, rows: { id: string; cells: string[] }[]): Block {
  return { id, type: 'table', columns: ['a'], rows } as Block
}

describe('touchedMarks', () => {
  it.each<[string, Block[], Block[], string[]]>([
    [
      'a block add is a block-level target',
      [text('a', 'one')],
      [text('a', 'one'), text('b', 'two')],
      ['block:b'],
    ],
    [
      'a block remove is a block-level target',
      [text('a', 'one'), text('b', 'two')],
      [text('a', 'one')],
      ['block:b'],
    ],
    [
      'a text block edit is a block-level target',
      [text('a', 'one')],
      [text('a', 'ONE')],
      ['block:a'],
    ],
    [
      "a todo item add/edit/remove, the block's own label untouched, marks only the rows",
      [
        todo('t', [item('1', 'electrician, second fix'), item('2', 'worktop template'), item('3', 'tiles')], {
          label: 'actions',
        }),
      ],
      [
        todo(
          't',
          [item('1', 'electrician, second fix', true), item('3', 'tiles'), item('4', 'grout')],
          { label: 'actions' }
        ),
      ],
      ['block:t:row:1', 'block:t:row:2', 'block:t:row:4'],
    ],
    [
      'a table row edit is a block-level target (not row-targeted in this slice)',
      [table('tb', [{ id: 'r1', cells: ['x'] }])],
      [table('tb', [{ id: 'r1', cells: ['y'] }])],
      ['block:tb'],
    ],
    [
      "a todo block edited only in a non-row field marks the block, not a row",
      [todo('t', [item('1', 'tiles')], { label: 'actions' })],
      [todo('t', [item('1', 'tiles')], { label: 'steps' })],
      ['block:t'],
    ],
    [
      'two blocks touched marks both',
      [text('a', 'one'), todo('t', [item('1', 'tiles')])],
      [text('a', 'ONE'), todo('t', [item('1', 'grout')])],
      ['block:a', 'block:t:row:1'],
    ],
    [
      'no change reports nothing',
      [text('a', 'one'), todo('t', [item('1', 'tiles')])],
      [text('a', 'one'), todo('t', [item('1', 'tiles')])],
      [],
    ],
  ])('%s', (_label, before, after, expected) => {
    expect(touchedMarks(before, after).sort()).toEqual([...expected].sort())
  })
})
