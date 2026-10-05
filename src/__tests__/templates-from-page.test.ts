/**
 * `templateBlocksFrom` — what a saved template carries (KAN-10 / #157, board `6i`).
 *
 * The board's rule is the whole spec: "Structure and labels by default. The
 * content of this page stays behind unless ticked" — "by default a saved template
 * is the stack, the labels and the placeholders."
 *
 * One parametrised table over the whole `Block` union, because every type answers
 * the same two questions (what is shape, what is content) and seven near-identical
 * `it`s would say it seven times.
 */

import { templateBlocksFrom } from '@/lib/templates/from-page'
import type { Block } from '@/lib/modules/content'

/** Deterministic ids, so the table can assert exact output. */
function counter() {
  let n = 0
  return () => `t${++n}`
}

// ── The union, each with content AND shape, so stripping is observable ───────

const TEXT = { id: 'b1', type: 'text', label: 'method', content: 'simmer 25 min' } as Block
const HIGHLIGHT = { id: 'b2', type: 'highlight', content: 'the one passage' } as Block
const IMAGE = { id: 'b3', type: 'image', label: 'the dish', url: 'https://x/y.jpg' } as Block
const TODO = {
  id: 'b4',
  type: 'todo',
  label: 'shopping',
  marker: 'check',
  items: [
    { id: 'i1', label: 'chickpeas', checked: true },
    { id: 'i2', label: 'harissa', checked: false },
  ],
} as Block
const TABLE = {
  id: 'b5',
  type: 'table',
  title: 'quotes',
  columns: ['supplier', 'price', 'lead time'],
  rows: [
    { id: 'r1', cells: ['Acme', '£400', '2w'] },
    { id: 'r2', cells: ['Beta', '£380', '4w'] },
    { id: 'r3', cells: ['Gamma', '£410', '1w'] },
  ],
} as Block
const ENTRIES = {
  id: 'b6',
  type: 'entries',
  label: 'journal',
  serif: true,
  entries: [{ id: 'e1', date: '2026-10-04', text: 'went well' }],
} as Block
const VIEW = {
  id: 'b7',
  type: 'view',
  label: 'calories',
  mode: 'chart',
  collectionId: 'coll-original',
  chart: { kind: 'line', xProperty: 'f-day', series: [{ property: 'f-kcal', agg: 'sum' }] },
} as Block

const EVERY_TYPE: Block[] = [TEXT, HIGHLIGHT, IMAGE, TODO, TABLE, ENTRIES, VIEW]

