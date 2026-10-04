/**
 * The ⌘K palette — `PondPicker kind="palette"` (#279, child b of #226).
 *
 * The words the surface speaks — its group labels and its foot legend — are read
 * off `PondPicker.dc.html`'s own palette branch at test time, never hand-copied,
 * so a label the board does not use cannot reach the surface. The list itself
 * (`palette-entries`) is checked state by state against the board's frames, and
 * the shell's derivation (`lib/pages/palette-items`) against the owners it
 * composes: the breadcrumb's ancestry, the databases root, the page mark.
 */

import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'

import { CommandPalette } from '@/components/molecules/CommandPalette'
import {
  ASK_POND_ID,
  NEW_PAGE_ID,
  PALETTE_FOOT,
  paletteEntries,
  type PaletteEntry,
} from '@/components/molecules/palette-entries'
import { newPageParent, paletteItems, paletteScope } from '@/lib/pages/palette-items'
import { DATABASES_ROOT_TITLE } from '@/lib/pages/databases-root'
import type { PageRow } from '@/lib/pages/tree'
import { PALETTE_ITEMS, PALETTE_SUGGESTED, paletteChrome } from './helpers/palette-fixture'
import { readHandoff } from './helpers/handoff'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

/** The palette branch of `PondPicker.dc.html`'s `renderVals()` — the `else` after `source`. */
function boardPaletteBranch(): string {
  const html = readHandoff('PondPicker.dc.html')
  const start = html.indexOf('sansRows = true')
  const end = html.indexOf('const rowPad', start)
  return html.slice(start, end)
}
const boardGroups = () => [...boardPaletteBranch().matchAll(/\bG\('([^']+)'\)/g)].map((m) => m[1])
const boardFoot = () => {
  const m = boardPaletteBranch().match(/const keys = \[([^\]]+)\]/)!
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

// The board's own rows, as items, are `helpers/palette-fixture` — shared with the stories.

const shape = (entries: PaletteEntry[]) =>
  entries.map((e) =>
    e.kind === 'group'
      ? `G:${e.label}`
      : e.kind === 'note'
        ? `N:${e.text}`
        : `${e.item.kind}:${e.item.label}`
  )
const groupsOf = (entries: PaletteEntry[]) =>
  entries.flatMap((e) => (e.kind === 'group' ? [e.label] : []))
/** One query per state — `sav` reaches the capitalised `Savings`. */
const QUERIES = ['', 'cab', '> log', 'adobe', 'cabnet', 'make', 'sav']

// ── The list, state by state ───────────────────────────────────────────────────

describe('paletteEntries — the board’s states', () => {
  it('the handoff really was read (guards the parser)', () => {
    expect(boardGroups()).toEqual(
      expect.arrayContaining(['recent', 'pages', 'records', 'actions', 'did you mean'])
    )
    expect(boardFoot()).toHaveLength(4)
  })

  it('the foot legend is the board’s `keys`, verbatim', () => {
    expect([...PALETTE_FOOT]).toEqual(boardFoot())
  })

  it('opened: the recent pages, then the `suggested` actions the host supplies, in the board’s order', () => {
    expect(shape(paletteEntries(PALETTE_ITEMS, '', { suggested: PALETTE_SUGGESTED }))).toEqual([
      'G:recent',
      'page:kitchen renovation',
      'page:budget',
      'page:journal',
      'G:suggested',
      'action:chase the cabinet quote',
      'action:log a workout',
    ])
  })

  it('opened with no suggestions from the host: the recent pages and nothing faked (#285 owns the inference)', () => {
    expect(shape(paletteEntries(PALETTE_ITEMS, ''))).toEqual([
      'G:recent',
      'page:kitchen renovation',
      'page:budget',
      'page:journal',
    ])
    expect(groupsOf(paletteEntries(PALETTE_ITEMS, '', { suggested: [] }))).toEqual(['recent'])
  })

  it('opened with nothing recent: every page, so a new pond is not blank — suggestions still follow', () => {
    const fresh = PALETTE_ITEMS.map((i) => ({ ...i, recent: false }))
    expect(groupsOf(paletteEntries(fresh, ''))).toEqual(['pages'])
    expect(paletteEntries(fresh, '').filter((e) => e.kind === 'row')).toHaveLength(8)
    expect(groupsOf(paletteEntries(fresh, '', { suggested: PALETTE_SUGGESTED }))).toEqual([
      'pages',
      'suggested',
    ])
  })

  it('typing: pages, then records, then actions — matched ones, then `ask pond about “q”`', () => {
    const entries = paletteEntries(PALETTE_ITEMS, 'cab')
    expect(shape(entries)).toEqual([
      'G:pages',
      'page:cabinet plan',
      'G:records',
      'record:cabinet quote',
      'G:actions',
      'action:chase the cabinet quote',
      'action:ask pond about “cab”',
    ])
    const row = entries.find((e) => e.kind === 'row' && e.item.id === 'chase')
    expect(row).toMatchObject({ pre: 'chase the ', hit: 'cab', post: 'inet quote' })
    const ask = entries.find((e) => e.kind === 'row' && e.item.id === ASK_POND_ID)
    expect(ask).toMatchObject({ item: { kind: 'action', query: 'cab' } })
  })

  it('actions: a leading `>` drops pages and records, and no group label is drawn', () => {
    expect(shape(paletteEntries(PALETTE_ITEMS, '> log'))).toEqual([
      'action:log a workout',
      'action:log a meal',
      'action:log sleep',
    ])
    expect(shape(paletteEntries(PALETTE_ITEMS, '>'))).toEqual(
      PALETTE_ITEMS.filter((i) => i.kind === 'action').map((i) => `action:${i.label}`)
    )
  })

  it('record: a record is first class, with the field that matched under it', () => {
    const entries = paletteEntries(PALETTE_ITEMS, 'adobe')
    expect(shape(entries)).toEqual([
      'G:records',
      'record:adobe creative cloud',
      'G:actions',
      'action:ask pond about “adobe”',
    ])
    expect(entries[1]).toMatchObject({ sub: 'subscriptions · renews 28 sep', hit: 'adobe' })
  })

  it('a query that matches only an action is the typing state, not empty — the action lists', () => {
    // The real shell list: its standing `ask pond` row is what `ask` matches.
    expect(shape(paletteEntries(paletteItems(ROWS, []), 'ask'))).toEqual([
      'G:actions',
      'action:ask pond',
      'action:ask pond about “ask”',
    ])
    expect(shape(paletteEntries(PALETTE_ITEMS, 'log'))).toEqual([
      'G:actions',
      'action:log a workout',
      'action:log a meal',
      'action:log sleep',
      'action:ask pond about “log”',
    ])
    // Nothing at all matches: the empty state, and the actions are not in it.
    expect(shape(paletteEntries(paletteItems(ROWS, []), 'zzz'))).toEqual([
      'N:no page or record called “zzz”',
      'action:ask pond about “zzz”',
      'action:new page “zzz” under life',
    ])
  })

  it('empty: a note, ask pond, make the page under the pond, then a close spelling — no dead end', () => {
    const entries = paletteEntries(PALETTE_ITEMS, 'cabnet', { pondName: 'life' })
    expect(shape(entries)).toEqual([
      'N:no page or record called “cabnet”',
      'action:ask pond about “cabnet”',
      'action:new page “cabnet” under life',
      'G:did you mean',
      'page:cabinet plan',
      'record:cabinet quote',
    ])
    expect(entries[2]).toMatchObject({
      item: { id: NEW_PAGE_ID, action: 'new-page', query: 'cabnet' },
    })
    expect(entries[1]).toMatchObject({ item: { id: ASK_POND_ID, action: 'ask-pond' } })
  })

  it('`new page “q” under <parent>` names the host’s parent, never the scope — one owner, two readers', () => {
    const scope = { id: 'money', label: 'money' }
    const under = (o: Parameters<typeof paletteEntries>[2]) =>
      shape(paletteEntries(PALETTE_ITEMS, 'zzz', o))[2]
    expect(under({ parentTitle: 'journal' })).toBe('action:new page “zzz” under journal')
    expect(under({ scope, parentTitle: 'journal' })).toBe('action:new page “zzz” under journal')
    // No parent named: the pond, as the board's `empty` frame reads.
    expect(under({ pondName: 'life' })).toBe('action:new page “zzz” under life')
    expect(under({ scope })).toBe('action:new page “zzz” under life')
  })

  it('scoped: the page and its children, the kind under each name, no groups; `>` ignores the scope', () => {
    const scope = { id: 'money', label: 'money' }
    const entries = paletteEntries(PALETTE_ITEMS, '', { scope })
    expect(shape(entries)).toEqual([
      'page:budget',
      'page:subscriptions',
      'page:Savings',
      'database:transactions',
    ])
    expect(entries.map((e) => (e.kind === 'row' ? e.sub : null))).toEqual([
      'page',
      'page',
      'page',
      'database',
    ])
    expect(shape(paletteEntries(PALETTE_ITEMS, '> log', { scope }))).toHaveLength(3)
  })

  it('ponds lead when one matches, and the pages group names the pond (6m: ponds above pages)', () => {
    const noPage = PALETTE_ITEMS.filter((i) => i.id !== 'make-page')
    expect(groupsOf(paletteEntries(noPage, 'make', { pondName: 'life' }))).toEqual([
      'ponds',
      'actions',
    ])
    expect(groupsOf(paletteEntries(PALETTE_ITEMS, 'make', { pondName: 'life' }))).toEqual([
      'ponds',
      'pages in life',
      'actions',
    ])
  })

  it('every group label, in every state, is a word the board uses', () => {
    const allowed = new Set(boardGroups())
    for (const q of QUERIES) {
      for (const g of groupsOf(paletteEntries(PALETTE_ITEMS, q, { suggested: PALETTE_SUGGESTED })))
        expect(allowed.has(g)).toBe(true)
    }
  })
})

// ── The shell’s derivation ─────────────────────────────────────────────────────

const row = (p: Partial<PageRow> & Pick<PageRow, 'id' | 'title'>): PageRow => ({
  parent_id: null,
  type: 'page',
  order: 0,
  updated_at: '',
  ...p,
})
const ROWS: PageRow[] = [
  row({ id: 'personal', title: 'Personal' }),
  row({ id: 'journal', title: 'journal', parent_id: 'personal' }),
  row({ id: 'entry', title: 'a morning', parent_id: 'journal' }),
  row({ id: 'dbs', title: DATABASES_ROOT_TITLE }),
  row({ id: 'tx', title: 'transactions', parent_id: 'dbs' }),
  row({ id: 'loose', title: '' }),
]

describe('paletteItems — the save-as-template page action (KAN-10, board `6i` frame 3)', () => {
  // "Saving is a page action, so it lives in the command palette, not the / menu."
  // A page action has nothing to act on with no page open, so it must not list.
  it.each([
    ['no page open', null, false],
    ['a page open', 'entry', true],
  ])('%s → listed: %s', (_name, openPageId, listed) => {
    const items = paletteItems(ROWS, [], openPageId as string | null)
    expect(items.some((i) => i.action === 'save-as-template')).toBe(listed)
  })

  it('the standing actions list either way, so adding a page action removed nothing', () => {
    for (const open of [null, 'entry']) {
      const actions = paletteItems(ROWS, [], open).map((i) => i.action)
      expect(actions).toContain('new-page')
      expect(actions).toContain('ask-pond')
    }
  })
})

describe('paletteItems — every value from the owner that already derives it', () => {
  it('area from the breadcrumb’s ancestry, kind from the databases root, glyph from the mark, path for scope', () => {
    const items = paletteItems(ROWS, [])
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    // The mark owner derives a glyph from a page's OWN title — the area carries it, a child does not.
    expect(by.personal).toMatchObject({ glyph: 'house', sub: undefined, path: [] })
    expect(by.entry).toMatchObject({
      kind: 'page',
      sub: 'Personal',
      glyph: undefined,
      path: ['personal', 'journal'],
    })
    expect(by.tx).toMatchObject({ kind: 'database', sub: DATABASES_ROOT_TITLE })
    expect(by.dbs.kind).toBe('page')
    expect(by.loose).toMatchObject({ label: 'Untitled', sub: undefined, path: [] })
    expect(items.slice(-2).map((i) => [i.label, i.action])).toEqual([
      ['new page', 'new-page'],
      ['ask pond', 'ask-pond'],
    ])
  })

  it('where a new page files is one value: the page in view by id AND title, else the pond', () => {
    expect(newPageParent(ROWS, 'entry', 'life')).toEqual({ id: 'entry', title: 'a morning' })
    expect(newPageParent(ROWS, 'loose', 'life')).toEqual({ id: 'loose', title: 'Untitled' })
    expect(newPageParent(ROWS, null, 'life')).toEqual({ id: null, title: 'life' })
    // A leaf has no scope (below) but IS the destination — the two are not one thing.
    expect(paletteScope(ROWS, 'entry')).toBeNull()
  })

  it('recents lead, newest first, flagged — and an unknown recent id is dropped', () => {
    const items = paletteItems(ROWS, ['journal', 'gone', 'entry'])
    expect(items.slice(0, 2).map((i) => [i.id, i.recent])).toEqual([
      ['journal', true],
      ['entry', true],
    ])
    expect(items.filter((i) => i.id === 'journal')).toHaveLength(1)
  })

  it('a page with children scopes; a leaf, the root, or nothing selected does not', () => {
    expect(paletteScope(ROWS, 'journal')).toEqual({ id: 'journal', label: 'journal' })
    expect(paletteScope(ROWS, 'entry')).toBeNull()
    expect(paletteScope(ROWS, null)).toBeNull()
  })
})

// ── The surface: ARIA, keys, and the gut ───────────────────────────────────────

function renderPalette(props: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const onSelect = jest.fn()
  const onClose = jest.fn()
  const utils = render(
    <CommandPalette items={PALETTE_ITEMS} onSelect={onSelect} onClose={onClose} {...props} />
  )
  return { ...utils, onSelect, onClose }
}
const glass = () => document.querySelector<HTMLElement>('[data-part="glass"]')!
const input = () => screen.getByRole('combobox', { name: 'command palette' }) as HTMLInputElement

describe('the palette is a floating glass with a combobox, not a dialog', () => {
  it('combobox → listbox → options; the input keeps focus and names the active row', () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('[aria-modal]')).toBeNull()
    expect(document.activeElement).toBe(input())
    const list = screen.getByRole('listbox')
    expect(input().getAttribute('aria-controls')).toBe(list.id)
    const options = screen.getAllByRole('option')
    expect(options.every((o) => o.tagName !== 'BUTTON')).toBe(true)
    const selected = screen.getByRole('option', { selected: true })
    expect(input().getAttribute('aria-activedescendant')).toBe(selected.id)
    expect(selected).toHaveTextContent('kitchen renovation')
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(PALETTE_FOOT.join(''))
  })

  it('↓↓↵ opens the third row; hover selects; a click opens', () => {
    const { onSelect } = renderPalette()
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'journal' }))
    const budget = screen.getAllByRole('option')[1]
    fireEvent.mouseEnter(budget)
    expect(input().getAttribute('aria-activedescendant')).toBe(budget.id)
    fireEvent.click(budget)
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'budget' }))
  })

  it('typing filters, the hit is split pre / hit / post, and the empty state is the board’s note', () => {
    renderPalette()
    fireEvent.change(input(), { target: { value: 'cab' } })
    const chase = screen
      .getAllByRole('option')
      .find(
        (o) => o.querySelector('[data-part="label"]')!.textContent === 'chase the cabinet quote'
      )!
    expect(chase.querySelector('[data-part="hit"]')!.textContent).toBe('cab')
    fireEvent.change(input(), { target: { value: 'cabnet' } })
    expect(glass().querySelector('[data-part="note"]')!.textContent).toBe(
      'no page or record called “cabnet”'
    )
    expect(screen.queryByText('no results')).toBeNull()
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
      'ask pond about “cabnet”'
    )
  })

  it('esc, ⌘K and a press outside close; esc is the one button, and it carries the ring', () => {
    const { onClose } = renderPalette()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.pointerDown(input())
    expect(onClose).toHaveBeenCalledTimes(3)
    const esc = screen.getByRole('button', { name: 'esc' })
    expect(esc.className).toMatch(/focus-visible:outline-mn-area-b/)
    expect(esc.className).not.toMatch(/outline-none/)
  })

  it('scoped: the chip, no placeholder, and ⌫ on an empty line clears it', () => {
    renderPalette({ scope: { id: 'money', label: 'money' } })
    expect(glass().querySelector('[data-part="scope"]')!.textContent).toBe('in money:')
    expect(input().placeholder).toBe('')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'budgetpage↵',
      'subscriptionspage',
      'Savingspage',
      'transactionsdatabase',
    ])
    fireEvent.keyDown(input(), { key: 'Backspace' })
    expect(glass().querySelector('[data-part="scope"]')).toBeNull()
    expect(input().placeholder).toBe('jump to a page, or > for actions')
  })

  it('the chrome is lowercase in every state — Pond’s words; a page’s title is content and keeps its case', () => {
    for (const q of QUERIES) {
      const { unmount } = renderPalette({ defaultQuery: q, suggested: PALETTE_SUGGESTED })
      expect(paletteChrome(glass())).not.toMatch(/[A-Z]/)
      unmount()
    }
    // The guard is narrow, not blind: `Savings` renders as written (ADR 0004 §4).
    renderPalette({ defaultQuery: 'sav' })
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Savings')
    expect(glass().textContent).toMatch(/[A-Z]/)
  })
})

