/**
 * The block frame's ENGINE — pure, no DOM (#237 / #238 / #239, PondBlock 1–3).
 *
 * `blockFrame()` reads a persisted block into the board card it renders in; the row
 * rule, the emptiness read, the collection resolution and the three insert ops are
 * the rest of the same engine. None of it renders, so none of it belongs in a
 * component test: the frame's class recipe and computed values are asserted in
 * `PondBlock.stories.tsx`, and this file holds the data underneath them.
 *
 * `null` from `blockFrame()` means the block takes NO block card, and exactly three
 * do: an UNLABELLED text block, which is bare prose (`PondTemplate.dc.html`:
 * `bare = k === 'text' && !label`), a chart drawn as the CARD, which is its own
 * (`PondChart`, #227), and a board, whose lanes sit on the page (`Pond 06.21`
 * 6u.1). A compact chart mark keeps the block card.
 */
import {
  blockFrame,
  blockIsEmpty,
  blockRowState,
  viewCollectionId,
  POND_BLOCK_EMPTY_ACTION_WIRED,
  POND_BLOCK_KINDS,
  POND_BLOCK_STATES,
  type BlockFrame,
  type PondBlockKind,
  type PondBlockState,
} from '@/lib/modules/block-frame'
import { addTodoItem } from '@/lib/modules/todo/view'
import { addTableRow } from '@/lib/modules/table/view'
import { addEntry } from '@/lib/modules/entries/view'
import type { Block } from '@/lib/modules/content'
import type { TodoBlock } from '@/lib/modules/todo/schema'
import type { TableBlock } from '@/lib/modules/table/schema'
import type { EntriesBlock } from '@/lib/modules/entries/schema'

// ── Which card a block gets ──────────────────────────────────────────────────────

const series = [{ property: 'p', agg: 'sum' as const }]

/**
 * One row per board reading. The eyebrow is the block's own LABEL when it has one
 * (#258, `hasEyebrow: !!label`) and the type/mode name when it does not; an empty or
 * whitespace label is NO label, so a future default can never quietly card every
 * paragraph in the product.
 */
