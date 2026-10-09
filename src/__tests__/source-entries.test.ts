/**
 * The source picker's lists — `PondPicker kind="source"` (#280, child c of #226).
 *
 * The three states are read off `PondPicker.dc.html`'s own `source` branch at test
 * time (never hand-copied), and every count or word the picker renders is checked
 * against the owner that already derives it: `CHART_KINDS` for `all charts · 13`
 * (cross-checked against `PondChart.dc.html`'s `kind` enum), `PROPERTY_TYPES` for the
 * field words, `Pond 03` 3a for the vocabulary.
 */

import {
  chartSuggestions,
  CHART_LABEL,
  FIELD_WORD,
  footFor,
  headFor,
  newEntries,
  RECORDS_ARE,
  recordsWord,
  sourceEntries,
  typeEntries,
  type SourceDatabase,
  type SourceEntry,
  type SourceField,
} from '@/components/molecules/source-entries'
import { ICON } from '@/components/molecules/slash-entries'
import { CHART_KINDS } from '@/lib/modules/view/aggregate'
import { PROPERTY_TYPES } from '@/lib/properties/schema'
import { boardChartKinds, readHandoff } from './helpers/handoff'

/** `Pond 03` 3a — the 18px/500 term column, straight off the board. */
function glossaryTerms(): string[] {
  const html = readHandoff('Pond 03 Concepts.dc.html')
  const start = html.indexOf('id="3a"')
  const end = html.indexOf('class="dv-opt"', start + 10)
  return [
    ...html
      .slice(start, end)
      .matchAll(/<span style="font-size:18px;font-weight:500">([^<]+)<\/span>/g),
  ].map((m) => m[1])
}

