/**
 * `templateRows` and `rowEntries`'s `.template` carry-through (KAN-276): the
 * blank-page list threads the `templates` group through the ordinary rows
 * pane, so a template row must survive `rowEntries` same as any other row.
 */

import {
  BLANK_TEXT_GROUP,
  blankRowEntries,
  footItems,
  ICON,
  matchRuns,
  MOBILE_ROW_CAP,
  rowEntries,
  slashMenuHeight,
  templateRows,
  type SlashRow,
  type YourTemplate,
} from './slash-entries'
import { TEMPLATE_KINDS } from '@/lib/templates/types'

const YOURS: readonly YourTemplate[] = [
  { id: 't1', name: 'weeknight recipe', hint: 'from chickpeas…' },
]

const TEXT_ROW: SlashRow = { id: 't', label: 'text', group: 'text' }
const TABLE_ROW: SlashRow = { id: 'table-row', label: 'table', group: 'blocks' }

/** Shaped like `slashRows` (palette.ts): groups `text` → `blocks` → `templates` → `pages`. */
const BLANK_ROWS: readonly SlashRow[] = [
  TEXT_ROW,
  TABLE_ROW,
  {
    id: 'page-from-template',
    label: 'page from template',
    group: 'templates',
    submenu: 'templates',
  },
  { id: 'page', label: 'page', group: 'pages' },
]

describe('templateRows', () => {
  it('is one flat `templates` row per yours, then one per premade kind', () => {
    const rows = templateRows(YOURS)
    expect(rows.every((r) => r.group === 'templates')).toBe(true)
    expect(rows.filter((r) => r.template?.origin === 'premade')).toHaveLength(12)
    expect(rows.find((r) => r.id === 'premade:page')?.template).toEqual({
      origin: 'premade',
      kind: 'page',
    })
    const yours = rows.find((r) => r.id === 'yours:t1')
    expect(yours?.label).toBe('weeknight recipe')
    expect(yours?.key).toBe('yours')
    expect(yours?.template).toEqual({ origin: 'yours', id: 't1' })
  })

  it('6f frame 2: the person’s own lead, premades follow', () => {
    const rows = templateRows(YOURS)
    expect(rows[0]).toMatchObject({ id: 'yours:t1', template: { origin: 'yours', id: 't1' } })
    expect(rows.slice(1).every((r) => r.template?.origin === 'premade')).toBe(true)
  })
})

describe('rowEntries carries `.template` through', () => {
  it('unfiltered: a `templates` group leads, its rows carry `.template`, then the rest', () => {
    const entries = rowEntries([...templateRows(YOURS), TEXT_ROW], '')
    expect(entries[0]).toEqual({ kind: 'group', label: 'templates' })
    const templateEntries = entries.slice(1, 1 + 13)
    expect(templateEntries).toHaveLength(13)
    for (const e of templateEntries) {
      expect(e.kind).toBe('row')
      expect(e.kind === 'row' && e.template).toBeDefined()
    }
    expect(entries[entries.length - 2]).toEqual({ kind: 'group', label: 'text' })
    const last = entries[entries.length - 1]
    expect(last.kind === 'row' && last.label).toBe('text')
  })

  it('filtered: matches land from both the inline templates and the ordinary rows, no group headers', () => {
    const entries = rowEntries([...templateRows(YOURS), TABLE_ROW], 'ta')
    expect(entries.some((e) => e.kind === 'group')).toBe(false)
    const labels = entries.filter((e) => e.kind === 'row').map((e) => e.kind === 'row' && e.label)
    expect(labels).toContain('table')
    expect(labels).toContain('database')
    const databaseEntry = entries.find((e) => e.kind === 'row' && e.label === 'database')
    expect(databaseEntry?.kind === 'row' && databaseEntry.template).toEqual({
      origin: 'premade',
      kind: 'database',
    })
  })
})