const FRAMES: ReadonlyArray<[string, Block, BlockFrame | null]> = [
  // text — bare unless labelled
  ['unlabelled text is bare prose', { id: 't', type: 'text', content: 'hello' }, null],
  ['an empty label is no label', { id: 't', type: 'text', label: '', content: 'hello' }, null],
  ['a whitespace label is no label', { id: 't', type: 'text', label: '  ', content: 'h' }, null],
  [
    'a labelled text block is the 400 list card, no note (project → goal)',
    { id: 't', type: 'text', label: 'goal', content: 'Out of the flat by the 14th.' },
    { kind: 'list', heading: 'goal', headNote: '' },
  ],
  [
    'a second labelled text block (meeting → notes)',
    { id: 't', type: 'text', label: 'notes', content: 'Launch moves a week.' },
    { kind: 'list', heading: 'notes', headNote: '' },
  ],
  // todo — the card follows the MARKER (#219), the note counts done only with boxes
  [
    'a check todo → checklist, headNote "done of total"',
    {
      id: 'c',
      type: 'todo',
      items: [
        { id: '1', label: 'soak', checked: true },
        { id: '2', label: 'simmer', checked: false },
        { id: '3', label: 'stir', checked: false },
      ],
    },
    { kind: 'checklist', heading: 'checklist', headNote: '1 of 3' },
  ],
  [
    'a labelled todo keeps the checklist card and note (meeting → actions)',
    {
      id: 'c',
      type: 'todo',
      label: 'actions',
      items: [
        { id: '1', label: 'Sam — final copy', checked: false },
        { id: '2', label: 'Ana — book the room', checked: true },
      ],
    },
    { kind: 'checklist', heading: 'actions', headNote: '1 of 2' },
  ],
  [
    'a dot todo is the list card and the note is the item count',
    {
      id: 'c',
      type: 'todo',
      marker: 'dot',
      items: [
        { id: '1', label: 'milk', checked: false },
        { id: '2', label: 'bread', checked: false },
      ],
    },
    { kind: 'list', heading: 'list', headNote: '2' },
  ],
  [
    'a `none` todo is the list card too (dashboard → pages)',
    {
      id: 'c',
      type: 'todo',
      marker: 'none',
      label: 'pages',
      items: [{ id: '1', label: 'Walks', checked: false }],
    },
    { kind: 'list', heading: 'pages', headNote: '1' },
  ],
  // table — its existing `title` IS its label (#258), no second field
  [
    'table → table, the title as the eyebrow, a row count as the note',
    {
      id: 'tb',
      type: 'table',
      title: 'Power Tools',
      columns: ['Tool'],
      rows: [
        { id: 'r1', cells: ['Saw'] },
        { id: 'r2', cells: ['Plane'] },
      ],
    },
    { kind: 'table', heading: 'Power Tools', headNote: '2 rows' },
  ],
  [
    'an untitled table falls back to the kind; one row is singular',
    { id: 'tb', type: 'table', columns: ['Tool'], rows: [{ id: 'r', cells: ['x'] }] },
    { kind: 'table', heading: 'table', headNote: '1 row' },
  ],
  [
    'the tracker’s `log` title is its label — unchanged, no migration',
    { id: 'tb', type: 'table', title: 'log', columns: ['date', 'value'], rows: [] },
    { kind: 'table', heading: 'log', headNote: '0 rows' },
  ],
  // view — by mode, no note (the rows live with the collection the view fetches)
  [
    'view gallery → its own 580 card',
    { id: 'v', type: 'view', mode: 'gallery' },
    { kind: 'gallery', heading: 'gallery', headNote: '' },
  ],
  [
    'view big-number → the 400 number card',
    { id: 'v', type: 'view', mode: 'big-number' },
    { kind: 'number', heading: 'big number', headNote: '' },
  ],
  [
    'view table → the 500 table card',
    { id: 'v', type: 'view', mode: 'table' },
    { kind: 'table', heading: 'table', headNote: '' },
  ],
  [
    'view board → no block card: 6u.1 sets the lanes on the page',
    { id: 'v', type: 'view', mode: 'board' },
    null,
  ],
  [
    'view list → no block card: 6v’s list is its own card',
    { id: 'v', type: 'view', mode: 'list' },
    null,
  ],
  [
    'view calendar → the table card',
    { id: 'v', type: 'view', mode: 'calendar' },
    { kind: 'table', heading: 'calendar', headNote: '' },
  ],
  [
    'view gantt → the table card (the block board has no gantt kind), named timeline (7j)',
    { id: 'v', type: 'view', mode: 'gantt' },
    { kind: 'table', heading: 'timeline', headNote: '' },
  ],
  [
    'a stored mode no longer registered reads as the table it renders as',
    { id: 'v', type: 'view', mode: 'kanban' } as unknown as Block,
    { kind: 'table', heading: 'table', headNote: '' },
  ],
  [
    'a labelled board still takes no block card',
    { id: 'v', type: 'view', label: 'tasks — board', mode: 'board' },
    null,
  ],
  [
    'a labelled view keeps its mode’s card; the label replaces the mode name',
    { id: 'v', type: 'view', label: 'tasks — calendar', mode: 'calendar' },
    { kind: 'table', heading: 'tasks — calendar', headNote: '' },
  ],
  [
    'a labelled gallery view',
    { id: 'v', type: 'view', label: 'records', mode: 'gallery' },
    { kind: 'gallery', heading: 'records', headNote: '' },
  ],
  [
    'a labelled big-number view',
    { id: 'v', type: 'view', label: 'streak', mode: 'big-number' },
    { kind: 'number', heading: 'streak', headNote: '' },
  ],
  // chart — the CARD takes no block card; a compact mark keeps one
  [
    'a chart view with no config is the chart card — no block card (#227)',
    { id: 'v', type: 'view', mode: 'chart' },
    null,
  ],
  [
    'a configured chart card takes no block card',
    { id: 'v', type: 'view', mode: 'chart', chart: { kind: 'line', series } },
    null,
  ],
  [
    'a COMPACT mark keeps the table card and its label',
    {
      id: 'v',
      type: 'view',
      mode: 'chart',
      label: 'by week',
      chart: { kind: 'bar', series, presentation: 'compact' },
    },
    { kind: 'table', heading: 'by week', headNote: '' },
  ],
  [
    'compact on a kind the board draws no mark for falls back to the card — no frame',
    {
      id: 'v',
      type: 'view',
      mode: 'chart',
      chart: { kind: 'line', series, presentation: 'compact' },
    },
    null,
  ],
  // highlight (#249) — the default 400 card, no note
  [
    'highlight → the default 400 card, its kind as the eyebrow',
    { id: 'h', type: 'highlight', content: 'a line worth keeping' },
    { kind: 'list', heading: 'highlight', headNote: '' },
  ],
  [
    'a labelled highlight’s eyebrow is its label (reading → kept)',
    {
      id: 'h',
      type: 'highlight',
      label: 'kept',
      content: 'Three books at once is one too many.',
    },
    { kind: 'list', heading: 'kept', headNote: '' },
  ],
  // entries (#250) — the `log` card, reachable for the first time
  [
    'entries → the log card (460), the entry count as the note',
    {
      id: 'e',
      type: 'entries',
      entries: [
        { id: '1', date: '28 oct', text: 'Van booked.' },
        { id: '2', date: '24 oct', text: 'Inventory date confirmed.' },
      ],
    },
    { kind: 'log', heading: 'entries', headNote: '2 entries' },
  ],
  [
    'an empty entries block still names its count',
    { id: 'e', type: 'entries', entries: [] },
    { kind: 'log', heading: 'entries', headNote: '0 entries' },
  ],
  [
    'a labelled entries block keeps the log card and count (project → updates)',
    {
      id: 'e',
      type: 'entries',
      label: 'updates',
      entries: [{ id: '1', date: '28 oct', text: 'Van booked.' }],
    },
    { kind: 'log', heading: 'updates', headNote: '1 entry' },
  ],
  // image — the default 400 card, the filename as the note
  [
    'an image → `image`, the filename as the note',
    { id: 'i', type: 'image', url: 'https://x/a.png', filename: 'a.png' },
    { kind: 'list', heading: 'image', headNote: 'a.png' },
  ],
  [
    'a non-image file → `file`',
    { id: 'i', type: 'image', url: 'https://x/a.pdf', filename: 'a.pdf' },
    { kind: 'list', heading: 'file', headNote: 'a.pdf' },
  ],
]

