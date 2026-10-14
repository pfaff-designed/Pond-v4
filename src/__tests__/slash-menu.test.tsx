/**
 * The `/` menu — `PondPicker kind="slash"` (#278, child a of #226).
 *
 * Every string the menu renders is checked against the words the handoff itself
 * uses: `Pond 03 Concepts` 3a's glossary plus `PondPicker.dc.html`'s own slash rows,
 * both READ FROM THE HANDOFF at test time, never hand-copied. The registry guard is
 * derived from `moduleDescriptors` the same way — a ninth type must reach the menu
 * through at least one row with no picker edit, or this fails.
 */

import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SlashMenu } from '@/components/molecules/SlashMenu'
import { slashRows, mintPreset, BOARD_ORDER, HEADING_PREFIX, WITHHELD } from '@/lib/modules/palette'
import { moduleDescriptors } from '@/lib/modules/registry'
import { TEMPLATE_KINDS } from '@/lib/templates/types'
import { VIEW_KINDS } from '@/lib/modules/view/kinds'
import { readHandoff } from './helpers/handoff'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

/** `Pond 03` 3a — the 18px/500 term column, straight off the board. */
function glossaryTerms(): string[] {
  const html = readHandoff('Pond 03 Concepts.dc.html')
  const start = html.indexOf('id="3a"')
  const end = html.indexOf('class="dv-opt"', start + 10)
  const seg = html.slice(start, end)
  return [...seg.matchAll(/<span style="font-size:18px;font-weight:500">([^<]+)<\/span>/g)].map(
    (m) => m[1]
  )
}

/** The slash kind's row labels and group labels, off `PondPicker.dc.html`'s `renderVals()`. */
function boardSlashWords(): string[] {
  const html = readHandoff('PondPicker.dc.html')
  const start = html.indexOf("if (kind === 'slash')")
  const end = html.indexOf("} else if (kind === 'source')", start)
  const seg = html.slice(start, end)
  const items = [...seg.matchAll(/\bit\('([^']+)'/g)].map((m) => m[1])
  const groups = [...seg.matchAll(/\bG\('([^']+)'/g)].map((m) => m[1])
  return [...items, ...groups]
}

// ADR 0009 gives each view kind its own row, named as 6u.1's head names it.
const VIEW_KIND_WORDS = Object.values(VIEW_KINDS).map((k) => k.label)
const ALLOWED = new Set([
  ...glossaryTerms(),
  ...boardSlashWords(),
  ...TEMPLATE_KINDS,
  ...VIEW_KIND_WORDS,
  // KAN-240: an undrawn row — the board draws no frame for the static table block
  // now that `/table` is the database view (ADR 0009); delegated to this ticket.
  'grid',
  // KAN-240: an undrawn row — the list view's own row, labelled distinctly from
  // the bulleted list's `list` so `/list` never reads as a second copy.
  'list view',
])

function renderMenu(overrides: Partial<React.ComponentProps<typeof SlashMenu>> = {}) {
  const onSelect = jest.fn()
  const onClose = jest.fn()
  const onPickTemplate = jest.fn()
  const anchor = document.createElement('textarea')
  anchor.value = '/'
  document.body.appendChild(anchor)
  anchor.focus()
  const utils = render(
    <SlashMenu
      rows={slashRows}
      query=""
      anchor={anchor}
      onSelect={onSelect}
      onClose={onClose}
      onPickTemplate={onPickTemplate}
      {...overrides}
    />
  )
  return { ...utils, onSelect, onClose, onPickTemplate, anchor }
}

const glass = () => document.querySelector<HTMLElement>('[data-part="glass"]')!
const options = () => screen.getAllByRole('option')
const selected = () => screen.getByRole('option', { selected: true })
const labelOf = (el: HTMLElement) => el.querySelector('[data-part="label"]')!.textContent

afterEach(() => {
  document.body.querySelectorAll('textarea').forEach((t) => t.remove())
})

// ── Vocabulary ─────────────────────────────────────────────────────────────────

describe('the / menu speaks Pond’s words only', () => {
  it('the handoff really was read (guards the two parsers)', () => {
    expect(glossaryTerms()).toEqual(expect.arrayContaining(['pond', 'page', 'block', 'template']))
    expect(boardSlashWords()).toEqual(
      expect.arrayContaining(['text', 'checklist', 'big number', 'entry log', 'blocks'])
    )
  })

  it('every rendered string, in every state, is lowercase and every label is a word the handoff uses', () => {
    function checkGlass() {
      const text = glass().textContent ?? ''
      expect(text).not.toMatch(/[A-Z]/)
      for (const o of screen.queryAllByRole('option')) {
        expect(ALLOWED.has(labelOf(o as HTMLElement)!)).toBe(true)
      }
    }
    const renders: Array<Partial<React.ComponentProps<typeof SlashMenu>>> = [
      {},
      { query: 'ta' },
      { query: 'zz' },
    ]
    for (const props of renders) {
      const { unmount } = renderMenu(props)
      checkGlass()
      unmount()
    }
    // The templates pane, reached via `page from template` rather than a prop.
    const { anchor, unmount } = renderMenu()
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'page from template')!)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    checkGlass()
    unmount()
  })

  it('no row is named after a module type the glossary lacks — `todo` and `view` never reach the surface', () => {
    const labels = slashRows.map((r) => r.label)
    expect(labels).not.toContain('todo')
    expect(labels).not.toContain('view')
    expect(labels).not.toContain('image')
    expect(labels).not.toContain('entries')
    for (const label of labels) {
      expect(label).toBe(label.toLowerCase())
      expect(ALLOWED.has(label)).toBe(true)
    }
  })

  it('every descriptor names itself in Pond’s words', () => {
    for (const d of Object.values(moduleDescriptors)) {
      expect(ALLOWED.has(d.label)).toBe(true)
      expect(d.label).toBe(d.label.toLowerCase())
    }
  })
})

