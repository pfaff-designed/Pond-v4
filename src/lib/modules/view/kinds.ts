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

/**
 * The gantt kind's empty line — `PondTemplate.dc.html`'s `gantt` `e:` value verbatim
 * (#260). Here, beside the kind that owns it, so a host reaches it without pulling in
 * a React module.
 */
export const GANTT_EMPTY_LINE = 'tasks with a start and a due date draw here'

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
   */
  empty: { box: BlockEmptyBox | 'per-mark'; line?: string }
}

export const VIEW_KINDS: Record<ViewMode, ViewKind> = {
  table: { label: 'table', icon: ICON.table, frame: 'table', empty: { box: 'box' } },
  board: { label: 'board', icon: ICON.board, frame: null, empty: { box: 'box' } },
  calendar: { label: 'calendar', icon: ICON.calendar, frame: 'table', empty: { box: 'box' } },
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