describe('blockFrame — a persisted block into its board kind + head', () => {
  it.each(FRAMES)('%s', (_name, block, expected) => {
    expect(blockFrame(block)).toEqual(expected)
  })
})

// ── The row rule ─────────────────────────────────────────────────────────────────

/**
 * The board's ONLY non-rest cells across the whole 8 states × 7 kinds × 4 rows
 * sweep (#238). On `hover` the CARD does not change — exactly one child row goes
 * into the molecule's `hover` state, at the board's `R` index per kind; `number`
 * has no rows, so nothing hovers. On `selected` the ring is the card's and the one
 * row that changes is gallery's record-card 1.
 */
const NON_REST: ReadonlyArray<[PondBlockState, PondBlockKind, number, 'hover' | 'selected']> = [
  ['hover', 'list', 1, 'hover'],
  ['hover', 'checklist', 1, 'hover'],
  ['hover', 'table', 0, 'hover'],
  ['hover', 'log', 0, 'hover'],
  ['hover', 'properties', 0, 'hover'],
  ['hover', 'gallery', 0, 'hover'],
  ['selected', 'gallery', 1, 'selected'],
]

const SWEEP: ReadonlyArray<[PondBlockState, PondBlockKind]> = POND_BLOCK_STATES.flatMap((state) =>
  POND_BLOCK_KINDS.map((kind): [PondBlockState, PondBlockKind] => [state, kind])
)

describe('blockRowState — exhaustive over every state, kind and row index', () => {
  it.each(SWEEP)('%s / %s: only the board’s own row leaves rest', (state, kind) => {
    const expected = [0, 1, 2, 3].map(
      (i) => NON_REST.find(([s, k, idx]) => s === state && k === kind && idx === i)?.[3] ?? 'rest'
    )
    expect([0, 1, 2, 3].map((i) => blockRowState(kind, state, i))).toEqual(expected)
  })
})

// ── Which blocks are empty ───────────────────────────────────────────────────────

/**
 * Only the three block types that carry their OWN rows can answer (#239). Prose, a
 * file and a view are not in the parameter's union at all — a view block is config
 * only, its rows fetched by the host — so passing one is a compile error, with no
 * runtime `false` to misread.
 */
