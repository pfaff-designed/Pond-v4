/**
 * What the source picker lists at each step — pure, so `SourcePicker.tsx` only
 * draws (#280, child c of #226). `PondPicker kind="source"`, `Pond 02` 2e:
 *
 *   source  "one picker for tables, galleries and charts. `new database`, named
 *           after the page, is selected, so ↵ is enough. anything already in
 *           databases is one row down."
 *   type    "for a chart, pond offers the two or three types that fit the source's
 *           fields. the full list of thirteen is always one row away."
 *   new     "starting one asks for its fields and whether each record is a page or
 *           a row. it is filed in databases; the page it started on gets the view."
 *
 * Every count and word here comes from the owner that already derives it, never a
 * typed literal: `all charts · 13` is `CHART_KINDS.length` (`aggregate.ts`, which
 * `source-entries.test.ts` holds equal to `pond-charts.js`'s thirteen keys); a
 * field's word is `FIELD_WORD` over `PROPERTY_TYPES`; `18 records` / `412 rows`
 * is `plural` over the database's own `recordsAre`. The marks are `ICON`, the
 * board's `I` table (`slash-entries.ts`).
 */

import { CHART_KINDS, type ChartKind } from '@/lib/modules/view/aggregate'
import { plural } from '@/lib/modules/block-frame'
import type { ViewMode } from '@/lib/modules/view/schema'
import type { PropertyType } from '@/lib/properties/schema'

import { ICON, type SlashEntry, type SlashIcon } from './slash-entries'

/**
 * The three `/` rows that open this picker (`Pond 02` 2e: "table, gallery and
 * chart all open the same picker") — each is the `ViewMode` it makes, and each is
 * the `slashRows` id of its row (`lib/modules/palette.ts`), so the host routes a
 * pick here by id with no second table.
 */
export const SOURCE_BLOCKS = ['table', 'gallery', 'chart'] as const satisfies readonly ViewMode[]
export type SourceBlock = (typeof SOURCE_BLOCKS)[number]

/** The picker a `/` row opens, or null for a row that inserts its block directly. */
export function sourceBlockOf(rowId: string): SourceBlock | null {
  return (SOURCE_BLOCKS as readonly string[]).includes(rowId) ? (rowId as SourceBlock) : null
}
export type SourceStep = 'source' | 'type' | 'new'
/** 3a `record`: "either a page of its own or a row only." */
export type RecordsAre = 'pages' | 'rows'

export interface SourceDatabase {
  id: string
  title: string
  /** How many records it holds — the sub `18 records` / `412 rows`. */
  records: number
  recordsAre: RecordsAre
}

/** A field as the picker shows it: its name and its engine type (the word is `FIELD_WORD`). */
export interface SourceField {
  name: string
  type: PropertyType
}

export type SourceEntry =
  | Extract<SlashEntry, { kind: 'group' | 'row' }>
  /** The board's `G(' ')` — a hairline rule between the fits group and `all charts`. */
  | { kind: 'separator' }
  /** The board's one segmented control — `records are: pages | rows only`. */
  | { kind: 'seg' }

type RowEntry = Extract<SlashEntry, { kind: 'row' }>

/** The seg's options — the board's `[['pages', true], ['rows only', false]]`. */
export const RECORDS_ARE: readonly { value: RecordsAre; label: string }[] = [
  { value: 'pages', label: 'pages' },
  { value: 'rows', label: 'rows only' },
]

/**
 * Pond's word for a field type — 3a `field`: "text, number, date, money, tag,
 * checkbox, relation, link, image". The engine's `select` and `status` are both a
 * `tag` in the product's words; `rollup` has no glossary word and keeps its own.
 * `Record<PropertyType, …>` so a ninth property type cannot arrive unnamed.
 */
export const FIELD_WORD: Record<PropertyType, string> = {
  text: 'text',
  number: 'number',
  date: 'date',
  select: 'tag',
  status: 'tag',
  checkbox: 'checkbox',
  relation: 'relation',
  rollup: 'rollup',
}

/** `18 records` or `412 rows` — the seg's own distinction, carried by the database. */
export function recordsWord(db: SourceDatabase): string {
  return db.recordsAre === 'pages' ? plural(db.records, 'record') : plural(db.records, 'row')
}

const row = (
  id: string,
  label: string,
  extra: Partial<Omit<RowEntry, 'kind' | 'id' | 'label' | 'pre' | 'hit' | 'post'>> = {}
): RowEntry => ({ kind: 'row', id, label, pre: label, hit: '', post: '', ...extra })

/** The `new` row's id, and the `all charts` row's — the two the picker acts on by name. */
export const NEW_DATABASE_ID = 'new'
export const ALL_CHARTS_ID = 'all'
export const ADD_FIELD_ID = 'add-field'
const kindId = (kind: ChartKind) => `kind:${kind}`

// ── source ─────────────────────────────────────────────────────────────────────

