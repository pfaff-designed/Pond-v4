/**
 * The source picker — `PondPicker kind="source"` (#280, child c of #226): the three
 * steps, the keys, the one segmented control, and what a pick hands the host.
 * Appearance is the stories' job (real computed styles, both themes); this holds
 * behaviour and structure under jsdom.
 */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SourcePicker, type SourcePickerProps } from '@/components/molecules/SourcePicker'
import type { SourceDatabase, SourceField } from '@/components/molecules/source-entries'
import { CHART_KINDS } from '@/lib/modules/view/aggregate'

const RECIPES: SourceDatabase = {
  id: 'recipes',
  title: 'recipes',
  records: 18,
  recordsAre: 'pages',
}
const CALORIES: SourceDatabase = {
  id: 'calories',
  title: 'calories',
  records: 412,
  recordsAre: 'rows',
}
const DATABASES = [RECIPES, CALORIES]
const CALORIE_FIELDS: SourceField[] = [
  { name: 'day', type: 'date' },
  { name: 'kcal', type: 'number' },
]

function renderPicker(overrides: Partial<SourcePickerProps> = {}) {
  const onPick = jest.fn()
  const onClose = jest.fn()
  const anchor = document.createElement('textarea')
  anchor.value = '/table'
  document.body.appendChild(anchor)
  anchor.focus()
  const utils = render(
    <SourcePicker
      block="table"
      pageTitle="recipes"
      databases={DATABASES}
      anchor={anchor}
      onPick={onPick}
      onClose={onClose}
      {...overrides}
    />
  )
  return { ...utils, onPick, onClose, anchor }
}

const glass = () => document.querySelector<HTMLElement>('[data-part="glass"]')!
const head = () => glass().querySelector('[data-part="head-text"]')!.textContent
const groups = () => [...glass().querySelectorAll('[data-part="group"]')].map((g) => g.textContent)
const foot = () => glass().querySelector('[data-part="foot"]')!.textContent
const options = () => screen.getAllByRole('option')
const labelOf = (el: Element) => el.querySelector('[data-part="label"]')!.textContent
const hintOf = (el: Element) => el.querySelector('[data-part="hint"]')?.textContent ?? null
const selected = () => screen.queryByRole('option', { selected: true })
const key = (k: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k })

afterEach(() => {
  document.body.querySelectorAll('textarea').forEach((t) => t.remove())
})

// ── source ─────────────────────────────────────────────────────────────────────

