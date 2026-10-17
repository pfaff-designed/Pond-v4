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

import React from 'react'
import { render, screen } from '@testing-library/react'

import { templateBlocksFrom } from '@/lib/templates/from-page'
import type { Block } from '@/lib/modules/content'
import { EntriesView } from '@/lib/modules/entries/view'
import type { EntriesBlock } from '@/lib/modules/entries/schema'

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

/** Not in `EVERY_TYPE`/`CASES`: a page-link is dropped, never emptied — see below. */
const PAGE_LINK = { id: 'b12', type: 'page-link', pageId: 'original-page' } as Block

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
      name: 'entries keeps its label, loses every entry',
      block: ENTRIES,
      shape: { type: 'entries', label: 'journal' },
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

  // ── A page-link is DROPPED, not emptied (KAN-122) ──────────────────────────

  it('drops a page-link block entirely — an emptied pageId would be a dead, unfixable "page in trash" row on every page the template makes', () => {
    const out = templateBlocksFrom([TEXT, PAGE_LINK, IMAGE], counter())
    expect(out.map((b) => b.type)).toEqual(['text', 'image'])
  })

  it('a page saved as only a page-link saves as an empty template', () => {
    expect(templateBlocksFrom([PAGE_LINK], counter())).toEqual([])
  })

  // ── A block's own placeholder (KAN-103) survives being emptied ─────────────

  it('todo carries its first item’s placeholder forward onto the rebuilt row', () => {
    const block = {
      id: 'b8',
      type: 'todo',
      marker: 'check',
      items: [
        { id: 'i1', label: 'chickpeas', checked: true, placeholder: 'first item' },
        { id: 'i2', label: 'harissa', checked: false },
      ],
    } as Block
    const [out] = templateBlocksFrom([block], counter())
    expect(out).toMatchObject({ items: [{ label: '', checked: false, placeholder: 'first item' }] })
  })

  it('todo with no item placeholder omits the key entirely, rather than writing it as undefined', () => {
    const [out] = templateBlocksFrom([TODO], counter())
    const items = (out as { items: Array<Record<string, unknown>> }).items
    expect(Object.hasOwn(items[0], 'placeholder')).toBe(false)
  })

  it('text keeps its block-level placeholder for free, via the spread', () => {
    const block = {
      id: 'b9',
      type: 'text',
      content: 'simmer 25 min',
      placeholder: 'anything, in any order',
    } as Block
    const [out] = templateBlocksFrom([block], counter())
    expect(out).toMatchObject({ content: '', placeholder: 'anything, in any order' })
  })

  it('entries with a placeholder keeps ONE blank entry, so the placeholder actually draws', () => {
    const block = {
      id: 'b10',
      type: 'entries',
      entries: [{ id: 'e1', date: '2026-10-04', text: 'went well' }],
      placeholder: 'first update',
    } as Block
    const [out] = templateBlocksFrom([block], counter())
    expect(out).toMatchObject({
      entries: [{ date: 'today', text: '' }],
      placeholder: 'first update',
    })

    render(React.createElement(EntriesView, { data: out as EntriesBlock, editable: false }))
    expect(screen.getByText('first update')).toBeInTheDocument()
  })

  it('entries with NO placeholder still empties to no entries at all', () => {
    const block = {
      id: 'b11',
      type: 'entries',
      entries: [{ id: 'e1', date: '2026-10-04', text: 'went well' }],
    } as Block
    const [out] = templateBlocksFrom([block], counter())
    expect(out).toMatchObject({ entries: [] })
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

  it('STILL drops a page-link block — this is also the "move onto a template" preview path (applyTemplate uses keepContent), so a previewed template never shows a dead link either', () => {
    const out = templateBlocksFrom([TEXT, PAGE_LINK], counter(), { keepContent: true })
    expect(out.map((b) => b.type)).toEqual(['text'])
  })
})