/** The board's `source` branch of `renderVals()` — its rows, groups, feet and seg options. */
function boardSourceBranch(): string {
  const html = readHandoff('PondPicker.dc.html')
  const start = html.indexOf("} else if (kind === 'source')")
  const end = html.indexOf('} else {', start)
  return html.slice(start, end)
}
const boardWords = (seg: string) => [
  ...[...seg.matchAll(/\bit\('([^']+)'/g)].map((m) => m[1]),
  ...[...seg.matchAll(/\bG\('([^']+)'/g)].map((m) => m[1]),
]
const boardFeet = (seg: string) =>
  [...seg.matchAll(/foot = \[([^\]]+)\]/g)].map((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  )
const boardSeg = (seg: string) =>
  [...seg.match(/opts: \[(.+?)\] \}\]/)![1].matchAll(/\['([^']+)'/g)].map((m) => m[1])
const CALORIES: SourceField[] = [
  { name: 'day', type: 'date' },
  { name: 'kcal', type: 'number' },
]
const RECIPES: SourceDatabase = {
  id: 'recipes',
  title: 'recipes',
  records: 18,
  recordsAre: 'pages',
}
const DATABASES: SourceDatabase[] = [
  RECIPES,
  { id: 'calories', title: 'calories', records: 412, recordsAre: 'rows' },
  { id: 'transactions', title: 'transactions', records: 1380, recordsAre: 'rows' },
  { id: 'subscriptions', title: 'subscriptions', records: 6, recordsAre: 'pages' },
  { id: 'sleep', title: 'sleep nights', records: 241, recordsAre: 'rows' },
]

const shape = (entries: SourceEntry[]) =>
  entries.map((e) =>
    e.kind === 'group'
      ? `G:${e.label}`
      : e.kind === 'separator'
        ? '—'
        : e.kind === 'seg'
          ? 'SEG'
          : `${e.label}${e.hint ? ` ·${e.hint}` : ''}${e.sub ? ` ·${e.sub}` : ''}`
  )
const labels = (entries: SourceEntry[]) =>
  entries.flatMap((e) => (e.kind === 'row' ? [e.label] : []))

// ── The handoff really was read ────────────────────────────────────────────────

describe('the parsers', () => {
  it('read the board’s source branch, its three feet and the seg', () => {
    const seg = boardSourceBranch()
    expect(boardWords(seg)).toEqual(
      expect.arrayContaining([
        'new',
        'or view an existing one',
        'all charts',
        'fields',
        'records are',
      ])
    )
    expect(boardFeet(seg)).toHaveLength(3)
    expect(boardSeg(seg)).toEqual(['pages', 'rows only'])
    expect(glossaryTerms()).toEqual(expect.arrayContaining(['database', 'record', 'field', 'view']))
  })
})

// ── source ─────────────────────────────────────────────────────────────────────

describe('source — pick or create a database', () => {
  it('leads with `new database — <page>` under `new`, then every database under `or view an existing one`, with its count as the hint', () => {
    expect(shape(sourceEntries(DATABASES, 'recipes'))).toEqual([
      'G:new',
      'new database — recipes',
      'G:or view an existing one',
      'recipes ·18 records',
      'calories ·412 rows',
      'transactions ·1,380 rows',
      'subscriptions ·6 records',
      'sleep nights ·241 rows',
    ])
  })

  it('marks the new row with the board’s `plus` and each database with its `db` mark', () => {
    const rows = sourceEntries(DATABASES, 'recipes').filter((e) => e.kind === 'row')
    expect(rows[0].icon).toBe(ICON.plus)
    for (const row of rows.slice(1)) expect(row.icon).toBe(ICON.db)
  })

  it('a pond with no database yet offers only the new row — no empty group', () => {
    expect(shape(sourceEntries([], 'recipes'))).toEqual(['G:new', 'new database — recipes'])
  })

  it('the sub says `records` for a database whose records are pages and `rows` for rows only — the seg’s own distinction, one owner', () => {
    expect(recordsWord(RECIPES)).toBe('18 records')
    expect(recordsWord({ ...RECIPES, records: 1 })).toBe('1 record')
    expect(recordsWord({ ...RECIPES, recordsAre: 'rows', records: 1 })).toBe('1 row')
    expect(recordsWord({ ...RECIPES, recordsAre: 'rows', records: 1380 })).toBe('1,380 rows')
  })
})

// ── type ───────────────────────────────────────────────────────────────────────

describe('type — pick a chart type', () => {
  it('a date + number source fits line, area + target and heatmap, named from the source’s own fields, then a rule and `all charts · <n>`', () => {
    expect(shape(typeEntries(CALORIES, false))).toEqual([
      'G:fits date + number',
      'line ·kcal by day',
      'area + target ·kcal against a target',
      'heatmap ·one cell a day',
      '—',
      `all charts ·${CHART_KINDS.length}`,
    ])
  })

  it('`all charts · 13` is derived from CHART_KINDS, which is exactly PondChart’s `kind` enum — never a typed number', () => {
    const kinds = boardChartKinds()
    expect(kinds).toHaveLength(13)
    expect([...CHART_KINDS]).toEqual(kinds)
    const all = typeEntries(CALORIES, false).find((e) => e.kind === 'row' && e.id === 'all')!
    expect(all.kind === 'row' && all.hint).toBe(String(kinds.length))
  })

  it('the suggestions map onto real chart kinds, with the board’s own marks', () => {
    const { fits, rows } = chartSuggestions(CALORIES)
    expect(fits).toEqual(['date', 'number'])
    expect(rows.map((r) => r.kind)).toEqual(['line', 'area', 'heatmap'])
    for (const r of rows) expect(CHART_KINDS).toContain(r.kind)
    expect(rows.map((r) => r.icon)).toEqual([ICON.line, ICON.area, ICON.heat])
  })

  it('a source with no date + number pair offers no `fits` group — just `all charts`', () => {
    const text: SourceField[] = [{ name: 'title', type: 'text' }]
    expect(shape(typeEntries(text, false))).toEqual([`all charts ·${CHART_KINDS.length}`])
    expect(shape(typeEntries(undefined, false))).toEqual([`all charts ·${CHART_KINDS.length}`])
  })

  it('expanded, `all charts` lists every kind in CHART_KINDS order — one row per kind, no more', () => {
    const entries = typeEntries(CALORIES, true)
    expect(entries[0]).toEqual({ kind: 'group', label: 'all charts' })
    // Pond's word per kind, not the engine key — `net` is `profit / loss line`.
    // `CHART_LABEL` is `Record<ChartKind, string>`, so a fourteenth kind cannot
    // arrive unnamed, and nothing here can drift back to the raw enum.
    expect(labels(entries)).toEqual(CHART_KINDS.map((k) => CHART_LABEL[k]))
    expect(labels(entries)).not.toContain('net')
    expect(labels(entries)).not.toContain('composed')
    const ids = entries.flatMap((e) => (e.kind === 'row' ? [e.id] : []))
    expect(ids).toEqual(CHART_KINDS.map((k) => `kind:${k}`))
  })
})

// ── new ────────────────────────────────────────────────────────────────────────

describe('new — define a new database', () => {
  it('lists the fields with their Pond word as the hint, the faint `field` add row, then `records are` and the seg', () => {
    const fields: SourceField[] = [
      { name: 'title', type: 'text' },
      { name: 'time', type: 'number' },
      { name: 'tag', type: 'select' },
    ]
    const entries = newEntries(fields)
    expect(shape(entries)).toEqual([
      'G:fields',
      'title ·text',
      'time ·number',
      'tag ·tag',
      'field',
      'G:records are',
      'SEG',
    ])
    const add = entries.find((e) => e.kind === 'row' && e.id === 'add-field')!
    expect(add.kind === 'row' && add.faint).toBe(true)
    expect(add.kind === 'row' && add.icon).toBe(ICON.plus)
  })

  it('FIELD_WORD covers every one of the engine’s property types — the compiler holds it exhaustive, this holds it lowercase', () => {
    expect(Object.keys(FIELD_WORD).sort()).toEqual([...PROPERTY_TYPES].sort())
    for (const word of Object.values(FIELD_WORD)) expect(word).toBe(word.toLowerCase())
  })

  it('the seg’s two options are the board’s, verbatim and in order', () => {
    expect(RECORDS_ARE.map((o) => o.label)).toEqual(boardSeg(boardSourceBranch()))
    expect(RECORDS_ARE.map((o) => o.value)).toEqual(['pages', 'rows'])
  })
})

// ── head and foot ──────────────────────────────────────────────────────────────

describe('head and foot — the board’s copy, per step', () => {
  it('heads: `/table`, `/chart › <source>`, `new database — <page>`', () => {
    expect(headFor('source', { block: 'table', pageTitle: 'recipes' })).toBe('/table')
    expect(headFor('type', { block: 'chart', pageTitle: 'recipes', source: 'calories' })).toBe(
      '/chart › calories'
    )
    expect(headFor('new', { block: 'table', pageTitle: 'recipes' })).toBe('new database — recipes')
  })

  it('feet are the board’s three, verbatim — all three states draw one', () => {
    const [source, type, fresh] = boardFeet(boardSourceBranch())
    expect(footFor('source', { block: 'table', newSelected: true })).toEqual(source)
    expect(footFor('type', { block: 'chart', newSelected: false })).toEqual(type)
    expect(footFor('new', { block: 'table', newSelected: false })).toEqual(fresh)
  })

  it('with an existing database selected the source foot offers ↵ view; the new step names the view the page gets', () => {
    expect(footFor('source', { block: 'table', newSelected: false })).toEqual(['↵ view'])
    expect(footFor('new', { block: 'gallery', newSelected: false })).toEqual([
      'filed in databases',
      'this page gets a gallery view',
    ])
  })
})

// ── vocabulary ─────────────────────────────────────────────────────────────────

/** 3a `field`'s own list — "text, number, date, money, tag, checkbox, relation, link, image". */
function glossaryFieldTypes(): string[] {
  const html = readHandoff('Pond 03 Concepts.dc.html')
  const at = html.indexOf('One typed value on a record:')
  const sentence = html.slice(at, html.indexOf('.', at))
  return sentence
    .slice(sentence.indexOf(':') + 1)
    .split(',')
    .map((w) => w.trim())
}

describe('the picker speaks Pond’s words only', () => {
  it('every group label and chrome row is a label the board itself draws (or the derived `fits …`)', () => {
    const board = new Set(boardWords(boardSourceBranch()))
    const chrome: string[] = []
    for (const entries of [
      sourceEntries(DATABASES, 'recipes'),
      typeEntries(CALORIES, false),
      typeEntries(CALORIES, true),
      newEntries([{ name: 'title', type: 'text' }]),
    ]) {
      for (const e of entries) {
        if (e.kind === 'group') chrome.push(e.label)
        if (e.kind === 'row' && (e.id === 'add-field' || e.id === 'all')) chrome.push(e.label)
      }
    }
    for (const s of chrome) {
      expect(s).toBe(s.toLowerCase())
      expect(board.has(s) || s === 'fits date + number').toBe(true)
    }
  })

  it('the seg options are the board’s and every rendered field word is one of 3a’s field types', () => {
    const fieldTypes = glossaryFieldTypes()
    expect(fieldTypes).toEqual(
      expect.arrayContaining(['text', 'number', 'date', 'tag', 'checkbox'])
    )
    const boardSegWords = boardSeg(boardSourceBranch())
    for (const o of RECORDS_ARE) expect(boardSegWords).toContain(o.label)
    for (const type of [
      'text',
      'number',
      'date',
      'select',
      'status',
      'checkbox',
      'relation',
    ] as const)
      expect(fieldTypes).toContain(FIELD_WORD[type])
    // `rollup` is the engine's derived property with no glossary word (3a names none);
    // it keeps its own name rather than borrowing `relation`, and stays lowercase.
    expect(FIELD_WORD.rollup).toBe('rollup')
  })

  it('a chart kind’s row is its engine name, lowercase', () => {
    for (const label of labels(typeEntries(CALORIES, true))) expect(label).toBe(label.toLowerCase())
  })
})