// ── Rows are presets; the registry derivation survives ─────────────────────────

describe('a row is a preset, and every registered type reaches the menu', () => {
  it('every `moduleDescriptors` type is reached by a row or withheld with a reason — derived, not listed', () => {
    const reached = new Set(slashRows.map((r) => r.type).filter(Boolean))
    const withheld: Partial<Record<string, string>> = WITHHELD
    for (const type of Object.keys(moduleDescriptors)) {
      const reason = withheld[type]
      if (!reached.has(type)) expect(reason).toEqual(expect.any(String))
      if (reason !== undefined) expect(reason.length).toBeGreaterThan(0)
    }
    for (const type of Object.keys(WITHHELD)) expect(moduleDescriptors).toHaveProperty(type)
    // `view` is withheld AND reached (through its variant rows); `page` is only withheld.
    expect(reached.has('view')).toBe(true)
    expect(reached.has('page')).toBe(false)
  })

  it('one type contributes several rows: list and checklist are both `todo`; gallery, chart and big number are all `view`', () => {
    expect(mintPreset('bulleted-list')).toMatchObject({ type: 'todo', marker: 'dot' })
    expect(mintPreset('list')).toMatchObject({ type: 'view', mode: 'list' })
    expect(mintPreset('checklist')).toMatchObject({ type: 'todo' })
    expect(mintPreset('gallery')).toMatchObject({ type: 'view', mode: 'gallery' })
    expect(mintPreset('chart')).toMatchObject({ type: 'view', mode: 'chart' })
    expect(mintPreset('big-number')).toMatchObject({ type: 'view', mode: 'big-number' })
    expect(mintPreset('entry-log')).toMatchObject({ type: 'entries', entries: [] })
    expect(mintPreset('embed-file')).toMatchObject({ type: 'image', url: '' })
    expect(mintPreset('page-from-template')).toBeNull()
    expect(mintPreset('nope')).toBeNull()
  })

  // #281: `heading` is a face of `text`, not a ninth block kind — the one of the
  // board's five factory-less rows that needed no new type. It opens the block on
  // the second markdown level, which `Markdown.tsx` already typesets.
  it('`heading` mints a text block already opened on a markdown heading', () => {
    expect(mintPreset('heading')).toEqual({
      id: expect.any(String),
      type: 'text',
      content: HEADING_PREFIX,
    })
    expect(HEADING_PREFIX).toBe('## ')
    // Not a block kind: nothing new is registered, and the row carries the board's
    // own key hint.
    expect(slashRows.find((r) => r.id === 'heading')).toMatchObject({
      type: 'text',
      group: 'text',
      key: '#',
    })
  })

  it('the `pages` group makes pages, not blocks: its rows mint nothing and say where the page goes', () => {
    expect(mintPreset('page')).toBeNull()
    expect(mintPreset('nested-page')).toBeNull()
    expect(slashRows.find((r) => r.id === 'page')?.placement).toBe('sibling')
    expect(slashRows.find((r) => r.id === 'nested-page')?.placement).toBe('child')
    expect(slashRows.filter((r) => r.placement).map((r) => r.id)).toEqual(['page', 'nested-page'])
  })

  it('leaves out the two rows nothing can serve: `page link` and `pond — update`', () => {
    const labels = slashRows.map((r) => r.label)
    expect(labels).not.toContain('page link')
    expect(labels).not.toContain('pond — update')
  })

  it('board, calendar and timeline are each a row that makes a view of that kind (ADR 0009)', () => {
    for (const mode of ['board', 'calendar', 'gantt'] as const) {
      const row = slashRows.find((r) => r.id === mode)
      expect(row).toMatchObject({ type: 'view', group: 'blocks', label: VIEW_KINDS[mode].label })
      expect(mintPreset(mode)).toMatchObject({ type: 'view', mode })
    }
    expect(slashRows.find((r) => r.id === 'gantt')?.alias).toBe('gantt')
  })

  it('`/table` is the database table view, and the static table block moved to its own `grid` row (ADR 0009)', () => {
    const tableRows = slashRows.filter((r) => r.id === 'table')
    expect(tableRows).toHaveLength(1)
    expect(tableRows[0]).toMatchObject({ type: 'view', label: 'table' })
    const gridRows = slashRows.filter((r) => r.id === 'grid')
    expect(gridRows).toHaveLength(1)
    expect(gridRows[0]).toMatchObject({ type: 'table', label: 'grid' })
    expect(mintPreset('table')).toMatchObject({ type: 'view', mode: 'table' })
    expect(mintPreset('grid')).toMatchObject({ type: 'table' })
  })

  it('`/list` is the list view, labelled distinctly from the bulleted list', () => {
    const listRows = slashRows.filter((r) => r.id === 'list')
    expect(listRows).toHaveLength(1)
    expect(listRows[0]).toMatchObject({ type: 'view', label: 'list view' })
    expect(mintPreset('list')).toMatchObject({ type: 'view', mode: 'list' })
  })

  it('rows follow the board’s order within the board’s groups', () => {
    expect(slashRows.map((r) => `${r.group}/${r.label}`)).toEqual([
      'text/text',
      'text/heading',
      'text/highlight',
      'text/embed / file',
      'blocks/list',
      'blocks/checklist',
      'blocks/table',
      'blocks/grid',
      'blocks/board',
      'blocks/calendar',
      'blocks/list view',
      'blocks/gallery',
      'blocks/timeline',
      'blocks/chart',
      'blocks/big number',
      'blocks/entry log',
      'templates/page from template',
      'pages/page',
      'pages/nested page',
    ])
  })

  it('every row is ranked by the board’s order — an unranked row fails here, it does not drift to the end', () => {
    for (const row of slashRows) expect(BOARD_ORDER).toContain(row.id)
  })
})

