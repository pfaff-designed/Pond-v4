/**
 * The view KINDS (ADR 0009) — each kind of view is its own block to the person: its
 * own name, mark, card and empty state. One table, exhaustive over `ViewMode`, so an
 * added mode is a compile error until it says all four.
 *
 * The stored block is the one `view` carrier keyed by `mode`; a kind is this table
 * and the `/` row read from it, so every stored `{ type: 'view', mode }` reads as its
 * kind with no migration.
 *
 * A person cannot change a view's kind: there is no in-place switch, and the config
 * patch a view writes (`ViewConfigPatch`) has no `mode`. Pond's `configure_view` still
 * rewrites the page's first view block wholesale when a person accepts it.
 *
 * Server-safe, no React: `block-frame.ts`, the `/` rows, the template summary and the
 * proposal card all read it.
 */
import type { ViewBlock, ViewMode } from './schema'
import type { BlockEmptyBox, PondBlockKind } from '../block-frame'
import { ICON, type SlashIcon } from '@/components/molecules/slash-entries'
import type { PropertySchema } from '@/lib/properties/schema'

/**
 * The gantt kind's empty line — `PondTemplate.dc.html`'s `gantt` `e:` value verbatim
 * (#260). Here, beside the kind that owns it, so a host reaches it without pulling in
 * a React module.
 */
export const GANTT_EMPTY_LINE = 'tasks with a start and a due date draw here'

/**
 * The calendar kind's empty line — `PondCalendar.dc.html`'s `emptyLine` verbatim
 * (#262 1/3), shown for every span when nothing in the view can be dated: the
 * collection has no date property, or the view has no records at all (the DC's
 * `empty` state). The calendar draws it inside its own chrome; the block frame's
 * `no rows yet` never stands in for it (`own` below).
 */
export const CALENDAR_EMPTY_LINE =
  'nothing in this view has a date. records show here once they have one.'

/** The board's no-group-by line (KAN-351), shared by its bare notice and its
 *  "add a status field" remedy box so the two read identically. */
export const BOARD_EMPTY_LINE = 'this board needs a status field'

export interface ViewKind {
  /**
   * Pond's word for the kind, lowercase, as a person reads it — the `/` row and the
   * card's eyebrow when the block has no label of its own. `gantt` is **timeline**
   * everywhere a person sees it (7j, 6u.1's `board timeline table calendar list`);
   * the stored mode keeps its build name.
   */
  label: string
  /** The kind's mark on its `/` row, from the picker's hand-drawn `ICON` table. */
  icon: SlashIcon
  /**
   * The `PondBlock.dc.html` card the kind sits in, or `null` when it sets itself on
   * the page without one: the board's lanes lie straight on the page, and the list
   * is a card of its own (a frame around it would be a card inside a card). A chart
   * drawn as the card is frameless too, but that turns on its presentation, not its
   * kind — `blockFrame` asks `isChartCard` for it.
   *
   * #260 confirmed the mapped kinds against the board's `W`: `gallery` is its own 580
   * card and `big-number` the 400 `number` card, while timeline, calendar and the
   * compact chart sit in the 500 `table` card — the block board draws none of them a
   * width of its own.
   */
  frame: PondBlockKind | null
  /**
   * How the kind is empty: which box the frame draws (`PondBlock`'s `emptyBox`, or
   * `PondTemplate`'s `voidBox`), and the line in it when the kind owns one (#260).
   *
   * `chart` is the one kind whose box is not static — a compact `bar` strip is empty
   * as the voidBox, the card is not — so it reads `'per-mark'` and `blockEmptyBox()`
   * asks `compactChartMark`. It carries no `line` because its copy,
   * `CHART_EMPTY_LINE`, lives in the React module `chart/card.tsx`.
   *
   * `own` marks a kind that DRAWS its own empty state, so the frame never takes it
   * over: the calendar's component DC draws its chrome, its grid and its `emptyLine`
   * for zero records (`PondCalendar.dc.html` `state: 'empty'` → `recs = []`), and
   * where it and `PondBlock`'s `no rows yet` disagree the calendar wins (KAN-262,
   * decided 13 oct 2026).
   */
  empty: { box: BlockEmptyBox | 'per-mark'; line?: string; own?: true }
}

