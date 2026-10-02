/**
 * Which board card a persisted block renders in (#237, PondBlock 1/4).
 *
 * `PondBlock.dc.html` draws the block family by KIND — list · checklist · table ·
 * gallery · number · log · properties — each with its own width and a head row
 * (eyebrow + mono note). The registry keys blocks by TYPE (text / todo / table /
 * view / image / highlight / entries), so this is the one place a type is read into
 * its board kind. Pure data, no React: the frame component takes the result, the
 * view underneath it is untouched.
 *
 * `null` means the block is BARE — no card. `PondTemplate.dc.html` draws a prose
 * block that way (`bare = k === 'text' && !label` → `padding: 2px 4px`, no card):
 * prose is the page, cards sit on it.
 */
import type { Block } from './content'
import type { TodoBlock } from './todo/schema'
import type { TableBlock } from './table/schema'
import type { EntriesBlock } from './entries/schema'
import type { ViewBlock, ViewMode } from './view/schema'
import { isImageMediaType, mediaTypeForFilename } from '@/lib/attachments/validate'

export const POND_BLOCK_KINDS = [
  'list',
  'checklist',
  'table',
  'gallery',
  'number',
  'log',
  'properties',
] as const
export type PondBlockKind = (typeof POND_BLOCK_KINDS)[number]

/**
 * The board's `state` enum, verbatim and in its order (#238, PondBlock 2/4). The
 * frame implements all eight: rest · hover · selected · empty (#239) · loading ·
 * error · deleted (#240, the tombstone) · disabled.
 */
export const POND_BLOCK_STATES = [
  'rest',
  'hover',
  'selected',
  'empty',
  'loading',
  'error',
  'deleted',
  'disabled',
] as const
export type PondBlockState = (typeof POND_BLOCK_STATES)[number]

/**
 * The board's `R` map: on `hover` the CARD does not change — exactly one child row
 * goes into the molecule's `hover` state, at this index. `number` has no rows.
 * (`gallery` indexes its record-cards.)
 */
export const POND_BLOCK_HOVER_ROW: Record<PondBlockKind, number | null> = {
  list: 1,
  checklist: 1,
  table: 0,
  log: 0,
  properties: 0,
  gallery: 0,
  number: null,
}

/**
 * The molecule state for the row (or gallery record-card) at `index` under a frame
 * `state` — the board's two row rules, pure so a body can paint them without the
 * frame handing anything down:
 *
 *   hover     the row at `POND_BLOCK_HOVER_ROW[kind]` → `hover`
 *   selected  gallery's record-card 1 → `selected`
 *   else      `rest`
 */
export function blockRowState(
  kind: PondBlockKind,
  state: PondBlockState,
  index: number
): 'rest' | 'hover' | 'selected' {
  if (state === 'hover' && POND_BLOCK_HOVER_ROW[kind] === index) return 'hover'
  if (state === 'selected' && kind === 'gallery' && index === 1) return 'selected'
  return 'rest'
}

/**
 * The board's `EL` table (#239, PondBlock 3/4): the empty line and the offered
 * action per kind, LOWERCASE as authored. One row is generalised: the board reads
 * `no recipes yet` for gallery because its example collection is recipes — fixture
 * copy, so it takes the board's own shape (`records`). Every other row is literal.
 */
export interface BlockEmptyCopy {
  line: string
  action: string
}
export const POND_BLOCK_EMPTY: Record<PondBlockKind, BlockEmptyCopy> = {
  list: { line: 'nothing due', action: 'add an item' },
  checklist: { line: 'no steps yet', action: 'add a step' },
  table: { line: 'no rows yet', action: 'add a row' },
  gallery: { line: 'no records yet', action: 'add a record' },
  number: { line: 'no values this week', action: 'pick a field' },
  log: { line: 'no entries yet', action: 'write one' },
  properties: { line: 'no fields yet', action: 'add a field' },
}

export function blockEmptyCopy(kind: PondBlockKind): BlockEmptyCopy {
  return POND_BLOCK_EMPTY[kind]
}

/**
 * The one empty line no board row covers (#239 review): a view whose FILTER matches
 * nothing over a collection that has rows. `no rows yet` would be false there — the
 * rows exist — so the frame says what is true, lowercase in the product's voice,
 * and offers no action: clearing a filter is not wired through the frame, and a
 * dead button is never drawn.
 */
export const POND_BLOCK_FILTERED_EMPTY_LINE = 'nothing matches this filter'