// ── States ─────────────────────────────────────────────────────────────────────

describe('open', () => {
  it('lists every row under its group, first row selected, with the board’s foot and no filter <input>', () => {
    renderMenu()
    expect(glass().querySelector('input')).toBeNull()
    expect(glass()).toHaveClass('mn-glass', 'rounded-mn-card')
    const groups = [...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
    expect(groups).toEqual(['text', 'blocks', 'templates', 'pages'])
    expect(labelOf(selected())).toBe('text')
    expect(within(selected()).getByText('↵')).toBeInTheDocument()
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(
      '↑↓ move↵ insertesc keep as text'
    )
    expect(glass().querySelector('[data-part="head"]')).toBeNull()
  })

  it('anchored above the composer (`side="top"`) the glass grows from its bottom edge', () => {
    const { unmount } = renderMenu()
    expect(glass()).toHaveClass('motion-menu')
    expect(glass().className).not.toContain('--motion-menu-origin')
    unmount()
    renderMenu({ side: 'top' })
    expect(glass()).toHaveClass('motion-menu', '[--motion-menu-origin:bottom_left]')
  })

  it('a selected row shows ↵ in place of its key hint; an unselected row shows the hint', () => {
    renderMenu()
    const checklist = options().find((o) => labelOf(o as HTMLElement) === 'checklist')!
    expect(within(checklist).getByText('[]')).toBeInTheDocument()
    fireEvent.mouseEnter(checklist)
    expect(within(checklist).queryByText('[]')).not.toBeInTheDocument()
    expect(within(checklist).getByText('↵')).toBeInTheDocument()
  })

  it('every row leads with the board’s 13 × 13 inline svg at stroke 1.4', () => {
    renderMenu()
    for (const o of options()) {
      const svg = o.querySelector('svg')!
      expect(svg.getAttribute('width')).toBe('13')
      expect(svg.getAttribute('height')).toBe('13')
      expect(svg.getAttribute('stroke-width')).toBe('1.4')
    }
  })
})

describe('filtered', () => {
  it('splits each matched label pre / hit / post, drops the group labels, and counts in the foot', () => {
    renderMenu({ query: 'ta' })
    expect(glass().querySelectorAll('[data-part="group"]')).toHaveLength(0)
    const table = options().find((o) => labelOf(o as HTMLElement) === 'table')!
    expect(table.querySelector('[data-part="pre"]')!.textContent).toBe('')
    expect(table.querySelector('[data-part="hit"]')!.textContent).toBe('ta')
    expect(table.querySelector('[data-part="post"]')!.textContent).toBe('ble')
    // (The board's fixture also lists `page from template` here with its hit at
    // index 13 — "pl" — which is fixture noise: that label contains no "ta".)
    expect(options().map((o) => labelOf(o as HTMLElement))).toEqual(['table', 'entry log'])
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe('/ ta — 2 matches')
    expect(labelOf(selected())).toBe('table')
  })

  it('a row matched through its alias shows that alias as its hint, with nothing underlined', () => {
    renderMenu({ query: 'ta' })
    const log = options().find((o) => labelOf(o as HTMLElement) === 'entry log')!
    expect(log.querySelector('[data-part="hit"]')!.textContent).toBe('')
    expect(within(log).getByText('dated table')).toBeInTheDocument()
  })

  it('the aliases are entry log = dated table, checklist = todo, chart = graph', () => {
    const alias = (id: string) => slashRows.find((r) => r.id === id)?.alias
    expect(alias('entry-log')).toBe('dated table')
    expect(alias('checklist')).toBe('todo')
    expect(alias('chart')).toBe('graph')
    for (const [query, label] of [
      ['todo', 'checklist'],
      ['graph', 'chart'],
      ['dated', 'entry log'],
    ]) {
      const { unmount } = renderMenu({ query })
      expect(options().map((o) => labelOf(o as HTMLElement))).toEqual([label])
      unmount()
    }
  })

  it('a label match leads an alias match, and the first match stays selected as the query grows', () => {
    const { rerender, onSelect, onClose, anchor } = renderMenu({ query: 't' })
    expect(labelOf(selected())).toBe('text')
    rerender(
      <SlashMenu
        rows={slashRows}
        query="ta"
        anchor={anchor}
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    expect(labelOf(selected())).toBe('table')
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'table' }))
  })

  it('matching is case-insensitive and ignores surrounding space', () => {
    renderMenu({ query: ' CHECK ' })
    expect(options().map((o) => labelOf(o as HTMLElement))).toEqual(['checklist'])
  })
})