export const VIEW_KINDS: Record<ViewMode, ViewKind> = {
  table: { label: 'table', icon: ICON.table, frame: 'table', empty: { box: 'box' } },
  // KAN-351/KAN-377: the board draws its own empty state — its lanes, or, with no
  // group field, its own "add a status field" remedy — so the frame steps aside.
  board: { label: 'board', icon: ICON.board, frame: null, empty: { box: 'box', own: true } },
  calendar: {
    label: 'calendar',
    icon: ICON.calendar,
    frame: 'table',
    empty: { box: 'box', own: true },
  },
  list: { label: 'list', icon: ICON.list, frame: null, empty: { box: 'box' } },
  gallery: { label: 'gallery', icon: ICON.gallery, frame: 'gallery', empty: { box: 'box' } },
  gantt: {
    label: 'timeline',
    icon: ICON.timeline,
    frame: 'table',
    empty: { box: 'void', line: GANTT_EMPTY_LINE },
  },
  chart: { label: 'chart', icon: ICON.chart, frame: 'table', empty: { box: 'per-mark' } },
  'big-number': {
    label: 'big number',
    icon: ICON.number,
    frame: 'number',
    empty: { box: 'box' },
  },
}

/**
 * A view block's kind, read off its stored mode. A persisted mode no longer in
 * `VIEW_MODES` (nothing validates blocks on read, t12 §2) is a table: that is what
 * `CollectionView` draws for it, so its card and copy must say the same.
 */
export function viewKind(block: { mode: ViewMode }): ViewKind {
  return VIEW_KINDS[block.mode] ?? VIEW_KINDS.table
}

/** What a view may rewrite of its own config: anything but which block it is, or its kind. */
export type ViewConfigPatch = Partial<Omit<ViewBlock, 'id' | 'type' | 'mode'>>

/**
 * Which property type a kind needs to draw anything but its own remedy notice
 * (KAN-243's ＋ view gate at creation, carrying KAN-33's validation): a board
 * buckets by a status/select lane (`view.tsx`'s `handleAddStatusField`), calendar
 * and timeline place rows by a date (`handleAddDateField`) — the same two remedies
 * the dateless/groupless empty states already offer. A mode absent from this table
 * draws fine with no properties at all (table, list, gallery, chart, big-number),
 * so {@link hasRequiredField} reads that absence as always satisfied.
 */
export const VIEW_KIND_REQUIREMENT: Partial<Record<ViewMode, 'date' | 'status'>> = {
  board: 'status',
  calendar: 'date',
  gantt: 'date',
}

/**
 * Whether `schema` already carries what `mode` needs ({@link VIEW_KIND_REQUIREMENT}).
 * `'status'` also accepts a `select` property — the same either-or a board already
 * groups by. A mode with no entry needs nothing, so this is always `true` for it.
 */
export function hasRequiredField(mode: ViewMode, schema: PropertySchema): boolean {
  const need = VIEW_KIND_REQUIREMENT[mode]
  if (!need) return true
  return schema.some((d) => d.type === need || (need === 'status' && d.type === 'select'))
}

/**
 * The ＋ view picker's remedy hint for a kind missing its required field —
 * `"add a date field to use calendar"` — built off {@link VIEW_KINDS}'s own label so
 * the two stay in sync: a relabelled kind never leaves a stale noun behind. Only
 * meaningful for a kind in {@link VIEW_KIND_REQUIREMENT}; the caller gates every call
 * behind `!hasRequiredField(mode, schema)`, so a requirement-less mode never reaches it.
 */
export function addViewRemedyLine(mode: ViewMode): string {
  const need = VIEW_KIND_REQUIREMENT[mode]
  if (!need) return ''
  return `add a ${need} field to use ${VIEW_KINDS[mode].label}`
}