describe('rowEntries: an unknown word after `/` (KAN-84)', () => {
  it('zero matches: two rows, text then heading, built from the word — never the DC empty note', () => {
    const entries = rowEntries([TEXT_ROW, TABLE_ROW], 'wine')
    expect(entries).toHaveLength(2)
    const [text, heading] = entries
    expect(text).toMatchObject({
      kind: 'row',
      id: 'freetext:text',
      label: 'text — “wine”',
      hint: 'no block named wine',
      icon: ICON.text,
      row: { id: 'freetext:text', label: 'text', freeText: { as: 'text', word: 'wine' } },
    })
    expect(heading).toMatchObject({
      kind: 'row',
      id: 'freetext:heading',
      label: 'heading — “wine”',
      icon: ICON.heading,
      row: { id: 'freetext:heading', label: 'heading', freeText: { as: 'heading', word: 'wine' } },
    })
    expect(heading.kind === 'row' && heading.hint).toBeUndefined()
  })

  it('matches case-insensitively but keeps the word’s own casing, trimmed only', () => {
    const entries = rowEntries([TEXT_ROW], '  Wine  ')
    expect(entries[0]).toMatchObject({
      label: 'text — “Wine”',
      row: { freeText: { word: 'Wine' } },
    })
    expect(entries[0].kind === 'row' && entries[0].hint).toBe('no block named Wine')
  })

  it('a real match (e.g. `/ta`) is untouched — no free-text rows mixed in', () => {
    const entries = rowEntries([TEXT_ROW, TABLE_ROW], 'ta')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'row', id: 'table-row', label: 'table' })
    expect(entries.some((e) => e.kind === 'row' && e.row?.freeText)).toBe(false)
  })
})

describe('blankRowEntries', () => {
  it('unfiltered: templates lead, the text group becomes the scroll cue, then blocks/templates/pages follow', () => {
    const entries = blankRowEntries(BLANK_ROWS, YOURS, '')
    const groups = entries
      .filter((e) => e.kind === 'group')
      .map((e) => e.kind === 'group' && e.label)
    expect(groups).toEqual(['templates', BLANK_TEXT_GROUP, 'blocks', 'templates', 'pages'])
  })

  it('filtered: drops every group header and lists matches from both the inline templates and the ordinary rows', () => {
    const entries = blankRowEntries(BLANK_ROWS, YOURS, 'ta')
    expect(entries.some((e) => e.kind === 'group')).toBe(false)
    const labels = entries.filter((e) => e.kind === 'row').map((e) => e.kind === 'row' && e.label)
    expect(labels).toContain('table')
    expect(labels).toContain('database')
  })

  it('mobile: the templates group is capped on its own, so `text` and the other ordinary rows survive', () => {
    const entries = blankRowEntries(BLANK_ROWS, YOURS, '', MOBILE_ROW_CAP)
    const labels = entries.filter((e) => e.kind === 'row').map((e) => e.kind === 'row' && e.label)
    expect(labels).toContain('text')
    expect(labels).toContain('table')
    expect(labels).toContain('page')
  })

  it('KAN-138: with no ranking data yet (defaults), yours lead then premade in canonical order, unmoved (G6)', () => {
    const withDefaults = blankRowEntries(BLANK_ROWS, YOURS, '')
    const withExplicitDefaults = blankRowEntries(BLANK_ROWS, YOURS, '', Infinity, [], null, null)
    expect(withDefaults).toEqual(withExplicitDefaults)
    const templateRowEntries = withDefaults.filter(
      (e) => e.kind === 'row' && e.template !== undefined
    )
    expect(templateRowEntries.map((e) => e.kind === 'row' && e.id)).toEqual([
      'yours:t1',
      ...TEMPLATE_KINDS.map((k) => `premade:${k}`),
    ])
  })
})