describe('empty', () => {
  it('says what it did not find, in the board’s words, and drops the foot', () => {
    renderMenu({ query: 'zz' })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(glass().querySelector('[data-part="note"]')!.textContent).toBe(
      'nothing called “zz”. esc to keep it as text, or ask pond in the composer.'
    )
    expect(glass().querySelector('[data-part="foot"]')).toBeNull()
  })
})

describe('a space when nothing matches', () => {
  it('closes the menu and is not swallowed, so the typed text stays text', () => {
    const { anchor, onClose } = renderMenu({ query: 'zz' })
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    anchor.dispatchEvent(space)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(space.defaultPrevented).toBe(false)
  })

  it('does nothing while something matches — a space inside `big number` is part of the query', () => {
    const { anchor, onClose } = renderMenu({ query: 'big' })
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    anchor.dispatchEvent(space)
    expect(onClose).not.toHaveBeenCalled()
    expect(space.defaultPrevented).toBe(false)
  })
})

describe('mobile', () => {
  it('is 340 wide with 11px 10px rows at 14, where desktop is 300 and 7px 10px at 12.5', () => {
    const { unmount } = renderMenu()
    expect(glass()).toHaveClass('w-[300px]')
    expect(options()[0]).toHaveClass('py-[7px]', 'text-[12.5px]')
    expect(options()[0]).not.toHaveClass('min-h-[44px]')
    unmount()
    renderMenu({ size: 'mobile' })
    expect(glass()).toHaveClass('w-[340px]')
    for (const o of options()) {
      expect(o).toHaveClass('py-[11px]', 'px-[10px]', 'text-[14px]', 'min-h-[44px]')
    }
  })

  it('stops the open list at 12 entries, counting the group heads', () => {
    renderMenu({ size: 'mobile' })
    const entries = glass().querySelectorAll('[data-part="group"], [role="option"]')
    expect(entries).toHaveLength(12)
    expect([...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)).toEqual([
      'text',
      'blocks',
    ])
    expect(
      options()
        .map((o) => labelOf(o as HTMLElement))
        .at(-1)
    ).toBe('calendar')
  })

  it('does not cap a query', () => {
    renderMenu({ size: 'mobile', query: 'e' })
    const desktop = options().length
    expect(desktop).toBeGreaterThan(0)
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(
      `/ e — ${desktop} matches`
    )
  })

  it('shows 8 premade shapes in the templates pane, then the person’s own', () => {
    const yourTemplates = [{ id: 't1', name: 'weeknight recipe' }]
    // The desktop list's cap is wide enough to carry `page from template`, which
    // the mobile cap of 12 would otherwise push out of reach.
    const { rerender, anchor, onSelect, onClose } = renderMenu({ yourTemplates })
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'page from template')!)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    rerender(
      <SlashMenu
        rows={slashRows}
        query=""
        anchor={anchor}
        size="mobile"
        yourTemplates={yourTemplates}
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    expect(options().map((o) => labelOf(o as HTMLElement))).toEqual([
      ...TEMPLATE_KINDS.slice(0, 8),
      'weeknight recipe',
    ])
    expect(glass().querySelector('[data-part="head"]')).toHaveClass('text-[13px]')
  })

  it('sets the empty note at 13', () => {
    renderMenu({ size: 'mobile', query: 'zz' })
    expect(glass().querySelector('[data-part="note"]')).toHaveClass('text-[13px]')
  })
})