/**
 * Whether a kind's offered empty action has an engine path a host can wire it to.
 * Every row kind's action is an INSERT (`add a row`, `add a step`…) that lands on
 * the module's own add path. `number`'s `pick a field` is a configuration step with
 * no engine path yet (#246), so its line renders alone — offered, never faked.
 * Keyed by KIND, not view mode: a new mode mapping to `number` inherits the rule.
 */
export const POND_BLOCK_EMPTY_ACTION_WIRED: Record<PondBlockKind, boolean> = {
  list: true,
  checklist: true,
  table: true,
  gallery: true,
  number: false,
  log: true,
  properties: true,
}

/**
 * Whether a persisted block is EMPTY, read off the block alone (#239). A checklist
 * with no items, a table with no rows and a log with no entries are. Only the block
 * types that carry their own rows can answer — a view block is config only (its rows
 * live with the host collection, fetched by the canvas), and prose and a file are
 * never empty — so the parameter is narrowed to the three that can, and the switch
 * stays exhaustive over that union: a new row-carrying type is a compile error here,
 * not a silent `false`.
 */
export function blockIsEmpty(block: TodoBlock | TableBlock | EntriesBlock): boolean {
  switch (block.type) {
    case 'todo':
      return block.items.length === 0
    case 'table':
      return (block.rows ?? []).length === 0
    case 'entries':
      return block.entries.length === 0
  }
}

/**
 * The tombstone (#240, PondBlock 4/4): `W = tombed ? 460 : W[kind]`. The ONE state
 * that overrides the kind's width, and it is a single number, not a per-kind map —
 * a deleted database leaves the same stone wherever a view of it stood, so a gallery
 * tombstone narrows 580 -> 460 like every other kind. (Do NOT cite `Pond 07 Edges`
 * 7a's "keeps its place and size class" for this: that caption argues the opposite,
 * and `PondBlock.dc.html`'s literal is what rules here.) The head keeps the kind's
 * heading and swaps only its note (`H = [H0[0], 'database deleted']`).
 */
export const POND_BLOCK_TOMB_WIDTH = 460
export const POND_BLOCK_TOMB_NOTE = 'database deleted'

/**
 * The board's fixture date and window for `tombLine`. On-screen numbers are
 * fixtures (7h); the real `deleted_at` and the trash window are #199's — a host
 * passes them through the frame's props and these are only the defaults.
 */
export const POND_BLOCK_TOMB_FIXTURE = { deletedOn: '22 sep', restoreWindow: '30 days' } as const

/**
 * The board's `tombLine`, verbatim — a real sentence (capital, full stop), unlike
 * the lowercase empty copy. `name` is `H0[0]`: what the view SHOWED, which for a
 * view block is the database (7a: "kitchen costs was deleted"), not the view's mode.
 */
export function blockTombLine(
  name: string,
  deletedOn: string = POND_BLOCK_TOMB_FIXTURE.deletedOn,
  restoreWindow: string = POND_BLOCK_TOMB_FIXTURE.restoreWindow
): string {
  return `This view showed ${name}, which was deleted on ${deletedOn}. It can be restored for ${restoreWindow}.`
}

/** The board's `W` map, verbatim. Mobile's 360 is a later slice. */
export const POND_BLOCK_WIDTHS: Record<PondBlockKind, number> = {
  list: 400,
  checklist: 400,
  table: 500,
  gallery: 580,
  number: 400,
  log: 460,
  properties: 400,
}

/**
 * The board's `skel` per kind (#238), as `[width, height]` literal class pairs
 * (Tailwind needs the literals in source). `sk(w, h = 10)`:
 *   number  → sk('60%', 52), sk('40%')
 *   gallery → sk('100%', 120), sk('50%')
 *   else    → sk('82%'), sk('64%'), sk('74%')
 */
export type SkeletonBar = readonly [width: string, height: string]
const TEN_BARS: readonly SkeletonBar[] = [
  ['w-[82%]', 'h-[10px]'],
  ['w-[64%]', 'h-[10px]'],
  ['w-[74%]', 'h-[10px]'],
]
export const POND_BLOCK_SKELETON: Record<PondBlockKind, readonly SkeletonBar[]> = {
  list: TEN_BARS,
  checklist: TEN_BARS,
  table: TEN_BARS,
  log: TEN_BARS,
  properties: TEN_BARS,
  number: [
    ['w-[60%]', 'h-[52px]'],
    ['w-[40%]', 'h-[10px]'],
  ],
  gallery: [
    ['w-full', 'h-[120px]'],
    ['w-[50%]', 'h-[10px]'],
  ],
}

/**
 * The board's row stack gap per kind — `gap: 0` for table (its rows draw their own
 * rule), 2 for everything else. Literal class strings so Tailwind sees them; the
 * skeleton and a demo body both read this one table.
 */