describe('the gut: nothing of the dialog survives in the source', () => {
  const palette = read('src/components/molecules/CommandPalette.tsx')
  const paletteRow = read('src/components/molecules/palette-row.tsx')

  it('no dialog chrome, no named type sizes, no `cn()`', () => {
    for (const src of [palette, paletteRow]) {
      expect(src).not.toMatch(/dialogBackdropClass|role="dialog"|aria-modal/)
      expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b|text-\[0\.65rem\]/)
      expect(src).not.toMatch(/import \{ cn \}/)
    }
  })

  it('the focus ring is imported from its one owner; the only `outline-none` is the input, which carries no ring', () => {
    expect(palette).toMatch(/from '@\/components\/atoms\/focus-ring'/)
    expect(palette.match(/outline-none/g)).toHaveLength(1)
    const input = palette.match(/const INPUT =\s*'([^']+)'/)![1]
    expect(input).toMatch(/outline-none/)
    expect(input).not.toMatch(/outline-\d|outline-mn/)
    expect(paletteRow).not.toMatch(/outline-none/)
  })

  it('the group label is the page eyebrow and the split is #278’s — one owner each, no second copy', () => {
    expect(palette).toMatch(/pageEyebrowClass/)
    expect(read('src/components/molecules/palette-entries.ts')).toMatch(
      /import \{ normalizeQuery, splitMatch \} from '\.\/slash-entries'/
    )
    expect(read('src/components/molecules/palette-entries.ts')).not.toMatch(/function splitMatch/)
    // `hint`, `enter` and `match` are the board's once-emitted recipes: imported, never restated.
    expect(paletteRow).toMatch(/import \{ ENTER, HINT, MATCH, Mark \} from '\.\/slash-row'/)
    expect(paletteRow).not.toMatch(
      /underline-offset|decoration-\[|max-w-\[45%\]|const (HINT|ENTER|MATCH)\b/
    )
  })
})