const EMPTINESS: ReadonlyArray<[string, TodoBlock | TableBlock | EntriesBlock, boolean]> = [
  ['a checklist with no items', { id: 'c', type: 'todo', items: [] }, true],
  [
    'a checklist with one item',
    { id: 'c', type: 'todo', items: [{ id: '1', label: 'soak', checked: false }] },
    false,
  ],
  ['a table with no rows', { id: 't', type: 'table', columns: ['Tool'], rows: [] }, true],
  [
    'a table with one row',
    { id: 't', type: 'table', columns: ['Tool'], rows: [{ id: 'r', cells: ['x'] }] },
    false,
  ],
  ['a log with no entries', { id: 'e', type: 'entries', entries: [] }, true],
  [
    'a log with one entry',
    { id: 'e', type: 'entries', entries: [{ id: '1', date: 'today', text: '' }] },
    false,
  ],
]

describe('blockIsEmpty — read off the block alone', () => {
  it.each(EMPTINESS)('%s', (_name, block, expected) => {
    expect(blockIsEmpty(block)).toBe(expected)
  })
})

// ── Which collection a view draws ────────────────────────────────────────────────

describe('viewCollectionId — the one resolution the canvas and the view share', () => {
  it.each([
    ['a linked view names its own collection', 'c-9', 'page-1', 'c-9'],
    ['otherwise the host page', undefined, 'page-1', 'page-1'],
    ['neither: a view outside a page host', undefined, undefined, undefined],
  ] as const)('%s', (_name, collectionId, pageId, expected) => {
    expect(viewCollectionId({ id: 'v', type: 'view', mode: 'table', collectionId }, pageId)).toBe(
      expected
    )
  })
})

// ── Which kinds have an engine path for their offered action ─────────────────────

describe('POND_BLOCK_EMPTY_ACTION_WIRED — the no-action rule is per KIND, not per view mode', () => {
  it('every row kind offers its insert; `number` alone has no engine path', () => {
    expect(POND_BLOCK_EMPTY_ACTION_WIRED).toEqual({
      list: true,
      checklist: true,
      table: true,
      gallery: true,
      number: false,
      log: true,
      properties: true,
    })
    // Exhaustive: a new kind with no ruling is a failure here, not a silent default.
    expect(Object.keys(POND_BLOCK_EMPTY_ACTION_WIRED).sort()).toEqual([...POND_BLOCK_KINDS].sort())
  })
})

// ── The pure insert ops the offered action calls ─────────────────────────────────

describe('addTodoItem / addTableRow / addEntry — inserts through the whole-block contract', () => {
  const todo: TodoBlock = {
    id: 'c',
    type: 'todo',
    items: [{ id: 'a', label: 'soak', checked: true }],
  }
  const table: TableBlock = { id: 't', type: 'table', columns: ['Tool', 'Qty'], rows: [] }
  const entries: EntriesBlock = {
    id: 'e',
    type: 'entries',
    entries: [{ id: 'a', date: '1 oct', text: 'Walked.' }],
  }

  it('addTodoItem appends one unchecked, unlabelled step with its own id; input untouched', () => {
    const next = addTodoItem(todo)
    expect(next.items).toHaveLength(2)
    expect(next.items[0]).toBe(todo.items[0]) // the rest by reference
    expect(next.items[1]).toMatchObject({ label: '', checked: false })
    expect(typeof next.items[1].id).toBe('string')
    expect(next.items[1].id).not.toBe('a')
    expect(todo.items).toHaveLength(1) // pure
  })

  it('addTableRow appends one row with an empty cell per column; input untouched', () => {
    const next = addTableRow(table)
    const rows = next.rows ?? []
    expect(rows).toHaveLength(1)
    expect(rows[0].cells).toEqual(['', ''])
    expect(typeof rows[0].id).toBe('string')
    expect(table.rows).toHaveLength(0) // pure
  })

  it('addEntry PREPENDS one blank entry dated today (#250 — newest first); input untouched', () => {
    const next = addEntry(entries, new Date(2026, 9, 2))
    expect(next.entries).toHaveLength(2)
    expect(next.entries[0]).toMatchObject({ date: '2 oct', text: '' })
    expect(typeof next.entries[0].id).toBe('string')
    expect(next.entries[0].id).not.toBe('a')
    expect(next.entries[1]).toBe(entries.entries[0])
    expect(entries.entries).toHaveLength(1) // pure
  })
})