describe('source — pick or create a database', () => {
  it('opens on `/table` with `new database — recipes` selected under `new`, every database one row down with its count, and the create foot', () => {
    renderPicker()
    expect(glass().dataset.kind).toBe('source')
    expect(glass().dataset.step).toBe('source')
    expect(glass().querySelector('input')).toBeNull()
    expect(head()).toBe('/table')
    expect(groups()).toEqual(['new', 'or view an existing one'])
    expect(options().map(labelOf)).toEqual(['new database — recipes', 'recipes', 'calories'])
    expect(labelOf(selected()!)).toBe('new database — recipes')
    expect(options().map(hintOf)).toEqual([null, '18 records', '412 rows'])
    expect(foot()).toBe('named after this page↵ create')
  })

  it('↓ onto an existing database turns the foot to `↵ view`; ↵ hands the host that database in table mode', () => {
    const { onPick } = renderPicker()
    key('ArrowDown')
    expect(labelOf(selected()!)).toBe('recipes')
    expect(foot()).toBe('↵ view')
    key('Enter')
    expect(onPick).toHaveBeenCalledWith({ kind: 'existing', database: RECIPES, mode: 'table' })
  })

  it('a click on a database row picks it; a gallery pick carries gallery mode', () => {
    const { onPick } = renderPicker({ block: 'gallery' })
    expect(head()).toBe('/gallery')
    fireEvent.click(options()[2])
    expect(onPick).toHaveBeenCalledWith({ kind: 'existing', database: CALORIES, mode: 'gallery' })
  })

  it('esc closes and keeps the typed text; so does a press outside the glass', () => {
    const { onClose, anchor } = renderPicker()
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(anchor.value).toBe('/table')
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.pointerDown(glass())
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('↑↓ ↵ esc never reach the field underneath', () => {
    renderPicker()
    const reached = jest.fn()
    document.activeElement!.addEventListener('keydown', reached)
    key('ArrowDown')
    key('Enter')
    expect(reached).not.toHaveBeenCalled()
  })
})

// ── new ────────────────────────────────────────────────────────────────────────

describe('new — define a new database', () => {
  it('↵ on the new row opens `new database — recipes`: the title field, the faint `field` add row, `records are` and the seg with `pages` pressed', () => {
    renderPicker()
    key('Enter')
    expect(glass().dataset.step).toBe('new')
    expect(head()).toBe('new database — recipes')
    expect(groups()).toEqual(['fields', 'records are'])
    expect(options().map(labelOf)).toEqual(['title', 'field'])
    expect(hintOf(options()[0])).toBe('text')
    expect(selected()).toBeNull()
    const seg = within(glass().querySelector<HTMLElement>('[data-part="seg"]')!)
    const opts = seg.getAllByRole('button')
    expect(opts.map((o) => o.textContent)).toEqual(['pages', 'rows only'])
    expect(opts.map((o) => o.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(foot()).toBe('filed in databasesthis page gets a table view')
  })

  it('the seg actually switches: `rows only` presses, `pages` releases, and the choice rides the pick', () => {
    const { onPick } = renderPicker()
    key('Enter')
    const seg = within(glass().querySelector<HTMLElement>('[data-part="seg"]')!)
    fireEvent.click(seg.getByRole('button', { name: 'rows only' }))
    expect(seg.getByRole('button', { name: 'rows only' }).getAttribute('aria-pressed')).toBe('true')
    expect(seg.getByRole('button', { name: 'pages' }).getAttribute('aria-pressed')).toBe('false')
    // Pressing the pressed option again does not leave the seg with no choice.
    fireEvent.click(seg.getByRole('button', { name: 'rows only' }))
    expect(seg.getByRole('button', { name: 'rows only' }).getAttribute('aria-pressed')).toBe('true')
    key('Enter')
    expect(onPick).toHaveBeenCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [],
      recordsAre: 'rows',
      mode: 'table',
      chart: undefined,
    })
  })

  it('↵ on `field` adds a text field each time — `field`, then `field 2` — and they ride the pick', () => {
    const { onPick } = renderPicker()
    key('Enter')
    key('ArrowDown')
    key('ArrowDown')
    expect(labelOf(selected()!)).toBe('field')
    key('Enter')
    expect(options().map(labelOf)).toEqual(['title', 'field', 'field'])
    key('ArrowDown')
    key('Enter')
    expect(options().map(labelOf)).toEqual(['title', 'field', 'field 2', 'field'])
    key('ArrowUp')
    key('Enter')
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'new',
        fields: [
          { name: 'field', type: 'text' },
          { name: 'field 2', type: 'text' },
        ],
      })
    )
  })

  it('a pond with no database yet goes straight from the lone new row', () => {
    renderPicker({ databases: [] })
    expect(groups()).toEqual(['new'])
    expect(options()).toHaveLength(1)
    key('Enter')
    expect(glass().dataset.step).toBe('new')
  })
})

// ── type ───────────────────────────────────────────────────────────────────────

