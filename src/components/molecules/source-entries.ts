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
 * `source-entries.test.ts` holds equal to `PondChart.dc.html`'s `kind` enum); a
 * field's word is `FIELD_WORD` over `PROPERTY_TYPES`; `18 records` / `412 rows`
 * is `plural` over the database's own `recordsAre`. The marks are `ICON`, the
 * board's `I` table (`slash-entries.ts`).
 */

import { CHART_KINDS, type ChartKind } from '@/lib/modules/view/aggregate'
import { CHART_TYPE_TAG } from '@/lib/modules/chart/chrome'
import { plural } from '@/lib/modules/block-frame'
import type { ViewMode } from '@/lib/modules/view/schema'
import { VIEW_KINDS } from '@/lib/modules/view/kinds'
import {
  DEFAULT_STATUS_OPTIONS,
  PROPERTY_TYPES,
  type PropertyOption,
  type PropertyType,
} from '@/lib/properties/schema'

import { BOX_HEIGHT, LIST_MAX_VH, SLASH_SIZES } from './picker-chrome'
import { ICON, type SlashEntry, type SlashIcon } from './slash-entries'

/**
 * The `/` rows that open this picker (`Pond 02` 2e: "table, gallery and chart all
 * open the same picker"; ADR 0009 gives board, calendar and timeline the same
 * route) — each is the `ViewMode` it makes, and each is the `slashRows` id of its
 * row (`lib/modules/palette.ts`), so the host routes a pick here by id with no
 * second table. Every `VIEW_MODES` entry is here: a view with no source is not a
 * view, so `list` and `big-number` route here too (KAN-240, the acceptance bug
 * that let `big-number` insert with none).
 */
export const SOURCE_BLOCKS = [
  'table',
  'board',
  'calendar',
  'list',
  'gallery',
  'gantt',
  'chart',
  'big-number',
] as const satisfies readonly ViewMode[]
export type SourceBlock = (typeof SOURCE_BLOCKS)[number]

/** The picker a `/` row opens, or null for a row that inserts its block directly. */
export function sourceBlockOf(rowId: string): SourceBlock | null {
  return (SOURCE_BLOCKS as readonly string[]).includes(rowId) ? (rowId as SourceBlock) : null
}
export type SourceStep = 'source' | 'type' | 'new' | 'field-type' | 'project'
/** 3a `record`: "either a page of its own or a row only." */
export type RecordsAre = 'pages' | 'rows'

export interface SourceDatabase {
  id: string
  title: string
  /** How many records it holds — the sub `18 records` / `412 rows`. */
  records: number
  recordsAre: RecordsAre
}

/**
 * A field as the picker shows it: its name, its engine type (the word is
 * `FIELD_WORD`) and — for a field that already exists in a database's schema —
 * its **id**. The id is what a chart config names (`xProperty`, `series[].property`
 * are `PropertyDef` ids, `view/chart-data.ts`), so a suggestion that says
 * `kcal by day` can hand the host the two fields it read rather than a kind alone.
 * A field being typed on the `new` step has no id yet; the host mints one.
 */
export interface SourceField {
  id?: string
  name: string
  type: PropertyType
  /**
   * Default option labels for a `select`/`status` field (KAN-351) — no ids yet,
   * the picker hasn't minted any. The host mints one id per option when it
   * commits the field, same as the field's own id.
   */
  options?: readonly { label: string }[]
}

/**
 * The chart a `type` pick commits to: the kind, plus the two fields the suggestion
 * was derived from. **Both ids matter** — `resolveChartConfig` only infers an x
 * axis when there is NO stored config at all, so a config carrying a kind and
 * nothing else silently buckets by record title. Naming the fields is what makes
 * the row's promise (`line · kcal by day`) true of the block it makes.
 */