export const POND_BLOCK_ROW_GAP: Record<PondBlockKind, string> = {
  list: 'gap-[2px]',
  checklist: 'gap-[2px]',
  table: 'gap-0',
  gallery: 'gap-[2px]',
  number: 'gap-[2px]',
  log: 'gap-[2px]',
  properties: 'gap-[2px]',
}

/** The board's `errLine` per kind, verbatim — curly apostrophes (U+2019) included. */
const SHEET_ERROR = 'pond can’t reach this sheet any more · showing the last copy'
const BLOCK_ERROR = 'this block couldn’t load'
export const POND_BLOCK_ERROR_LINE: Record<PondBlockKind, string> = {
  list: BLOCK_ERROR,
  checklist: BLOCK_ERROR,
  table: SHEET_ERROR,
  gallery: SHEET_ERROR,
  number: SHEET_ERROR,
  log: BLOCK_ERROR,
  properties: BLOCK_ERROR,
}

export function blockErrorLine(kind: PondBlockKind): string {
  return POND_BLOCK_ERROR_LINE[kind]
}

export interface BlockFrame {
  kind: PondBlockKind
  /** The eyebrow — the block's own name when it has one, else its kind. */
  heading: string
  /** The mono note on the right of the head row; '' renders an empty slot (the board's `number`). */
  headNote: string
}

/** A view block draws a database; its card is the board kind of its render mode. */
const VIEW_KIND: Record<ViewMode, PondBlockKind> = {
  table: 'table',
  board: 'table',
  calendar: 'table',
  gantt: 'table',
  chart: 'table',
  gallery: 'gallery',
  'big-number': 'number',
}

const VIEW_HEADING: Record<ViewMode, string> = {
  table: 'table',
  board: 'board',
  calendar: 'calendar',
  gantt: 'gantt',
  chart: 'chart',
  gallery: 'gallery',
  'big-number': 'big number',
}

// `many` is explicit for an irregular plural (`entry` → `entries`), so every head
// note in this file goes through one idiom instead of hand-rolling the next one.
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Which collection a view block draws: a LINKED view names another collection
 * (`collectionId`, #41); otherwise it draws its HOST page's own rows. One helper so
 * the canvas (deciding emptiness) and the view (drawing) can never read different
 * collections. `undefined` when there is neither — a view outside a page host.
 */
export function viewCollectionId(block: ViewBlock, pageId: string | undefined): string | undefined {
  return block.collectionId ?? pageId
}

export function blockFrame(block: Block): BlockFrame | null {
  switch (block.type) {
    case 'text':
      return null
    case 'todo': {
      const done = block.items.filter((it) => it.checked).length
      return {
        kind: 'checklist',
        heading: 'checklist',
        headNote: `${done} of ${block.items.length}`,
      }
    }
    case 'table':
      return {
        kind: 'table',
        heading: block.title?.trim() || 'table',
        headNote: plural((block.rows ?? []).length, 'row'),
      }
    case 'view':
      // The row count lives with the rows, which the view fetches itself — the
      // frame can't name it from config alone, so the note stays empty here.
      return { kind: VIEW_KIND[block.mode], heading: VIEW_HEADING[block.mode], headNote: '' }
    case 'image': {
      const mediaType = block.mediaType ?? mediaTypeForFilename(block.url) ?? ''
      return {
        kind: 'list',
        heading: isImageMediaType(mediaType) ? 'image' : 'file',
        headNote: block.filename ?? '',
      }
    }
    case 'highlight':
      // #249: `PondBlock.dc.html` has no highlight kind and `PondTemplate.dc.html`
      // gives the block no width of its own — it sits in the normal block card with
      // the standard head row (the reading list labels it `kept`). So the default
      // 400 card, as image. The board's template LABEL is template data (228e), not
      // this block's: the eyebrow is the kind until templates carry labels. No note:
      // the board draws none for it.
      return { kind: 'list', heading: 'highlight', headNote: '' }
    case 'entries': {
      // #250: `PondBlock.dc.html`'s `log` kind (460) is a stack of `{ meta: date,
      // title: prose }` rows — exactly a dated log — so this is the first block to
      // reach that card, and `POND_BLOCK_EMPTY.log` (`no entries yet` / `write one`)
      // becomes live with it. The board's `log` heading is `entry log` and its note
      // `cooked 3 times`, both fixtures of the demo recipe; the eyebrow is the kind
      // (as highlight — the template LABEL `updates` / `entries` is 228e's data) and
      // the note is the true count.
      return {
        kind: 'log',
        heading: 'entries',
        headNote: plural(block.entries.length, 'entry', 'entries'),
      }
    }
  }
}