describe('templateBlocksFrom — structure and labels by default', () => {
  /**
   * `shape` is what must survive; `emptied` is what the block must look like
   * once its content is gone. Both asserted per type so a regression names the
   * type it broke.
   */
  const CASES: Array<{
    name: string
    block: Block
    shape: Record<string, unknown>
    emptied: Record<string, unknown>
  }> = [
    {
      name: 'text keeps its label, loses its content',
      block: TEXT,
      shape: { type: 'text', label: 'method' },
      emptied: { content: '' },
    },
    {
      name: 'highlight loses the passage (wheat has one legal job and it is not a placeholder)',
      block: HIGHLIGHT,
      shape: { type: 'highlight' },
      emptied: { content: '' },
    },
    {
      name: 'image keeps its label, loses the file',
      block: IMAGE,
      shape: { type: 'image', label: 'the dish' },
      emptied: { url: '' },
    },
    {
      name: 'todo keeps its MARKER — a checklist and a bullet list are different shapes',
      block: TODO,
      shape: { type: 'todo', label: 'shopping', marker: 'check' },
      emptied: { items: [{ id: 't2', label: '', checked: false }] },
    },
    {
      name: 'table keeps its columns and title, loses every row',
      block: TABLE,
      shape: { type: 'table', title: 'quotes', columns: ['supplier', 'price', 'lead time'] },
      emptied: {
        rows: [
          { id: 't2', cells: ['', '', ''] },
          { id: 't3', cells: ['', '', ''] },
        ],
      },
    },
    {
      name: 'entries keeps its serif flag — that is what makes a journal a journal',
      block: ENTRIES,
      shape: { type: 'entries', label: 'journal', serif: true },
      emptied: { entries: [] },
    },
    {
      name: 'view keeps its mode and chart config',
      block: VIEW,
      shape: {
        type: 'view',
        label: 'calories',
        mode: 'chart',
        chart: { kind: 'line', xProperty: 'f-day', series: [{ property: 'f-kcal', agg: 'sum' }] },
      },
      emptied: {},
    },
  ]

  it.each(CASES)('$name', ({ block, shape, emptied }) => {
    const [out] = templateBlocksFrom([block], counter())
    expect(out).toMatchObject(shape)
    expect(out).toMatchObject(emptied)
  })

  // ── The two rules that are not per-type ────────────────────────────────────

  it('drops a view’s collectionId — a template is a shape you copy, never a tie', () => {
    const [out] = templateBlocksFrom([VIEW], counter())
    // Not merely undefined: the key is gone, so serialising the template cannot
    // carry a dangling reference to the original page's database.
    expect(Object.hasOwn(out, 'collectionId')).toBe(false)
  })

  it('mints fresh ids throughout, so template blocks never collide with the page’s', () => {
    const out = templateBlocksFrom(EVERY_TYPE, counter())
    const pageIds = new Set(EVERY_TYPE.map((b) => b.id))
    for (const b of out) expect(pageIds.has(b.id)).toBe(false)
    // Including the ids nested inside a todo's items and a table's rows — those
    // would otherwise be shared with the page and confuse the diff path.
    expect(new Set(out.map((b) => b.id)).size).toBe(out.length)
  })

  it('never mutates the page’s own blocks — the page is not touched by being saved', () => {
    const before = JSON.parse(JSON.stringify(EVERY_TYPE))
    templateBlocksFrom(EVERY_TYPE, counter())
    expect(EVERY_TYPE).toEqual(before)
  })

  it('keeps the stack — same length, same order', () => {
    const out = templateBlocksFrom(EVERY_TYPE, counter())
    expect(out.map((b) => b.type)).toEqual(EVERY_TYPE.map((b) => b.type))
  })

  it('an empty page saves as an empty template rather than throwing', () => {
    expect(templateBlocksFrom([], counter())).toEqual([])
  })
})

describe('templateBlocksFrom — keepContent, the sheet’s one tick', () => {
  it('keeps every block’s content verbatim', () => {
    const out = templateBlocksFrom(EVERY_TYPE, counter(), { keepContent: true })
    // Compared with ids normalised and the view's tie dropped from both sides —
    // the tie is never carried, in either mode (asserted below).
    const normalise = (b: Block) => {
      const n = { ...b, id: 'x' } as Record<string, unknown>
      delete n.collectionId
      return n
    }
    expect(out.map(normalise)).toEqual(EVERY_TYPE.map(normalise))
  })

  it('still mints fresh ids — content is copied, identity is not', () => {
    const out = templateBlocksFrom(EVERY_TYPE, counter(), { keepContent: true })
    const pageIds = new Set(EVERY_TYPE.map((b) => b.id))
    for (const b of out) expect(pageIds.has(b.id)).toBe(false)
  })

  it('STILL drops the collectionId — "this page\u2019s content" is not another page\u2019s records', () => {
    // A view's records live in a database page, not in this one. Carrying the id
    // would make every page made from this template read that one database — and
    // in another pond, that is a cross-pond read of the kind #323 removed.
    // Conservative reading of `6i` frame 4; flagged as open on KAN-10.
    const [out] = templateBlocksFrom([VIEW], counter(), { keepContent: true })
    expect(Object.hasOwn(out, 'collectionId')).toBe(false)
  })
})