export interface ChartPick {
  kind: ChartKind
  /** The date field the suggestion read, when there was one. */
  xProperty?: string
  /** The number field the suggestion read, when there was one. */
  yProperty?: string
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
/** The project step's new-option row — never a real option id (minted ids never collide). */
export const NEW_PROJECT_ID = 'new-project'
const kindId = (kind: ChartKind) => `kind:${kind}`

// ── source ─────────────────────────────────────────────────────────────────────

/**
 * Pick or create. A board's one new row reads `tasks` — picking it opens the
 * `project` step (KAN-536: one shared tasks database per pond, each board
 * filtered to a project). Every other block offers `new database — <page>`,
 * then the field step.
 */
export function sourceEntries(
  databases: readonly SourceDatabase[],
  pageTitle: string,
  block?: SourceBlock
): SourceEntry[] {
  const creating = block === 'board' ? 'tasks' : `new database — ${pageTitle}`
  const out: SourceEntry[] = [
    { kind: 'group', label: 'new' },
    row(NEW_DATABASE_ID, creating, { icon: ICON.plus }),
  ]
  if (databases.length) {
    out.push({ kind: 'group', label: 'or view an existing one' })
    for (const db of databases)
      out.push(row(db.id, db.title, { icon: ICON.db, hint: recordsWord(db) }))
  }
  return out
}

/**
 * How tall the glass can get opening on the `source` step — the same role
 * `slashMenuHeight` plays for the `/` menu, for picking which side it opens
 * toward (`sideTowardFreeSpace`) before it renders. The source picker always
 * opens desktop-sized (it hangs off the `/` line, never a mobile row).
 */
export function sourcePickerHeight(
  databases: readonly SourceDatabase[],
  viewportHeight: number
): number {
  const list = sourceEntries(databases, '').reduce(
    (height, e) => height + (e.kind === 'group' ? BOX_HEIGHT.group : SLASH_SIZES.desktop.rowHeight),
    0
  )
  return Math.min(list, viewportHeight * LIST_MAX_VH) + BOX_HEIGHT.foot + BOX_HEIGHT.glass
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
  /** The two fields every suggested kind reads — what a pick must carry (`ChartPick`). */
  axes?: { xProperty?: string; yProperty?: string }
  rows: ChartSuggestion[]
} {
  const date = fields?.find((f) => f.type === 'date')
  const number = fields?.find((f) => f.type === 'number')
  if (!date || !number) return { fits: [], rows: [] }
  return {
    fits: ['date', 'number'],
    axes: { xProperty: date.id, yProperty: number.id },
    rows: [
      {
        kind: 'line',
        label: CHART_LABEL.line,
        sub: `${number.name} by ${date.name}`,
        icon: ICON.line,
      },
      {
        kind: 'area',
        label: CHART_LABEL.area,
        sub: `${number.name} against a target`,
        icon: ICON.area,
      },
      { kind: 'heatmap', label: CHART_LABEL.heatmap, sub: 'one cell a day', icon: ICON.heat },
    ],
  }
}

/**
 * Pond's word for every chart kind, as the PICKER says it. A `ChartKind` is an
 * ENGINE key, never a label: `net` and `composed` are not words the product says.
 * The thirteen words have ONE owner — `CHART_TYPE_TAG` in the chart layer
 * (`lib/modules/chart/chrome.ts`), `pond-charts.js`'s own `type` per kind, which is
 * also what the chart card's type tag renders (#227) — so a kind renamed there is
 * renamed here. The single exception is `area`: this surface's own board
 * (`PondPicker.dc.html`, the `fits` group) calls it `area + target` where the chart
 * card's board calls it `area + reference area`. Two boards, two values, both final
 * (ADR 0003 amendment) — the picker takes the picker's word so the suggested row
 * and the full list agree with each other, and the override is written once, here.
 */
export const CHART_LABEL: Record<ChartKind, string> = {
  ...CHART_TYPE_TAG,
  area: 'area + target',
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
      ...CHART_KINDS.map((k) =>
        row(kindId(k), CHART_LABEL[k], { icon: KIND_ICON[k] ?? ICON.chart })
      ),
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

/**
 * The chart a pick of `kind` commits to, over this source's fields. The SAME rule
 * the suggestions are drawn from, so a kind chosen off `all charts` reads the same
 * two fields a suggested one would — the board puts `all charts` one row from the
 * fits group, not in a different world. A source with no date + number pair yields
 * the kind alone, which is the honest answer: the person chose only a kind.
 */
export function chartPick(kind: ChartKind, fields: readonly SourceField[] | undefined): ChartPick {
  const { axes } = chartSuggestions(fields)
  return {
    kind,
    ...(axes?.xProperty ? { xProperty: axes.xProperty } : {}),
    ...(axes?.yProperty ? { yProperty: axes.yProperty } : {}),
  }
}

/** The kind a `type` row stands for, or null for `all charts`. */
export function kindOf(rowId: string): ChartKind | null {
  const kind = rowId.startsWith('kind:') ? rowId.slice('kind:'.length) : null
  return kind && (CHART_KINDS as readonly string[]).includes(kind) ? (kind as ChartKind) : null
}

// ── new ────────────────────────────────────────────────────────────────────────

/** {@link DEFAULT_STATUS_OPTIONS} as a new field's `options` shape (KAN-351) — shared
 *  by a board's default `status` field and a `status`/`select` field added by hand. */
export const DEFAULT_STATUS_FIELD_OPTIONS: readonly { label: string }[] =
  DEFAULT_STATUS_OPTIONS.map((label) => ({ label }))

/**
 * The fields a new database starts with for a view kind (KAN-351): a calendar or
 * list needs a date to place a record on; a timeline needs both ends; a board
 * needs a group-by lane, so a board starts as tasks: `status` lanes plus done,
 * due, repeats, and assignee. Table and gallery stay fieldless (title only);
 * chart and big-number keep their own flow (KAN-109) — unaffected here.
 */
export function defaultFieldsFor(block: SourceBlock): SourceField[] {
  switch (block) {
    case 'calendar':
    case 'list':
      return [{ name: 'date', type: 'date' }]
    case 'gantt':
      return [
        { name: 'start', type: 'date' },
        { name: 'due', type: 'date' },
      ]
    case 'board':
      return [
        { name: 'status', type: 'status', options: DEFAULT_STATUS_FIELD_OPTIONS },
        { name: 'done', type: 'checkbox' },
        { name: 'due', type: 'date' },
        { name: 'repeats', type: 'text' },
        { name: 'assignee', type: 'text' },
      ]
    case 'table':
    case 'gallery':
    case 'chart':
    case 'big-number':
      return []
  }
}

/** A field's row hint: its options' labels joined, or `FIELD_WORD` when it has none. */
function fieldHint(f: SourceField): string {
  return f.options?.length ? f.options.map((o) => o.label).join(' · ') : FIELD_WORD[f.type]
}

/** Define a new database: its fields, the faint `field` add row, then `records are` and the seg. */
export function newEntries(fields: readonly SourceField[]): SourceEntry[] {
  return [
    { kind: 'group', label: 'fields' },
    ...fields.map((f, i) => row(`field:${i}`, f.name, { hint: fieldHint(f) })),
    row(ADD_FIELD_ID, 'field', { icon: ICON.plus, faint: true }),
    { kind: 'group', label: 'records are' },
    { kind: 'seg' },
  ]
}

/**
 * The `＋ field` row's own step: no board draws a type chooser, so this is the
 * smallest thing the picker's own row recipe can carry — one row per storable
 * type, in `PROPERTY_TYPES` order, id and label both the bare `PropertyType`
 * (not `FIELD_WORD`, which renders `select` and `status` both as `tag` — two
 * indistinguishable rows). `relation` and `rollup` need a target this step
 * cannot supply, so they're left out.
 */
export function fieldTypeEntries(): SourceEntry[] {
  return PROPERTY_TYPES.filter((t) => t !== 'relation' && t !== 'rollup').map((t) => row(t, t))
}

// ── project ────────────────────────────────────────────────────────────────────

/**
 * The `new project — …` row's label: the typed query, trimmed, or the page
 * title (also trimmed) while the query is empty or all whitespace. One home
 * for this so `projectEntries` (the row) and `SourcePicker.tsx`'s `pick()`
 * (the chosen value) never compute two different strings for the same row —
 * a raw, untrimmed query would otherwise mint a blank or trailing-space
 * option (KAN-536).
 */
export function newProjectLabel(pageTitle: string, query: string): string {
  const trimmed = query.trim()
  return trimmed === '' ? pageTitle.trim() : trimmed
}

/**
 * Pick the board's project (KAN-536). `new project — <page title>` leads and
 * is preselected, unless an option already carries that label (case-
 * insensitive, trimmed) — then that option leads instead and no new row
 * shows; the rest of the field's options follow. A query narrows the options
 * by label; matching nothing offers `new project — <query>` in their place —
 * a query that matches something never shows a new row at all. Same recipe
 * as `TagValueEditor.tsx`'s `buildTagRows()`, read for this one-shot step.
 */
export function projectEntries(
  options: readonly PropertyOption[],
  pageTitle: string,
  query: string
): SourceEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') {
    const title = pageTitle.trim().toLowerCase()
    const match = options.find((o) => o.label.trim().toLowerCase() === title)
    if (match)
      return [match, ...options.filter((o) => o.id !== match.id)].map((o) => row(o.id, o.label))
    return [
      row(NEW_PROJECT_ID, `new project — ${newProjectLabel(pageTitle, query)}`),
      ...options.map((o) => row(o.id, o.label)),
    ]
  }
  const matches = options.filter((o) => o.label.toLowerCase().includes(q))
  if (!matches.length)
    return [row(NEW_PROJECT_ID, `new project — ${newProjectLabel(pageTitle, query)}`)]
  return matches.map((o) => row(o.id, o.label))
}

// ── head and foot ──────────────────────────────────────────────────────────────

/** `/table` · `/chart › calories` · `new database — recipes` · `/board — tasks › web` — the head per step. */
export function headFor(
  step: SourceStep,
  ctx: { block: SourceBlock; pageTitle: string; source?: string; query?: string }
): string {
  if (step === 'field-type') return `new database — ${ctx.pageTitle} › field`
  if (step === 'new') return `new database — ${ctx.pageTitle}`
  if (step === 'project') {
    const head = `/${VIEW_KINDS[ctx.block].label} — tasks`
    return ctx.query ? `${head} › ${ctx.query}` : head
  }
  const command = `/${VIEW_KINDS[ctx.block].label}`
  return ctx.source ? `${command} › ${ctx.source}` : command
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
  if (step === 'source') {
    if (!ctx.newSelected) return ['↵ view']
    if (ctx.block === 'board') return ['each task is a page', '↵ create']
    return ['named after this page', '↵ create']
  }
  if (step === 'type') return ['suggested from the source’s fields']
  if (step === 'field-type') return ['added to the new database']
  return ['filed in databases', `this page gets a ${VIEW_KINDS[ctx.block].label} view`]
}