describe('walked into the templates pane', () => {
  it('a pane walked into gives way as soon as the query changes, narrowed by it', () => {
    const { rerender, anchor, onSelect, onClose } = renderMenu()
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'page from template')!)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    expect(glass()).toHaveAttribute('data-pane', 'templates')
    rerender(
      <SlashMenu rows={slashRows} query="t" anchor={anchor} onSelect={onSelect} onClose={onClose} />
    )
    expect(glass()).toHaveAttribute('data-pane', 'rows')
    expect(glass().querySelector('[data-part="head"]')).toBeNull()
    expect(options().length).toBeGreaterThan(0)
    for (const o of options()) {
      const label = labelOf(o as HTMLElement)!.toLowerCase()
      expect(label.includes('t')).toBe(true)
    }
  })

  it('lists the person’s own templates under `yours`, and picking one hands back its id', () => {
    const { anchor, onPickTemplate } = renderMenu({
      yourTemplates: [{ id: 't1', name: 'weeknight recipe' }],
    })
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'page from template')!)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    fireEvent.click(options().find((o) => labelOf(o as HTMLElement) === 'weeknight recipe')!)
    expect(onPickTemplate).toHaveBeenCalledWith({ origin: 'yours', id: 't1' })
  })
})

describe('templates', () => {
  it('↵ on `page from template` opens the submenu: head, the twelve premade shapes, the foot', () => {
    const { anchor, onSelect } = renderMenu()
    const tpl = options().find((o) => labelOf(o as HTMLElement) === 'page from template')!
    fireEvent.mouseEnter(tpl)
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
    expect(glass().querySelector('[data-part="head"]')!.textContent).toBe('page from template')
    const groups = [...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
    expect(groups).toEqual(['premade'])
    expect(options().map((o) => labelOf(o as HTMLElement))).toEqual([...TEMPLATE_KINDS])
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(
      '↵ new nested page← blocks'
    )
  })

  it('→ also opens it; ↵ then picks a premade kind; ← steps back to the blocks', () => {
    const { anchor, onPickTemplate } = renderMenu()
    const tpl = options().find((o) => labelOf(o as HTMLElement) === 'page from template')!
    fireEvent.mouseEnter(tpl)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    expect(labelOf(selected())).toBe('page')
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(onPickTemplate).toHaveBeenCalledWith({ origin: 'premade', kind: 'project' })
    fireEvent.keyDown(anchor, { key: 'ArrowLeft' })
    expect(glass().querySelector('[data-part="head"]')).toBeNull()
    expect(labelOf(selected())).toBe('text')
  })

  it('a click on `← blocks` in the foot steps back to the rows, same as ←', () => {
    const { anchor } = renderMenu()
    const tpl = options().find((o) => labelOf(o as HTMLElement) === 'page from template')!
    fireEvent.mouseEnter(tpl)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    expect(glass()).toHaveAttribute('data-pane', 'templates')
    fireEvent.click(screen.getByText('← blocks'))
    expect(glass()).toHaveAttribute('data-pane', 'rows')
  })

  it('lists the person’s own templates under `yours`, and `→ preview` only once a preview exists', () => {
    const onPreviewTemplate = jest.fn()
    const { anchor, onPickTemplate } = renderMenu({
      yourTemplates: [{ id: 't1', name: 'weeknight recipe', hint: 'from chickpeas…' }],
      onPreviewTemplate,
    })
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'page from template')!)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    const groups = [...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
    expect(groups).toEqual(['premade', 'yours'])
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(
      '↵ new nested page→ preview← blocks'
    )
    const mine = options().find((o) => labelOf(o as HTMLElement) === 'weeknight recipe')!
    expect(within(mine).getByText('from chickpeas…')).toBeInTheDocument()
    fireEvent.click(mine)
    expect(onPickTemplate).toHaveBeenCalledWith({ origin: 'yours', id: 't1' })
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    expect(onPreviewTemplate).toHaveBeenCalledWith({ origin: 'premade', kind: 'page' })
  })
})

