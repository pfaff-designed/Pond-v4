/**
 * The block menu's `turn into` group. `conversionsFor` is pure: it lists the targets a block can
 * become without losing what it says, in the menu's order, and each target's
 * `apply` makes the new block. Table delegates to the list → database writer,
 * which is stood in for here so the delegation itself is what is asserted.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  conversionsFor,
  type ConversionTarget,
  type LineConversion,
  type TableConversion,
} from '@/lib/modules/conversions'
import type { Database } from '@/lib/supabase/types'
import type { Block } from '@/lib/modules/content'
import type { TextBlock } from '@/lib/modules/text/schema'
import type { TodoBlock } from '@/lib/modules/todo/schema'

const mockCreateDatabaseFromList = jest.fn()
jest.mock('@/lib/pages/list-to-table', () => ({
  ...jest.requireActual('@/lib/pages/list-to-table'),
  createDatabaseFromList: (...args: unknown[]) => mockCreateDatabaseFromList(...args),
}))

const counter = () => {
  let n = 0
  return () => `id-${++n}`
}

const list: TodoBlock = {
  id: 'b-list',
  type: 'todo',
  marker: 'dot',
  label: 'shopping',
  items: [
    { id: 'i1', label: '2 eggs', checked: false },
    { id: 'i2', label: '3 apples', checked: false, meta: 'green' },
    { id: 'i3', label: '1 lemon', checked: false },
  ],
}

const checklist: TodoBlock = {
  id: 'b-check',
  type: 'todo',
  items: [
    { id: 'c1', label: 'book the plumber', checked: true },
    { id: 'c2', label: 'order tiles', checked: false, meta: '27 oct' },
  ],
}

const markdownList: TextBlock = {
  id: 'b-md',
  type: 'text',
  content: '- 500g strong white flour\n- 350g water\n- 100g levain\n- 10g salt',
}

const prose: TextBlock = {
  id: 'b-prose',
  type: 'text',
  label: 'notes',
  content: 'Cabinets are the only open cost.\n\n* ask about lead times\n1. measure twice',
}

const targets = (block: Block) => conversionsFor(block).map((c) => c.target)

const pick = <T extends ConversionTarget>(block: Block, target: T, mintId = counter()) => {
  const found = conversionsFor(block, mintId).find((c) => c.target === target)
  if (!found) throw new Error(`no ${target} conversion`)
  return found as T extends 'table' ? TableConversion : LineConversion
}

beforeEach(() => jest.clearAllMocks())

describe('which targets keep the content', () => {
  it('a list offers table, checklist and text — never itself', () => {
    expect(targets(list)).toEqual(['table', 'checklist', 'text'])
  })

  it('a checklist offers list and text, but no table: its checked state has no column to go to', () => {
    expect(targets(checklist)).toEqual(['list', 'text'])
  })

  it('a markdown list in a text block offers table, list and checklist', () => {
    expect(targets(markdownList)).toEqual(['table', 'list', 'checklist'])
  })

  it('prose offers list and checklist, but no table: its lines are not a list', () => {
    expect(targets(prose)).toEqual(['list', 'checklist'])
  })

  it('an empty list or checklist has nothing to keep, so it offers nothing', () => {
    expect(targets({ ...list, items: [] })).toEqual([])
    expect(targets({ ...checklist, items: [] })).toEqual([])
  })

  it('an empty text block has nothing to keep, so it offers nothing', () => {
    expect(targets({ id: 'e', type: 'text', content: ' \n\n ' })).toEqual([])
  })

  it('a block with no line shape offers nothing', () => {
    const table: Block = {
      id: 't',
      type: 'table',
      columns: ['tool'],
      rows: [{ id: 'r', cells: ['saw'] }],
    }
    const view: Block = { id: 'v', type: 'view', mode: 'table', collectionId: 'db' }
    expect(targets(table)).toEqual([])
    expect(targets(view)).toEqual([])
  })

  it('reads a `none`-marker list as a list', () => {
    expect(targets({ ...list, marker: 'none' })).toEqual(['table', 'checklist', 'text'])
  })
})

describe('list ⇄ checklist', () => {
  it('list → checklist keeps every item byte-for-byte and the block’s id and label', () => {
    const next = pick(list, 'checklist').apply()
    expect(next).toEqual({ ...list, marker: 'check' })
  })

  it('the round trip list → checklist → list is the list it started as', () => {
    const back = pick(pick(list, 'checklist').apply(), 'list').apply()
    expect(back).toEqual(list)
  })

  it('checklist → list drops the checked state, and only that', () => {
    const next = pick(checklist, 'list').apply()
    expect(next).toEqual({
      ...checklist,
      marker: 'dot',
      items: [
        { id: 'c1', label: 'book the plumber', checked: false },
        { id: 'c2', label: 'order tiles', checked: false, meta: '27 oct' },
      ],
    })
  })
})

describe('to text', () => {
  it('list → text writes one list line per item, keeping each meta', () => {
    expect(pick(list, 'text').apply()).toEqual({
      id: 'b-list',
      type: 'text',
      label: 'shopping',
      content: '- 2 eggs\n- 3 apples · green\n- 1 lemon',
    })
  })

  it('checklist → text drops the checked state', () => {
    expect(pick(checklist, 'text').apply()).toEqual({
      id: 'b-check',
      type: 'text',
      content: '- book the plumber\n- order tiles · 27 oct',
    })
  })
})

describe('from text', () => {
  it('text → list maps each non-blank line to an item, its list marker stripped', () => {
    expect(pick(prose, 'list').apply()).toEqual({
      id: 'b-prose',
      type: 'todo',
      marker: 'dot',
      label: 'notes',
      items: [
        { id: 'id-1', label: 'Cabinets are the only open cost.', checked: false },
        { id: 'id-2', label: 'ask about lead times', checked: false },
        { id: 'id-3', label: 'measure twice', checked: false },
      ],
    })
  })

  it('text → checklist reads a `[x]` line as checked and a `[ ]` line as open', () => {
    const tasks: TextBlock = { id: 'b-t', type: 'text', content: '- [x] sand\n- [ ] prime\npaint' }
    expect(pick(tasks, 'checklist').apply()).toEqual({
      id: 'b-t',
      type: 'todo',
      marker: 'check',
      items: [
        { id: 'id-1', label: 'sand', checked: true },
        { id: 'id-2', label: 'prime', checked: false },
        { id: 'id-3', label: 'paint', checked: false },
      ],
    })
  })

  it('text → list drops a `[x]` mark — a list has nothing to tick', () => {
    const tasks: TextBlock = { id: 'b-t', type: 'text', content: '- [x] sand' }
    const next = pick(tasks, 'list').apply() as TodoBlock
    expect(next.items).toEqual([{ id: 'id-1', label: 'sand', checked: false }])
  })

  it('an item takes its line’s plain text: a heading’s #s and emphasis marks go', () => {
    const marked: TextBlock = {
      id: 'b-m',
      type: 'text',
      content:
        '## Kitchen\n- **order** tiles\n- [ ] pick the _grout_ colour\n- rename snake_case_file',
    }
    const next = pick(marked, 'checklist').apply() as TodoBlock
    expect(next.items.map((item) => item.label)).toEqual([
      'Kitchen',
      'order tiles',
      'pick the grout colour',
      'rename snake_case_file',
    ])
  })

  it('a markdown list survives text → list → text byte-for-byte', () => {
    const back = pick(pick(markdownList, 'list').apply(), 'text').apply()
    expect(back).toEqual(markdownList)
  })
})

describe('heading, quote, code', () => {
  const heading: TextBlock = { id: 'b-heading', type: 'text', content: '## ingredients' }
  const quote: TextBlock = { id: 'b-quote', type: 'text', content: '> keep it simple' }
  const code: TextBlock = { id: 'b-code', type: 'text', content: '```\nconst x = 1\n```' }
  const line: TextBlock = { id: 'b-line', type: 'text', content: 'hello' }

  it('a heading offers every other shape and list/checklist — never itself or table', () => {
    expect(targets(heading)).toEqual([
      'heading-1',
      'heading-3',
      'quote',
      'code',
      'list',
      'checklist',
      'text',
    ])
  })

  it('a quote offers every heading level, code and text, plus list/checklist — never itself', () => {
    expect(targets(quote)).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'code',
      'list',
      'checklist',
      'text',
    ])
  })

  it('a code block offers every heading level, quote and text, plus list/checklist — never itself', () => {
    expect(targets(code)).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'quote',
      'list',
      'checklist',
      'text',
    ])
  })

  it('a single-line text block, being one node, now offers heading, quote and code too', () => {
    expect(targets(line)).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'quote',
      'code',
      'list',
      'checklist',
    ])
  })

  it('a multi-line text block is not a single node, so it offers none of the five', () => {
    expect(targets(prose)).toEqual(['list', 'checklist'])
  })

  it('retypes the content, keeping the block’s id and label', () => {
    expect(pick(heading, 'text').apply()).toEqual({
      id: 'b-heading',
      type: 'text',
      content: 'ingredients',
    })
    expect(pick(quote, 'heading-2').apply()).toEqual({
      id: 'b-quote',
      type: 'text',
      content: '## keep it simple',
    })
    expect(pick(code, 'quote').apply()).toEqual({
      id: 'b-code',
      type: 'text',
      content: '> const x = 1',
    })
  })
})

describe('→ table delegates to the list → database writer', () => {
  it('previews a list’s table — 3 rows · 2 columns for the board’s fixture shape', () => {
    expect(pick(list, 'table').preview).toBe('3 rows · 2 columns')
    expect(pick(markdownList, 'table').preview).toBe('4 rows · 3 columns')
  })

  it('singularises a one-row, one-column preview', () => {
    const one: TodoBlock = { ...list, items: [{ id: 'i', label: 'saw', checked: false }] }
    expect(pick(one, 'table').preview).toBe('1 row · 1 column')
  })

  it('the conversions with nothing to count carry no preview', () => {
    const previews = conversionsFor(list)
      .filter((c) => c.target !== 'table')
      .map((c) => c.preview)
    expect(previews).toEqual([null, null])
  })

  it('a markdown list is handed to the writer as it is', async () => {
    const made = { view: { id: 'v' }, databaseId: 'db' }
    mockCreateDatabaseFromList.mockResolvedValueOnce(made)
    const supabase = {} as SupabaseClient<Database>
    const mintId = counter()
    const result = await pick(markdownList, 'table').apply(
      supabase,
      { title: 'ingredients', pondId: 'pond-1' },
      mintId
    )
    expect(result).toBe(made)
    expect(mockCreateDatabaseFromList).toHaveBeenCalledWith(
      supabase,
      { block: markdownList, title: 'ingredients', pondId: 'pond-1' },
      mintId
    )
  })

  it('a list is handed over as its list lines, so every item becomes a row', async () => {
    mockCreateDatabaseFromList.mockResolvedValueOnce({})
    const supabase = {} as SupabaseClient<Database>
    await pick(list, 'table').apply(supabase, { title: 'shopping', pondId: null }, counter())
    const [, input] = mockCreateDatabaseFromList.mock.calls[0]
    expect(input.block).toEqual({
      id: 'b-list',
      type: 'text',
      content: '- 2 eggs\n- 3 apples · green\n- 1 lemon',
    })
  })
})