describe('type — pick a chart type', () => {
  const loadFields = jest.fn(async (id: string) => (id === 'calories' ? CALORIE_FIELDS : []))
  beforeEach(() => loadFields.mockClear())

  it('`/chart` on an existing database opens `/chart › calories`: the fits group named from its fields, a rule, and `all charts · <n>`', async () => {
    renderPicker({ block: 'chart', loadFields })
    fireEvent.click(options()[2])
    expect(glass().dataset.step).toBe('type')
    expect(head()).toBe('/chart › calories')
    await waitFor(() => expect(groups()).toEqual(['fits date + number']))
    expect(loadFields).toHaveBeenCalledWith('calories')
    expect(options().map(labelOf)).toEqual(['line', 'area + target', 'heatmap', 'all charts'])
    expect([...glass().querySelectorAll('[data-part="sub"]')].map((s) => s.textContent)).toEqual([
      'kcal by day',
      'kcal against a target',
      'one cell a day',
    ])
    expect(glass().querySelector('[data-part="rule"]')).not.toBeNull()
    expect(hintOf(options()[3])).toBe(String(CHART_KINDS.length))
    expect(labelOf(selected()!)).toBe('line')
    expect(foot()).toBe('suggested from the source’s fields')
  })

  it('↵ on a kind hands the host the database with that chart kind', async () => {
    const { onPick } = renderPicker({ block: 'chart', loadFields })
    fireEvent.click(options()[2])
    await waitFor(() => expect(options()).toHaveLength(4))
    key('ArrowDown')
    key('Enter')
    expect(onPick).toHaveBeenCalledWith({
      kind: 'existing',
      database: CALORIES,
      mode: 'chart',
      chart: 'area',
    })
  })

  it('↵ on `all charts` unfolds every kind in place, in CHART_KINDS order; ↵ on one picks it', async () => {
    const { onPick } = renderPicker({ block: 'chart', loadFields })
    fireEvent.click(options()[2])
    await waitFor(() => expect(options()).toHaveLength(4))
    fireEvent.click(options()[3])
    expect(groups()).toEqual(['all charts'])
    expect(options().map(labelOf)).toEqual([...CHART_KINDS])
    expect(glass().querySelector('[data-part="rule"]')).toBeNull()
    fireEvent.click(options()[CHART_KINDS.indexOf('sankey')])
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ chart: 'sankey' }))
  })

  it('a source with no date + number pair offers only `all charts`', async () => {
    renderPicker({ block: 'chart', loadFields })
    fireEvent.click(options()[1])
    await waitFor(() => expect(loadFields).toHaveBeenCalledWith('recipes'))
    await waitFor(() => expect(options().map(labelOf)).toEqual(['all charts']))
    expect(groups()).toEqual([])
  })

  it('`/chart` on a NEW database defines it first, then picks the type, and the pick carries both', () => {
    const { onPick } = renderPicker({ block: 'chart' })
    key('Enter')
    expect(glass().dataset.step).toBe('new')
    expect(foot()).toBe('filed in databasesthis page gets a chart view')
    key('Enter')
    expect(glass().dataset.step).toBe('type')
    expect(head()).toBe('/chart › recipes')
    expect(options().map(labelOf)).toEqual(['all charts'])
    key('Enter')
    fireEvent.click(options()[CHART_KINDS.indexOf('bar')])
    expect(onPick).toHaveBeenCalledWith({
      kind: 'new',
      title: 'recipes',
      fields: [],
      recordsAre: 'pages',
      mode: 'chart',
      chart: 'bar',
    })
  })

  it('opens straight on `type` for a source the host already wired (AUDIT C9)', async () => {
    renderPicker({ block: 'chart', loadFields, defaultStep: 'type', defaultSource: CALORIES })
    expect(head()).toBe('/chart › calories')
    await waitFor(() => expect(options()).toHaveLength(4))
  })
})

// ── vocabulary ─────────────────────────────────────────────────────────────────

describe('the picker speaks Pond’s words only', () => {
  it('every rendered string in every step is lowercase — no build vocabulary reaches the glass', async () => {
    const { unmount } = renderPicker({ block: 'chart', loadFields: async () => CALORIE_FIELDS })
    expect(glass().textContent).not.toMatch(/[A-Z]/)
    fireEvent.click(options()[2])
    await waitFor(() => expect(options()).toHaveLength(4))
    expect(glass().textContent).not.toMatch(/[A-Z]/)
    fireEvent.click(options()[3])
    expect(glass().textContent).not.toMatch(/[A-Z]/)
    unmount()
    renderPicker()
    key('Enter')
    expect(glass().textContent).not.toMatch(/[A-Z]/)
  })
})