describe('previewing (KAN-131)', () => {
  it('shows "{n} blocks" on the previewed row only, and the foot reads `↵ apply · esc back`', () => {
    const { anchor } = renderMenu({
      previewing: { pick: { origin: 'premade', kind: 'page' }, blocks: 5 },
    })
    const tpl = options().find((o) => labelOf(o as HTMLElement) === 'page from template')!
    fireEvent.mouseEnter(tpl)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    // `page` is the previewed pick but not the active row, so its hint shows
    // rather than hiding behind the active row's own `↵`.
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'notes')!)
    expect(labelOf(selected())).toBe('notes')
    const page = options().find((o) => labelOf(o as HTMLElement) === 'page')!
    expect(within(page).getByText('5 blocks')).toBeInTheDocument()
    expect(within(selected()).queryByText('5 blocks')).not.toBeInTheDocument()
    // The templates pane's own `← blocks` button (unrelated to `footItems`)
    // still renders alongside — only the leading two spans are this item's.
    const footSpans = [...glass().querySelectorAll('[data-part="foot"] > span')]
    expect(footSpans.map((s) => s.textContent)).toEqual(['↵ apply', 'esc back'])
  })

  it('reads "1 block" singular at one block', () => {
    const { anchor } = renderMenu({
      previewing: { pick: { origin: 'premade', kind: 'page' }, blocks: 1 },
    })
    const tpl = options().find((o) => labelOf(o as HTMLElement) === 'page from template')!
    fireEvent.mouseEnter(tpl)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'notes')!)
    const page = options().find((o) => labelOf(o as HTMLElement) === 'page')!
    expect(within(page).getByText('1 block')).toBeInTheDocument()
  })

  it('reads "5 blocks" plural at five blocks', () => {
    const { anchor } = renderMenu({
      previewing: { pick: { origin: 'premade', kind: 'page' }, blocks: 5 },
    })
    const tpl = options().find((o) => labelOf(o as HTMLElement) === 'page from template')!
    fireEvent.mouseEnter(tpl)
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    fireEvent.mouseEnter(options().find((o) => labelOf(o as HTMLElement) === 'notes')!)
    const page = options().find((o) => labelOf(o as HTMLElement) === 'page')!
    expect(within(page).getByText('5 blocks')).toBeInTheDocument()
  })

  it('esc clears the preview instead of closing the glass; with none up esc still closes', () => {
    const onPreviewCancel = jest.fn()
    const { onClose, anchor } = renderMenu({
      previewing: { pick: { origin: 'premade', kind: 'page' }, blocks: 5 },
      onPreviewCancel,
    })
    fireEvent.keyDown(anchor, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(onPreviewCancel).toHaveBeenCalledTimes(1)
    expect(glass()).toBeInTheDocument()
  })

  it('↑↓← drop a stale preview unconditionally — a no-op in the host with nothing to drop', () => {
    const onPreviewCancel = jest.fn()
    const { anchor } = renderMenu({ onPreviewCancel })
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    fireEvent.keyDown(anchor, { key: 'ArrowUp' })
    fireEvent.keyDown(anchor, { key: 'ArrowLeft' })
    expect(onPreviewCancel).toHaveBeenCalledTimes(3)
  })
})

