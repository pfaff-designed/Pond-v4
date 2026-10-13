/**
 * THE TWELVE premade templates, as DATA (#261, child 228e of #228; ADR 0005).
 *
 * Every definition is transcribed from `PondTemplate.dc.html`'s `T` table — its
 * EMPTY variant, which is what a freshly applied template carries (6f frame 4: "the
 * blocks land with labels and placeholders"). The filled variant is a story fixture,
 * not data (`premade.stories.tsx`). Nothing here renders: a template is a title plus
 * blocks a person could have built by hand, and a template that needed a renderer
 * would be a defect report against the block set, not code to write (ADR 0005).
 *
 * How the board's thirteen kinds read in our vocabulary (ADR 0007, #219, #258, #259,
 * #260): `text` is `text` (bare when unlabelled, a card when labelled); `list` /
 * `check` are `todo` under a marker; `table` is `table` (its `title` IS its label);
 * `entries` and `highlight` are blocks; `kanban · gantt · gallery · number · bars ·
 * heat` are MODES of the `view` block; `props` is not a block at all — it is the
 * page's schema, framed by `propertiesFrame()`, so it lives in `schema` below.
 *
 * Blocks are authored WITHOUT ids — ids are minted at instantiation, exactly as the
 * AI write path mints them (`instantiate.ts` → `hydrateBlock`). A view block is
 * authored with property NAMES, the way `configure_view` proposes one, and
 * `resolveViewConfig` swaps them for the schema's minted ids.
 *
 * Placeholder copy (KAN-103) lives in the block's OWN `placeholder` field — text's,
 * entries' (block-level) and a todo item's — never in `content` / `label` / `text`,
 * which stay empty so the block draws the invitation at ink .68 until a person types
 * (`type, or / for blocks and templates`, `anything, in any order`, `first item`,
 * `what done looks like`, `first update`, `link a page`, `what was said`, `first
 * action`, `done today`). `first record` (database) is a table row fixture, not a placeholder —
 * `table` has no placeholder field, so it stays as content. Where a block already
 * draws the board's exact line for an empty value with no authored copy of its own
 * (`highlight` → `a line worth keeping`, an `entries` row → `write the first entry`)
 * the value stays empty and no `placeholder` is set, so the block's own generic
 * fallback does the work. Seven placeholders the board draws cannot be expressed by a
 * `view` block, which holds no data (#111) — those blocks render their current empty
 * state and are filed as #274, marked `TODO(#274)` below. No head note is persisted
 * anywhere: notes are derived in `blockFrame()`.
 *
 * Code constants, never rows (migration 0016's own comment). `PondTemplate` in
 * `types.ts` is the ROW interface; this is a different type on purpose.
 */
import type { ModuleData } from '@/lib/modules/ai-composition'
import type { ConfigureViewProposal } from '@/lib/pages/configure-view'
import type { AiPropertyDef } from '@/lib/properties/schema'
import type { TemplateKind } from './types'

/**
 * A view block as a template authors it: the block's label plus a name-keyed
 * config in the shape `configure_view` proposes (property NAMES, never ids). No
 * `pageId` (the page does not exist yet) and no `collectionId` (a template's views
 * draw the page's own records).
 */
export type TemplateViewBlock = { type: 'view'; label?: string } & Omit<
  ConfigureViewProposal,
  'pageId' | 'collectionId'
>

/** An id-less block exactly as the AI emits one, with view blocks name-keyed. */
export type TemplateBlock = Exclude<ModuleData, { type: 'view' }> | TemplateViewBlock

export interface PremadeTemplate {
  kind: TemplateKind
  /** The board's empty title — `project name`, `untitled`, … */
  title: string
  /**
   * The page schema the template's blocks need to draw (ids minted at instantiation).
   * `props` derives from it, a board groups by it, a chart reads it. Present on the
   * five templates whose page is a collection; absent means the page is prose.
   */
  schema?: AiPropertyDef[]
  blocks: readonly TemplateBlock[]
}

// ── Shared field shapes, named from the board ──────────────────────────────────

/** The tracker's `log` cols, `['date', 'value']` — also the dashboard's pair. */
const DATE_AND_VALUE: AiPropertyDef[] = [
  { name: 'date', type: 'date' },
  { name: 'value', type: 'number' },
]

/** The board's compact `bars`: the `bar` chart over `value` by `date` (#259). */
const COMPACT_BARS: TemplateViewBlock['chart'] = {
  kind: 'bar',
  xProperty: 'date',
  series: [{ property: 'value', agg: 'sum' }],
  presentation: 'compact',
}

// ── The twelve ─────────────────────────────────────────────────────────────────

