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
import { SlashMenu, type SlashRow } from '@/components/molecules/SlashMenu'
import { slashRows, mintPreset, BOARD_ORDER, HEADING_PREFIX, WITHHELD } from '@/lib/modules/palette'
import { moduleDescriptors } from '@/lib/modules/registry'
import { TEMPLATE_KINDS } from '@/lib/templates/types'
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

const ALLOWED = new Set([...glossaryTerms(), ...boardSlashWords(), ...TEMPLATE_KINDS])

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
    const renders: Array<Partial<React.ComponentProps<typeof SlashMenu>>> = [
      {},
      { query: 'ta' },
      { query: 'zz' },
      { defaultPane: 'templates' },
    ]
    for (const props of renders) {
      const { unmount } = renderMenu(props)
      const text = glass().textContent ?? ''
      expect(text).not.toMatch(/[A-Z]/)
      for (const o of screen.queryAllByRole('option')) {
        expect(ALLOWED.has(labelOf(o as HTMLElement)!)).toBe(true)
      }
      unmount()
    }
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

  it('every descriptor names itself in Pond’s words, with a short lowercase palette line', () => {
    for (const d of Object.values(moduleDescriptors)) {
      expect(ALLOWED.has(d.label)).toBe(true)
      expect(d.label).toBe(d.label.toLowerCase())
      expect(d.paletteDescription).toBe(d.paletteDescription.toLowerCase())
      expect(d.paletteDescription.length).toBeLessThan(80)
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
    expect(mintPreset('list')).toMatchObject({ type: 'todo', marker: 'dot' })
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

  it('the board draws no `board` row, so the menu offers none', () => {
    expect(slashRows.some((r) => r.id === 'board' || r.label === 'board')).toBe(false)
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
      'blocks/gallery',
      'blocks/chart',
      'blocks/big number',
      'blocks/entry log',
      'templates/page from template',
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
    expect(groups).toEqual(['text', 'blocks', 'templates'])
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
    const n = options().length
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(
      `/ ta — ${n} ${n === 1 ? 'match' : 'matches'}`
    )
    expect(labelOf(selected())).toBe('table')
  })

  it('a row matched through its description shows that description as its hint, with nothing underlined', () => {
    const rows: SlashRow[] = [
      { id: 'a', label: 'entry log', description: 'a dated table', icon: { d: 'M0 0' } },
      { id: 'b', label: 'chart', description: 'figures over time', icon: { d: 'M0 0' } },
    ]
    renderMenu({ rows, query: 'table' })
    expect(options()).toHaveLength(1)
    const row = options()[0]
    expect(row.querySelector('[data-part="hit"]')!.textContent).toBe('')
    fireEvent.mouseLeave(row)
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe('/ table — 1 match')
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
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe('↵ new nested page')
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

  it('lists the person’s own templates under `yours`, and `→ preview` only once a preview exists', () => {
    const onPreviewTemplate = jest.fn()
    const { anchor, onPickTemplate } = renderMenu({
      defaultPane: 'templates',
      yourTemplates: [{ id: 't1', name: 'weeknight recipe', hint: 'from chickpeas…' }],
      onPreviewTemplate,
    })
    const groups = [...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
    expect(groups).toEqual(['premade', 'yours'])
    expect(glass().querySelector('[data-part="foot"]')!.textContent).toBe(
      '↵ new nested page→ preview'
    )
    const mine = options().find((o) => labelOf(o as HTMLElement) === 'weeknight recipe')!
    expect(within(mine).getByText('from chickpeas…')).toBeInTheDocument()
    fireEvent.click(mine)
    expect(onPickTemplate).toHaveBeenCalledWith({ origin: 'yours', id: 't1' })
    fireEvent.keyDown(anchor, { key: 'ArrowRight' })
    expect(onPreviewTemplate).toHaveBeenCalledWith({ origin: 'premade', kind: 'page' })
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
    expect(labelOf(selected())).toBe('page from template')
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
    expect(source).not.toMatch(/uppercase/)
  })
})