/** Pick or create: `new database — <page>` first, then every database with its count. */
export function sourceEntries(
  databases: readonly SourceDatabase[],
  pageTitle: string
): SourceEntry[] {
  const out: SourceEntry[] = [
    { kind: 'group', label: 'new' },
    row(NEW_DATABASE_ID, `new database — ${pageTitle}`, { icon: ICON.plus }),
  ]
  if (databases.length) {
    out.push({ kind: 'group', label: 'or view an existing one' })
    for (const db of databases)
      out.push(row(db.id, db.title, { icon: ICON.db, hint: recordsWord(db) }))
  }
  return out
}

// ── type ───────────────────────────────────────────────────────────────────────

export interface ChartSuggestion {
  kind: ChartKind
  label: string
  /** The board's `sub`, named from the source's own fields: `kcal by day`. */
  sub: string
  icon: SlashIcon
}

/**
 * The kinds that fit the source's fields — the board's one rule: a date and a
 * number fit `line`, `area + target` and `heatmap` (`pond-charts.js`: weight by
 * date, calories against a target band, one cell a day). No other pairing is
 * drawn, so no other pairing is suggested; `all charts` is always one row away.
 */
export function chartSuggestions(fields: readonly SourceField[] | undefined): {
  fits: PropertyType[]
  rows: ChartSuggestion[]
} {
  const date = fields?.find((f) => f.type === 'date')
  const number = fields?.find((f) => f.type === 'number')
  if (!date || !number) return { fits: [], rows: [] }
  return {
    fits: ['date', 'number'],
    rows: [
      { kind: 'line', label: 'line', sub: `${number.name} by ${date.name}`, icon: ICON.line },
      {
        kind: 'area',
        label: 'area + target',
        sub: `${number.name} against a target`,
        icon: ICON.area,
      },
      { kind: 'heatmap', label: 'heatmap', sub: 'one cell a day', icon: ICON.heat },
    ],
  }
}

/** The three kinds the board draws a mark for; every other kind takes the `chart` mark. */
const KIND_ICON: Partial<Record<ChartKind, SlashIcon>> = {
  line: ICON.line,
  area: ICON.area,
  heatmap: ICON.heat,
}

/** Pick a chart type: the fits group, a rule, `all charts · <n>` — or, expanded, every kind. */
export function typeEntries(
  fields: readonly SourceField[] | undefined,
  expanded: boolean
): SourceEntry[] {
  if (expanded) {
    return [
      { kind: 'group', label: 'all charts' },
      ...CHART_KINDS.map((k) => row(kindId(k), k, { icon: KIND_ICON[k] ?? ICON.chart })),
    ]
  }
  const { fits, rows } = chartSuggestions(fields)
  const out: SourceEntry[] = []
  if (rows.length) {
    out.push({ kind: 'group', label: `fits ${fits.join(' + ')}` })
    for (const s of rows) out.push(row(kindId(s.kind), s.label, { icon: s.icon, sub: s.sub }))
    out.push({ kind: 'separator' })
  }
  out.push(row(ALL_CHARTS_ID, 'all charts', { icon: ICON.chart, hint: String(CHART_KINDS.length) }))
  return out
}

/** The kind a `type` row stands for, or null for `all charts`. */
export function kindOf(rowId: string): ChartKind | null {
  const kind = rowId.startsWith('kind:') ? rowId.slice('kind:'.length) : null
  return kind && (CHART_KINDS as readonly string[]).includes(kind) ? (kind as ChartKind) : null
}

// ── new ────────────────────────────────────────────────────────────────────────

/** Define a new database: its fields, the faint `field` add row, then `records are` and the seg. */
export function newEntries(fields: readonly SourceField[]): SourceEntry[] {
  return [
    { kind: 'group', label: 'fields' },
    ...fields.map((f, i) => row(`field:${i}`, f.name, { hint: FIELD_WORD[f.type] })),
    row(ADD_FIELD_ID, 'field', { icon: ICON.plus, faint: true }),
    { kind: 'group', label: 'records are' },
    { kind: 'seg' },
  ]
}

// ── head and foot ──────────────────────────────────────────────────────────────

/** `/table` · `/chart › calories` · `new database — recipes` — the head per step. */
export function headFor(
  step: SourceStep,
  ctx: { block: SourceBlock; pageTitle: string; source?: string }
): string {
  if (step === 'new') return `new database — ${ctx.pageTitle}`
  return ctx.source ? `/${ctx.block} › ${ctx.source}` : `/${ctx.block}`
}

/**
 * The foot per step — the board's three, verbatim. The board draws `source` with
 * the new row selected; with an existing database under the caret the create
 * legend would lie, so it reads `↵ view` instead. `new` names the view the host
 * page gets (2e: "the page it started on gets the view").
 */
export function footFor(
  step: SourceStep,
  ctx: { block: SourceBlock; newSelected: boolean }
): string[] {
  if (step === 'source') return ctx.newSelected ? ['named after this page', '↵ create'] : ['↵ view']
  if (step === 'type') return ['suggested from the source’s fields']
  return ['filed in databases', `this page gets a ${ctx.block} view`]
}