describe('leads with templates (KAN-276, an empty page’s `/`)', () => {
  it('opens straight on the `templates` group, no head, then the scroll cue then the blocks, templates and pages', () => {
    renderMenu({ leadWithTemplates: true })
    expect(glass().querySelector('[data-part="head"]')).not.toBeInTheDocument()
    const groups = [...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
    expect(groups).toEqual([
      'templates',
      'text — scroll for blocks, templates, pages',
      'blocks',
      'templates',
      'pages',
    ])
  })

  it('↓ past every template and the scroll cue reaches `text`, and ↵ inserts it', () => {
    const { anchor, onSelect } = renderMenu({ leadWithTemplates: true })
    expect(labelOf(selected())).toBe(TEMPLATE_KINDS[0])
    for (let i = 0; i < TEMPLATE_KINDS.length; i++) {
      fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    }
    expect(labelOf(selected())).toBe('text')
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'text', label: 'text' }))
  })

  it('a template row selected: the foot reads `↑↓ move · → preview · ↵ apply` — no `esc keep as text`', () => {
    renderMenu({ leadWithTemplates: true })
    expect(labelOf(selected())).toBe(TEMPLATE_KINDS[0])
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe('↑↓ move→ preview↵ apply')
  })

  it('`text` selected: the foot reads `↑↓ move · ↵ insert`', () => {
    const { anchor } = renderMenu({ leadWithTemplates: true })
    for (let i = 0; i < TEMPLATE_KINDS.length; i++) {
      fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    }
    expect(labelOf(selected())).toBe('text')
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe('↑↓ move↵ insert')
  })

  it('the ranking slotting rows in above the pressed ↓ never moves the selection off the row the person picked (KAN-138)', () => {
    const { rerender, anchor, onSelect, onClose, onPickTemplate } = renderMenu({
      leadWithTemplates: true,
    })
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    expect(labelOf(selected())).toBe('notes')
    // The ranking resolves: `journal` slots in ahead of `page` and `notes`.
    rerender(
      <SlashMenu
        rows={slashRows}
        query=""
        anchor={anchor}
        leadWithTemplates
        siblingRanking={['premade:journal']}
        onSelect={onSelect}
        onClose={onClose}
        onPickTemplate={onPickTemplate}
      />
    )
    expect(labelOf(options()[0])).toBe('journal')
    expect(labelOf(selected())).toBe('notes')
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(onPickTemplate).toHaveBeenCalledWith({ origin: 'premade', kind: 'notes' })
  })
})

// ── The keys, from the host’s own field ────────────────────────────────────────

