/**
 * The ⌘K palette — `PondCommand` (`Pond 02` 2g): the breadcrumb at rest, grown in
 * place into `PondPicker kind="palette"` (#279, child b of #226).
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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PondCommand, type PondCommandProps } from '@/components/organisms/PondCommand'
import {
  ASK_POND_ID,
  NEW_PAGE_ID,
  NEW_POND_ID,
  PALETTE_FOOT,
  PALETTE_FOOT_MOBILE,
  paletteEntries,
  type PaletteEntry,
  type PaletteItem,
} from '@/components/molecules/palette-entries'
import { newPageParent, paletteItems, paletteScope } from '@/lib/pages/palette-items'
import { DATABASES_ROOT_TITLE } from '@/lib/pages/databases-root'
import type { PageRow } from '@/lib/pages/tree'
import {
  PALETTE_ITEMS,
  PALETTE_SUGGESTED,
  paletteChrome,
  paletteItemsFor,
} from './helpers/palette-fixture'
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
const quoted = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((x) => x[1])
const boardFoot = () => quoted(boardPaletteBranch().match(/const keys = \[([^\]]+)\]/)![1])
const boardFootMobile = () => quoted(boardPaletteBranch().match(/foot = mob \? \[([^\]]+)\]/)![1])

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
const MONEY_SCOPE = { id: 'money', label: 'money' }
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

  it('the mobile foot is the board’s `mob` branch, verbatim, and a subset of the full legend', () => {
    expect([...PALETTE_FOOT_MOBILE]).toEqual(boardFootMobile())
    expect(boardFootMobile()).toEqual(['↵ open', '> actions only'])
    for (const hint of PALETTE_FOOT_MOBILE) expect(PALETTE_FOOT).toContain(hint)
  })

  it('opened: the recent pages, then the `suggested` actions the host supplies, in the board’s order', () => {
    expect(shape(paletteEntries(PALETTE_ITEMS, '', { suggested: PALETTE_SUGGESTED }))).toEqual([
      'G:recent',
      'page:kitchen renovation',
      'page:budget',
      'page:journal',
      'G:suggested',
      'action:chase the cable quote',
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
    const entries = paletteEntries(paletteItemsFor('cab'), 'cab')
    expect(shape(entries)).toEqual([
      'G:pages',
      'page:cabinet plan',
      'G:records',
      'record:cabinet quote',
      'G:actions',
      'action:chase the cable quote',
      'action:ask pond about “cab”',
    ])
    const row = entries.find((e) => e.kind === 'row' && e.item.id === 'chase')
    expect(row).toMatchObject({
      runs: [
        { text: 'chase the ', hit: false },
        { text: 'cab', hit: true },
        { text: 'le quote', hit: false },
      ],
    })
    const ask = entries.find((e) => e.kind === 'row' && e.item.id === ASK_POND_ID)
    expect(ask).toMatchObject({ item: { kind: 'action', query: 'cab' } })
  })

  it('a record is listed as the host searched it — a field match with no label hit is not filtered out', () => {
    const byField: PaletteItem = {
      id: 'r1',
      label: 'quote',
      kind: 'record',
      sub: 'tasks · vendor acme cabinets',
    }
    const entries = paletteEntries([...PALETTE_ITEMS, byField], 'acme')
    expect(shape(entries)).toEqual([
      'G:records',
      'record:quote',
      'G:actions',
      'action:ask pond about “acme”',
    ])
    expect(entries[1]).toMatchObject({
      sub: 'tasks · vendor acme cabinets',
      runs: [{ text: 'quote', hit: false }],
    })
    // Records never sit under a scope or a `>`.
    expect(
      shape(paletteEntries([...PALETTE_ITEMS, byField], 'acme', { scope: MONEY_SCOPE }))
    ).not.toContain('record:quote')
    expect(shape(paletteEntries([...PALETTE_ITEMS, byField], '> log'))).not.toContain(
      'record:quote'
    )
  })

  it('ponds: `new pond “q”` stands among the actions only where a pond matched, ahead of `ask pond`', () => {
    const entries = paletteEntries(PALETTE_ITEMS, 'make', { pondName: 'life' })
    expect(shape(entries)).toEqual([
      'G:ponds',
      'pond:make noise',
      'G:pages in life',
      'page:make this a page',
      'G:actions',
      'action:new pond “make”',
      'action:ask pond about “make”',
    ])
    expect(entries.find((e) => e.kind === 'row' && e.item.id === NEW_POND_ID)).toMatchObject({
      item: { action: 'new-pond', query: 'make' },
    })
    expect(shape(paletteEntries(PALETTE_ITEMS, 'cab'))).not.toContain('action:new pond “cab”')
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
    const entries = paletteEntries(paletteItemsFor('adobe'), 'adobe')
    expect(shape(entries)).toEqual([
      'G:records',
      'record:adobe creative cloud',
      'G:actions',
      'action:ask pond about “adobe”',
    ])
    expect(entries[1]).toMatchObject({
      sub: 'subscriptions · renews 28 sep',
      runs: [
        { text: 'adobe', hit: true },
        { text: ' creative cloud', hit: false },
      ],
    })
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
    // "cabnet" (the board's own query): close enough to "cabinet plan" for `didYouMean`'s
    // edit distance that KAN-390's subsequence tier excludes it as a near-miss spelling
    // rather than list it as a hit; "chase the cable quote" has no "n" at all, so
    // "cabnet" is not even a subsequence of it — it still misses every tier.
    const entries = paletteEntries(PALETTE_ITEMS, 'cabnet', { pondName: 'life' })
    expect(shape(entries)).toEqual([
      'N:no page or record called “cabnet”',
      'action:ask pond about “cabnet”',
      'action:new page “cabnet” under life',
      'G:did you mean',
      'page:cabinet plan',
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
    expect(items.slice(-3).map((i) => [i.label, i.action])).toEqual([
      ['new page', 'new-page'],
      ['ask pond', 'ask-pond'],
      ['deep research', 'deep-research'],
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

  it('the 3-row cap applies after a trashed recent is dropped, not before (#390)', () => {
    // The newest id ('gone') no longer resolves to a page — trashed since it was
    // recorded — so the cap must land on the next 3 that still exist, not shrink
    // the visible group to 2.
    const items = paletteItems(ROWS, ['gone', 'personal', 'journal', 'entry'])
    expect(items.slice(0, 3).map((i) => [i.id, i.recent])).toEqual([
      ['personal', true],
      ['journal', true],
      ['entry', true],
    ])
  })

  it('a page with children scopes; a leaf, the root, or nothing selected does not', () => {
    expect(paletteScope(ROWS, 'journal')).toEqual({ id: 'journal', label: 'journal' })
    expect(paletteScope(ROWS, 'entry')).toBeNull()
    expect(paletteScope(ROWS, null)).toBeNull()
  })
})

// ── The surface: one element, ARIA, keys, and the gut ─────────────────────────

const PATH = {
  glyph: 'ramp',
  trail: [
    { title: 'life', node: null },
    { title: 'professional', node: null },
  ],
  current: 'standups',
  role: null,
}

function renderPalette(props: Partial<PondCommandProps> = {}) {
  const onSelect = jest.fn()
  const onOpenChange = jest.fn()
  const utils = render(
    <PondCommand
      path={PATH}
      open
      items={PALETTE_ITEMS}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      {...props}
    />
  )
  return { ...utils, onSelect, onOpenChange }
}
const box = () => document.querySelector<HTMLElement>('[data-part="command"]')!
const input = () => screen.getByRole('combobox', { name: 'command palette' }) as HTMLInputElement

describe('at rest the palette is the breadcrumb (`PondCommand` t = 0)', () => {
  it('the path, the area’s mark and ⌘K — no list, no input; a click on it asks to open', () => {
    const platform = jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { onOpenChange } = renderPalette({ open: false })
    expect(box().getAttribute('data-state')).toBe('rest')
    expect(box().querySelector('[data-part="path"]')!.textContent).toBe(
      'life›professional›standups'
    )
    expect(box().querySelector('[data-part="glyph"] [data-icon]')!.getAttribute('data-icon')).toBe(
      'ramp'
    )
    expect(box().querySelector('[data-part="chip"]')!.textContent).toBe('⌘K')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    const opener = box().querySelector<HTMLElement>('[data-part="opener"]')!
    expect(opener.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(opener)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    platform.mockRestore()
  })

  it('the mode toggle switches light/dark on the document, and never opens the palette', async () => {
    const { onOpenChange } = renderPalette({ open: false })
    const mode = screen.getByRole('button', { name: 'dark mode' })
    expect(mode.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(mode)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('pond:mode')).toBe('dark')
    await waitFor(() => expect(mode.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(mode)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    await waitFor(() => expect(mode.getAttribute('aria-pressed')).toBe('false'))
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('every opening starts clean — no query, the first row — and lands the caret in the input', async () => {
    const { rerender, onSelect, onOpenChange } = renderPalette()
    fireEvent.change(input(), { target: { value: 'cab' } })
    const props = { path: PATH, items: PALETTE_ITEMS, onSelect, onOpenChange }
    rerender(<PondCommand {...props} open={false} />)
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull())
    rerender(<PondCommand {...props} open />)
    expect(input().value).toBe('')
    expect(document.activeElement).toBe(input())
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('kitchen renovation')
  })
})

describe('open, it is a combobox in the same box — not a dialog, not a portal', () => {
  it('combobox → listbox → options; the input keeps focus and names the active row', () => {
    const { container } = renderPalette()
    expect(container.contains(box())).toBe(true)
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
    expect(box().querySelector('[data-part="foot"]')!.textContent).toBe(PALETTE_FOOT.join(''))
    expect(box().querySelector('[data-part="opener"]')!.getAttribute('aria-expanded')).toBe('true')
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

  it('arrowing to a page or database row fires onActiveItemChange with it (KAN-388) — a record/action row does not', () => {
    const onActiveItemChange = jest.fn()
    renderPalette({ onActiveItemChange })
    expect(onActiveItemChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'kitchen', kind: 'page' })
    )
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(onActiveItemChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'budget', kind: 'page' })
    )
    // 'transactions' is a page under the databases root, so palette-items.ts
    // labels it kind 'database' — it still warms like any other page row.
    fireEvent.change(input(), { target: { value: 'transactions' } })
    expect(onActiveItemChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'transactions', kind: 'database' })
    )
    fireEvent.change(input(), { target: { value: '> log' } })
    const callsAfterActions = onActiveItemChange.mock.calls.length
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(onActiveItemChange).toHaveBeenCalledTimes(callsAfterActions)
  })

  it('typing filters, the hit is split pre / hit / post, and the empty state is the board’s note', () => {
    renderPalette()
    fireEvent.change(input(), { target: { value: 'cab' } })
    const chase = screen
      .getAllByRole('option')
      .find(
        (o) => o.querySelector('[data-part="label"]')!.textContent === 'chase the cable quote'
      )!
    expect(chase.querySelector('[data-part="hit"]')!.textContent).toBe('cab')
    fireEvent.change(input(), { target: { value: 'cabnet' } })
    expect(box().querySelector('[data-part="note"]')!.textContent).toBe(
      'no page or record called “cabnet”'
    )
    expect(screen.queryByText('no results')).toBeNull()
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
      'ask pond about “cabnet”'
    )
  })

  it('esc, a press outside and the `esc` chip ask to close; ⌘K does not (the shell owns that key)', () => {
    const { onOpenChange } = renderPalette()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenCalledTimes(2)
    fireEvent.pointerDown(input())
    expect(onOpenChange).toHaveBeenCalledTimes(2)
    const esc = screen.getByRole('button', { name: 'esc' })
    expect(esc.className).toMatch(/focus-visible:outline-mn-area-b/)
    expect(esc.className).not.toMatch(/outline-none/)
    fireEvent.click(esc)
    expect(onOpenChange).toHaveBeenCalledTimes(3)
    expect(onOpenChange.mock.calls.every(([open]) => open === false)).toBe(true)
  })

  it('below md the foot hides the hints a touch screen has no key for; the rest stay', () => {
    renderPalette()
    const spans = [...box().querySelectorAll('[data-part="foot"] span')]
    expect(spans.map((f) => [f.textContent, f.classList.contains('max-md:hidden')])).toEqual([
      ['↑↓ move', true],
      ['↵ open', false],
      ['> actions only', false],
      ['esc close', true],
    ])
  })

  it('scoped: the chip, no placeholder, and ⌫ on an empty line clears it', () => {
    renderPalette({ scope: { id: 'money', label: 'money' } })
    expect(box().querySelector('[data-part="scope"]')!.textContent).toBe('in money:')
    expect(input().placeholder).toBe('')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'budgetpage↵',
      'subscriptionspage',
      'Savingspage',
      'transactionsdatabase',
    ])
    fireEvent.keyDown(input(), { key: 'Backspace' })
    expect(box().querySelector('[data-part="scope"]')).toBeNull()
    expect(input().placeholder).toBe('jump to a page, or > for actions')
  })

  it('the chrome is lowercase in every state — Pond’s words; a page’s title is content and keeps its case', () => {
    for (const q of QUERIES) {
      const { unmount } = renderPalette({ defaultQuery: q, suggested: PALETTE_SUGGESTED })
      expect(paletteChrome(box())).not.toMatch(/[A-Z]/)
      unmount()
    }
    // The guard is narrow, not blind: `Savings` renders as written (ADR 0004 §4).
    renderPalette({ defaultQuery: 'sav' })
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Savings')
    expect(box().textContent).toMatch(/[A-Z]/)
  })
})

describe('the gut: one morphing element — nothing of the dialog, the wash or the portal', () => {
  const command = read('src/components/organisms/PondCommand.tsx')
  const morph = read('src/lib/motion/use-morph.ts')
  const paletteRow = read('src/components/molecules/palette-row.tsx')

  it('the board’s geometry and timing are written in, read off `PondCommand.dc.html`', () => {
    const board = readHandoff('PondCommand.dc.html')
    expect(board).toMatch(/const OPEN_W = 560, ENTER_MS = 280, EXIT_MS = 150/)
    expect(board).toMatch(/restW = this\.state\.cw \+ 124/)
    expect(board).toMatch(/easePress = bez\(\.22, \.8, \.2, 1\), easeIn = bez\(\.4, 0, 1, 1\)/)
    expect(morph).toMatch(/MORPH_OPEN_MS = 280/)
    expect(morph).toMatch(/MORPH_CLOSE_MS = 150/)
    expect(morph).toMatch(/bezier\(0\.22, 0\.8, 0\.2, 1\)/)
    expect(morph).toMatch(/bezier\(0\.4, 0, 1, 1\)/)
    expect(command).toMatch(/REST_CHROME_PX = 124/)
    expect(command).toMatch(/md:\[--open-w:560px\]/)
    expect(command).toMatch(/rounded-\[20px\]/)
    // One eased value drives everything: the board's ramps, verbatim.
    for (const ramp of ['ramp(0.25, 0.4)', 'ramp(0.3, 0.3)', 'ramp(0.6, 0.4)', '/ 0.35'])
      expect(command).toContain(ramp)
    expect(command).toMatch(/0\.45 \+ 0\.035 \* i/)
  })

  it('no portal, no wash, no dialog chrome, no scale — and the old placement is gone', () => {
    expect(command).not.toMatch(/createPortal|data-part="wash"|bg-mn-surface\/\[0\.62\]/)
    expect(command).not.toMatch(/role="dialog"|aria-modal|dialogBackdropClass/)
    expect(command).not.toMatch(/scale\(|top-\[110px\]|-translate-x-\[40%\]/)
    expect(command).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/)
    expect(command).not.toMatch(/import \{ cn \}/)
    expect(command).toMatch(/font-sans text-\[16px\] font-medium .*md:text-\[13\.5px\]/)
    expect(paletteRow).toMatch(/py-\[13px\].*text-\[15px\].*md:py-\[9px\] md:text-\[13\.5px\]/)
  })

  it('⌘K has one owner: the element registers no chord, and the shell reads one platform-aware predicate', () => {
    expect(command).not.toMatch(/toLowerCase\(\) === 'k'/)
    // A modified click on a breadcrumb link is not a chord: `metaKey`/`ctrlKey` may
    // appear in a mouse handler, but no keydown listener or onKeyDown handler may
    // read them — that would be a second ⌘K registration.
    const keyboardHandlerBodies = [...command.matchAll(/\(e: (?:React\.)?KeyboardEvent[^)]*\) => \{/g)].map(
      (m) => {
        let depth = 1
        let i = m.index + m[0].length
        const start = i
        while (depth > 0) {
          if (command[i] === '{') depth++
          else if (command[i] === '}') depth--
          i++
        }
        return command.slice(start, i - 1)
      }
    )
    expect(keyboardHandlerBodies.length).toBeGreaterThan(0)
    for (const body of keyboardHandlerBodies) expect(body).not.toMatch(/metaKey|ctrlKey/)
    const shell = read('src/components/organisms/ShellCommands.tsx')
    expect(shell).toMatch(/isPaletteChord/)
    expect(shell).not.toMatch(/metaKey|ctrlKey/)
  })

  it('the focus ring is imported from its one owner; the only `outline-none` is the input', () => {
    expect(command).toMatch(/from '@\/components\/atoms\/focus-ring'/)
    expect(command.match(/outline-none/g)).toHaveLength(1)
    const field = command.match(/const INPUT =\s*'([^']+)'/)![1]
    expect(field).toMatch(/outline-none/)
    expect(field).not.toMatch(/outline-\d|outline-mn/)
    expect(paletteRow).not.toMatch(/outline-none/)
  })

  it('the group label is the page eyebrow and the split is #278’s — one owner each, no second copy', () => {
    expect(command).toMatch(/pageEyebrowClass/)
    expect(read('src/components/molecules/palette-entries.ts')).toMatch(
      /import \{ fold, type MatchRun, matchRuns, normalizeQuery, subsequenceMatch \} from '\.\/slash-entries'/
    )
    expect(read('src/components/molecules/palette-entries.ts')).not.toMatch(
      /function matchRuns|function fold\(|function subsequenceMatch\(/
    )
    expect(paletteRow).toMatch(/import \{ ENTER, HINT, MATCH, Mark \} from '\.\/slash-row'/)
    expect(paletteRow).not.toMatch(
      /underline-offset|decoration-\[|max-w-\[45%\]|const (HINT|ENTER|MATCH)\b/
    )
  })
})