describe('slashMenuHeight', () => {
  it('mobile + leadWithTemplates sizes off the blank list, not the full combined list', () => {
    const blank = slashMenuHeight(BLANK_ROWS, 'mobile', 900, true, YOURS)
    const ordinary = slashMenuHeight(BLANK_ROWS, 'mobile', 900)
    // Capped templates (4) + the ordinary rows is taller than the plain list,
    // but nowhere near the uncapped 13 templates + 4 rows the old bug sized for.
    expect(blank).toBeGreaterThan(ordinary)
  })
})

describe('footItems', () => {
  it('rows pane, active entry is a template: reads `new nested page`, not `insert`', () => {
    const foot = footItems('rows', '', 3, false, true)
    expect(foot).toContain('↵ new nested page')
    expect(foot).not.toContain('↵ insert')
  })

  it('rows pane, active entry is not a template: unchanged', () => {
    expect(footItems('rows', '', 3, false, false)).toEqual([
      '↑↓ move',
      '↵ insert',
      'esc keep as text',
    ])
  })

  it('leading with templates: no `esc keep as text` — 6f frame 2 draws no such key', () => {
    expect(footItems('rows', '', 3, false, false, true)).toEqual(['↑↓ move', '↵ insert'])
  })

  it('leading with templates, active row is a template pick: reads `apply`, not `new nested page`', () => {
    expect(footItems('rows', '', 3, false, true, true)).toEqual(['↑↓ move', '→ preview', '↵ apply'])
  })

  it('templates pane (non-empty page) keeps `new nested page` / `preview`, unchanged', () => {
    expect(footItems('templates', '', 12, true)).toEqual(['↵ new nested page', '→ preview'])
    expect(footItems('templates', '', 12, false)).toEqual(['↵ new nested page'])
  })

  it('previewing overrides every branch: `↵ apply · esc back`, no `↑↓ move`', () => {
    expect(footItems('rows', '', 3, false, true, false, true)).toEqual(['↵ apply', 'esc back'])
    expect(footItems('rows', '', 3, false, false, false, true)).toEqual(['↵ apply', 'esc back'])
    expect(footItems('rows', '', 3, false, false, true, true)).toEqual(['↵ apply', 'esc back'])
    expect(footItems('rows', '', 3, false, true, true, true)).toEqual(['↵ apply', 'esc back'])
    expect(footItems('templates', '', 12, true, false, false, true)).toEqual([
      '↵ apply',
      'esc back',
    ])
    expect(footItems('templates', '', 12, false, false, false, true)).toEqual([
      '↵ apply',
      'esc back',
    ])
  })

  it('active row is a free-text row: names what ↵ inserts, ahead of the match-count branches', () => {
    expect(footItems('rows', 'wine', 2, false, false, false, false, 'text')).toEqual([
      '↵ insert as text',
    ])
    expect(footItems('rows', 'wine', 2, false, false, false, false, 'heading')).toEqual([
      '↵ insert as heading',
    ])
  })
})

describe('matchRuns (KAN-390)', () => {
  it('a subsequence (fuzzy) match underlines every matched character as its own run', () => {
    expect(matchRuns('new page', 'nwp')).toEqual([
      { text: 'n', hit: true },
      { text: 'e', hit: false },
      { text: 'w', hit: true },
      { text: ' ', hit: false },
      { text: 'p', hit: true },
      { text: 'age', hit: false },
    ])
  })

  it('an exact match is one run, fully underlined', () => {
    expect(matchRuns('new page', 'new page')).toEqual([{ text: 'new page', hit: true }])
  })

  it('a prefix match is one leading run, underlined, the rest plain', () => {
    expect(matchRuns('new page', 'new')).toEqual([
      { text: 'new', hit: true },
      { text: ' page', hit: false },
    ])
  })

  it('a substring match mid-label is one run, pre and post plain', () => {
    expect(matchRuns('new page', 'w pa')).toEqual([
      { text: 'ne', hit: false },
      { text: 'w pa', hit: true },
      { text: 'ge', hit: false },
    ])
  })

  it('an empty query is one unmatched run', () => {
    expect(matchRuns('new page', '')).toEqual([{ text: 'new page', hit: false }])
  })
})