describe('keys arrive from the field the person is typing in', () => {
  it('↑↓ move, ↵ inserts the selected row', () => {
    const { anchor, onSelect } = renderMenu()
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    fireEvent.keyDown(anchor, { key: 'ArrowUp' })
    // Index 1 — the board's second row, which is `heading` since #281.
    expect(labelOf(selected())).toBe('heading')
    fireEvent.keyDown(anchor, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'heading' }))
  })

  it('↑ at the first row and ↓ at the last both stay put', () => {
    const { anchor } = renderMenu()
    fireEvent.keyDown(anchor, { key: 'ArrowUp' })
    expect(labelOf(selected())).toBe('text')
    for (let i = 0; i < 30; i++) fireEvent.keyDown(anchor, { key: 'ArrowDown' })
    expect(labelOf(selected())).toBe('nested page')
  })

  it('esc keeps the typed text: it closes the menu and does not touch the field', () => {
    const { anchor, onClose } = renderMenu({ query: 'ta' })
    anchor.value = '/ta'
    fireEvent.keyDown(anchor, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(anchor.value).toBe('/ta')
  })

  it('the navigation keys are swallowed before the field sees them; ↵ with nothing to insert is not', () => {
    const { anchor, onSelect } = renderMenu({ query: 'zz' })
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    anchor.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('↵ on a matching row is swallowed so the field never gets a newline', () => {
    const { anchor } = renderMenu()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    anchor.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
  })

  it('a click inserts, and hovering moves the selection', () => {
    const { onSelect } = renderMenu()
    const table = options().find((o) => labelOf(o as HTMLElement) === 'table')!
    fireEvent.mouseEnter(table)
    expect(labelOf(selected())).toBe('table')
    fireEvent.click(table)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'table' }))
  })
})

// ── Source law ─────────────────────────────────────────────────────────────────

describe('the component’s own source', () => {
  // The glass, the shared mono chrome (`picker-chrome.ts`, lifted out of this file by
  // #280 for the source picker) and the row it draws (`slash-row.tsx`, also shared with
  // #280) — one law for all three. The chrome moved; the law did not, so the source set
  // follows the strings rather than the file they used to live in.
  const source =
    read('src/components/molecules/SlashMenu.tsx') +
    read('src/components/molecules/picker-chrome.ts') +
    read('src/components/molecules/slash-row.tsx')

  it('consumes `.mn-glass` rather than writing a second glass recipe', () => {
    expect(source).not.toMatch(/rgba\(255,\s*255,\s*255/)
    expect(source).not.toMatch(/backdrop-filter|backdrop-blur/)
    expect(source).toMatch(/mn-glass/)
  })

  it('uses no Tailwind named type size, no cn(), no outline-none, and writes no focus ring of its own', () => {
    expect(source).not.toMatch(/\btext-(xs|sm|base|lg|xl)\b/)
    expect(source).not.toMatch(/from '@\/lib\/utils'/)
    expect(source).not.toMatch(/outline-none/)
    // Nothing in the glass takes focus (the keys arrive from the host's field), so a
    // ring here could never paint; one written anyway would be a second recipe.
    expect(source).not.toMatch(/focus-visible:(outline|ring)/)
  })

  it('keeps the .04em group label and the .01em row tracking the board draws', () => {
    expect(source).toMatch(/tracking-\[\.04em\]/)
    expect(source).toMatch(/tracking-\[\.01em\]/)
    // `COMPOSER_POP` (KAN-99) is the sans `@` popover's own chrome, a different
    // register from this mono picker's (ADR 0004 §4) — its head is uppercase per
    // board 6e frame 3. This guard is about the shared MONO row/group only.
    const mono = source.replace(
      /\/\*\*(?:[^*]|\*(?!\/))*\*\/\s*const COMPOSER_POP_GLASS[\s\S]*?export const COMPOSER_POP = \{[\s\S]*?\} as const/,
      ''
    )
    expect(mono).not.toMatch(/uppercase/)
  })

  it('sets the row’s line-height to CSS normal, not the page’s inherited 1.5', () => {
    // KAN-240: the board's row sets its type with the font shorthand and no
    // line-height (= `normal`); `leading-normal` is Tailwind's 1.5, the bug this guards.
    expect(source).toMatch(/leading-\[normal\]/)
    expect(source).not.toMatch(/\bleading-normal\b/)
  })
})