export const PREMADE_TEMPLATES: Record<TemplateKind, PremadeTemplate> = {
  page: {
    kind: 'page',
    title: 'untitled',
    blocks: [{ type: 'text', content: '', placeholder: 'type, or / for blocks and templates' }],
  },

  notes: {
    kind: 'notes',
    title: 'notes',
    blocks: [{ type: 'text', content: '', placeholder: 'anything, in any order' }],
  },

  list: {
    kind: 'list',
    title: 'list',
    blocks: [
      {
        type: 'todo',
        marker: 'dot',
        label: 'items',
        items: [{ label: '', checked: false, placeholder: 'first item' }],
      },
    ],
  },

  project: {
    kind: 'project',
    title: 'project name',
    // `props › details` is `status` and `due` on the board; `start` is added so the
    // gantt's own copy — "tasks with a start and a due date draw here" — is true of
    // the page. The three lanes of `tasks — board` are `status`'s options.
    schema: [
      {
        name: 'status',
        type: 'select',
        options: [{ label: 'to do' }, { label: 'doing' }, { label: 'done' }],
      },
      { name: 'start', type: 'date' },
      { name: 'due', type: 'date' },
    ],
    blocks: [
      { type: 'text', label: 'goal', content: '', placeholder: 'what done looks like' },
      // TODO(#274): the board draws a `first task` card in `to do` — a record, which
      // a view cannot carry. Renders the frame's empty state until #246 / #274 rule.
      { type: 'view', mode: 'board', label: 'tasks — board', groupBy: 'status' },
      // Start / end dates are inferred (1st date → start, 2nd → end); the voidBox line
      // is the mode's own (`GANTT_EMPTY_LINE`), so nothing is configured here.
      { type: 'view', mode: 'gantt', label: 'tasks — timeline' },
      {
        type: 'entries',
        label: 'updates',
        entries: [{ date: 'today', text: '' }],
        placeholder: 'first update',
      },
    ],
  },

  tracker: {
    kind: 'tracker',
    title: 'tracker',
    schema: DATE_AND_VALUE,
    blocks: [
      // TODO(#274): board placeholder `—` / `nothing logged yet`; the figure is
      // inferred (first numeric → sum) and renders its empty state until then.
      { type: 'view', mode: 'big-number', label: 'this week' },
      // TODO(#274): board placeholder `the chart draws itself from the log`.
      { type: 'view', mode: 'chart', label: 'by week', chart: COMPACT_BARS },
      {
        type: 'table',
        title: 'log',
        columns: ['date', 'value'],
        rows: [{ cells: ['today', '—'] }],
      },
    ],
  },

  journal: {
    kind: 'journal',
    title: 'journal',
    blocks: [
      // `serif: true` is the journal's (#250 ruling 4). The first entry is left blank so
      // the row draws its own `write the first entry` at placeholder ink.
      { type: 'entries', label: 'entries', serif: true, entries: [{ date: 'today', text: '' }] },
    ],
  },

  collection: {
    kind: 'collection',
    title: 'collection',
    // One field makes the page a collection. The board names none; `field` is its
    // own placeholder word for an unnamed field (the database's `['name', 'field']`).
    schema: [{ name: 'field', type: 'text' }],
    // TODO(#274): the board draws three placeholder record cards — records, which a
    // view cannot carry. Renders `no records yet` until #246 / #274 rule.
    blocks: [{ type: 'view', mode: 'gallery', label: 'records' }],
  },

  database: {
    kind: 'database',
    title: 'database',
    blocks: [
      {
        type: 'table',
        title: 'records',
        columns: ['name', 'field'],
        rows: [{ cells: ['first record', '—'] }],
      },
    ],
  },

  dashboard: {
    kind: 'dashboard',
    title: 'dashboard',
    // The board names no field (`pick a field`, `pick a source`): the tracker's pair
    // is the smallest that lets both the figure and the by-week strip read.
    schema: DATE_AND_VALUE,
    blocks: [
      // TODO(#274): board placeholder `—` / `pick a field`.
      { type: 'view', mode: 'big-number', label: 'figure' },
      // TODO(#274): board placeholder `pick a source`.
      { type: 'view', mode: 'chart', label: 'chart', chart: COMPACT_BARS },
      {
        type: 'todo',
        marker: 'none',
        label: 'pages',
        items: [{ label: '', checked: false, placeholder: 'link a page' }],
      },
    ],
  },

  'meeting notes': {
    kind: 'meeting notes',
    title: 'meeting',
    schema: [
      { name: 'date', type: 'date' },
      { name: 'with', type: 'text' },
    ],
    blocks: [
      { type: 'text', label: 'notes', content: '', placeholder: 'what was said' },
      {
        type: 'todo',
        marker: 'check',
        label: 'actions',
        items: [{ label: '', checked: false, placeholder: 'first action' }],
      },
    ],
  },

  'reading list': {
    kind: 'reading list',
    title: 'reading list',
    blocks: [
      {
        type: 'table',
        title: 'books',
        columns: ['title', 'author', 'status'],
        rows: [{ cells: ['first book', '—', '—'] }],
      },
      // Empty content: the block draws `a line worth keeping` itself, with no wheat.
      { type: 'highlight', label: 'kept', content: '' },
    ],
  },

  habit: {
    kind: 'habit',
    title: 'habit',
    // A kept day is a record with a date: the heat grid reads the days, the figure
    // counts them.
    schema: [{ name: 'date', type: 'date' }],
    blocks: [
      // TODO(#274): board placeholder `0 days` / `starts with the first tick`.
      { type: 'view', mode: 'big-number', label: 'streak' },
      // The board's compact `heat`: the `heatmap` chart counting records by `date`
      // (#259). Empty, the grid draws itself — 84 cells at ink .07 — as the board does.
      {
        type: 'view',
        mode: 'chart',
        label: 'every day',
        chart: {
          kind: 'heatmap',
          xProperty: 'date',
          series: [{ property: 'date', agg: 'count' }],
          presentation: 'compact',
        },
      },
      {
        type: 'todo',
        marker: 'check',
        label: 'today',
        items: [{ label: '', checked: false, placeholder: 'done today' }],
      },
    ],
  },
}

/**
 * The page meta line (`PondTemplate.dc.html`'s `metaText`): `from template · <kind>`
 * on the empty variant, the kind alone once used. The kind is already expanded
 * (`meeting notes`, `reading list`) because `TemplateKind` is.
 */
export function templateMetaLine(kind: TemplateKind, filled: boolean): string {
  return filled ? kind : `from template · ${kind}`
}
