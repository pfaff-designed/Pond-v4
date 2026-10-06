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
 * `null` means the block takes NO block card. Two blocks do: an UNLABELLED text
 * block, which is BARE (`PondTemplate.dc.html`: `bare = k === 'text' && !label` →
 * `padding: 2px 4px`, no card — prose is the page, cards sit on it), and a chart
 * view drawn as the card, which is its OWN card (`PondChart`, #227). A host tells
 * them apart by type: only prose gets the bare padding.
 *
 * The eyebrow is the block's own LABEL when it has one (#258) — the board's
 * `hasEyebrow: !!label`, a property of the block, not of its type — and falls back
 * to the type/mode name when it does not. A labelled text block is therefore an
 * ordinary card (`project → goal`, `meeting → notes`), not bare.
 */
import type { Block } from './content'
import { todoMarker, type TodoBlock, type TodoMarker } from './todo/schema'
import type { TableBlock } from './table/schema'
import type { EntriesBlock } from './entries/schema'
import type { ViewBlock, ViewMode } from './view/schema'
import { COMPACT_MARK_EMPTY, compactChartMark, isChartCard } from './view/chart-compact'
import { blockLabel, trimmedOrNone } from './types'
import { isImageMediaType, mediaTypeForFilename } from '@/lib/attachments/validate'
import type { PropertySchema } from '@/lib/properties/schema'

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
 * Which box the frame's empty state draws (#259). `PondBlock.dc.html` draws ONE,
 * the `emptyBox` (#239); `PondTemplate.dc.html` draws a second for the chart marks
 * that are empty as a hole rather than a line — its `voidBox`:
 *
 *   voidBox { height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center',
 *             borderRadius: 12, boxShadow: `inset 0 0 0 1.4px ${a(.14)}`,
 *             fontFamily: mono, fontSize: 11, color: a(.68) }
 *
 * Only the compact `bars` strip and the `gantt` mode (#260 — the template's
 * `isVoid: true, voidText: v` for an unfilled gantt) are empty as the voidBox; the
 * compact `heat` grid draws its own empty state (84 cells at ink .07) and never
 * hands the frame an empty state at all (`COMPACT_MARK_EMPTY`). Every other block
 * is the board's `emptyBox`. Read off the block alone, like `blockFrame()`.
 */
export type BlockEmptyBox = 'box' | 'void'

/**
 * The gantt mode's empty line — `PondTemplate.dc.html`'s `gantt` `e:` value verbatim
 * (#260). Declared here, with the rest of the per-kind block copy, rather than in the
 * view layer: this file is server-safe, so a host reaches the string without pulling
 * in a React module, and `VIEW_EMPTY` below can hold it beside the box that draws it.
 */
export const GANTT_EMPTY_LINE = 'tasks with a start and a due date draw here'

/**
 * How each view mode is empty: which box the frame draws, and the line that goes in
 * it when the mode owns one (#260). **Exhaustive over `ViewMode`, so an eighth mode
 * is a compile error here** rather than silently inheriting the default box — the
 * defect this file exists to prevent, and the reason `VIEW_KIND` and `VIEW_HEADING`
 * above are tables too.
 *
 * `chart` is the one mode whose box is not static — a compact `bar` is empty as the
 * voidBox and the card presentation is not — so it reads `'per-mark'` and
 * `blockEmptyBox()` asks `compactChartMark`. The marker is in the table rather than a
 * `mode === 'chart'` test outside it so the table never STATES something false about
 * a mode: a caller reading `.box` directly gets `'per-mark'`, not a wrong answer.
 * `chart` carries no `line` for the same reason — its copy is `CHART_EMPTY_LINE`,
 * which lives in the React module `chart/card.tsx` and cannot be reached from here.
 *
 * Both consumers read THIS — `blockEmptyBox()` takes `.box` and `BlockCanvas`'s
 * `useBlockEmptyState` takes `.line`. Before this they each tested `mode === 'gantt'`
 * separately, so one fact about one mode lived in two files keyed off a raw string.
 */
export const VIEW_EMPTY: Record<ViewMode, { box: BlockEmptyBox | 'per-mark'; line?: string }> = {
  table: { box: 'box' },
  board: { box: 'box' },
  calendar: { box: 'box' },
  list: { box: 'box' },
  gallery: { box: 'box' },
  'big-number': { box: 'box' },
  gantt: { box: 'void', line: GANTT_EMPTY_LINE },
  chart: { box: 'per-mark' },
}

export function blockEmptyBox(block: Block): BlockEmptyBox {
  if (block.type !== 'view') return 'box'
  const { box } = VIEW_EMPTY[block.mode]
  if (box !== 'per-mark') return box
  const mark = compactChartMark(block)
  return mark !== null && COMPACT_MARK_EMPTY[mark] === 'void' ? 'void' : 'box'
}

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
 * A view block's frame state, as one rule both hosts read (#261 review — BOTH axes
 * raised it). `BlockCanvas`'s `useBlockEmptyState` had this inline and the template
 * story re-derived it, which is the shape of the defect #239's review caught: a
 * condition removed from one layer and re-derived in another, with nothing
 * connecting the two. There the derivations were over filtered and unfiltered rows
 * and a filtered view silently drew nothing.
 *
 * `rows` is the collection's rows; `processed` is those the view will actually draw
 * (its filter applied). Pure, so it is unit-testable and a story can assert against
 * the same rule the product runs.
 *
 * `chartLine` rather than the string: the compact mark's copy is `CHART_EMPTY_LINE`
 * in `chart/card.tsx`, a React module this server-safe file cannot import — the same
 * reason `VIEW_EMPTY.chart` carries no `line`. The caller substitutes it. Making the
 * boundary explicit beats moving a constant six call sites away for a nicer return.
 */
export type ViewFrameState =
  { state: 'rest' } | { state: 'empty'; line?: string; chartLine?: true; addRow?: true }

export function viewFrameState(
  block: ViewBlock,
  rows: readonly unknown[],
  processed: readonly unknown[],
  frame: BlockFrame | null
): ViewFrameState {
  // #259: the heat grid DRAWS its own empty state — 84 cells at ink .07 — so the
  // frame never takes it over, filtered or not. The bar strip is empty as the
  // board's voidBox, whose line is the chart's own, true whether the rows are
  // missing or carry no number — not the table kind's `no rows yet`.
  const mark = compactChartMark(block)
  const markEmpty = mark === null ? null : COMPACT_MARK_EMPTY[mark]
  if (markEmpty === 'grid') return { state: 'rest' }
  if (rows.length > 0) {
    return processed.length === 0
      ? { state: 'empty', line: POND_BLOCK_FILTERED_EMPTY_LINE }
      : { state: 'rest' }
  }
  if (markEmpty === 'void') return { state: 'empty', chartLine: true }
  // #260: a mode that owns its empty line takes it from `VIEW_EMPTY`, the one table
  // that also decides the mode's box, so the box and the line cannot disagree.
  const modeLine = VIEW_EMPTY[block.mode].line
  if (modeLine !== undefined) return { state: 'empty', line: modeLine }
  // Keyed off the board KIND, not the view mode: a new mode mapping to `number`
  // inherits the no-action rule rather than wiring `addRow` to `pick a field`.
  if (frame && !POND_BLOCK_EMPTY_ACTION_WIRED[frame.kind]) return { state: 'empty' }
  return { state: 'empty', addRow: true }
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

/**
 * The board's `W` map, verbatim. **Superseded for layout by ADR 0008** — blocks now
 * FILL the content column (`PondBlock` renders `w-full`); this is kept only as the
 * board record, not applied. Do not re-wire it into the card width (ADR 0004).
 */
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

/**
 * A `todo` block's card follows its marker (#219): boxes → the board's `checklist`
 * kind; a dot or no marker → its `list` kind (same 400 card, `nothing due` / `add an
 * item`). Exhaustive over `TodoMarker`, so a fourth marker is a compile error here.
 * Exported so the view reads the same kind for its row gap (`POND_BLOCK_ROW_GAP`)
 * rather than mapping the marker a second time.
 */
export const TODO_KIND: Record<TodoMarker, PondBlockKind> = {
  check: 'checklist',
  dot: 'list',
  none: 'list',
}

/**
 * Which molecule row a `todo` item draws under each marker, and how (#219) —
 * `PondTemplate.dc.html`'s `renderVals()`:
 *
 *   hasBox: k === 'check'              →  check  `check-row`
 *   hasDot: k === 'list' && !d.links   →  dot    `list-row`, the ink-.5 dot
 *   fontWeight: d.links ? 500 : 400    →  none   `list-row`, no dot, the raised voice
 *
 * A table, not a chain of `marker === …` booleans in the view: a boolean chain
 * would let a fourth marker compile and silently render a bare `list-row` with no
 * dot and no emphasis. Here it is a compile error — the same rule `blockIsEmpty`
 * states for a new row-carrying type. The head note stays a boolean in
 * `blockFrame()` on purpose: its axis is "has boxes", and a fourth marker
 * inheriting the item count is the right default.
 */
export interface TodoRowSpec {
  row: 'check-row' | 'list-row'
  dot: boolean
  emphasis: boolean
}
export const TODO_ROW: Record<TodoMarker, TodoRowSpec> = {
  check: { row: 'check-row', dot: false, emphasis: false },
  dot: { row: 'list-row', dot: true, emphasis: false },
  none: { row: 'list-row', dot: false, emphasis: true },
}

/**
 * A view block draws a database; its card is the board kind of its render mode.
 * #260 confirmed all three mapped modes against `PondBlock.dc.html`'s `W`: `gallery`
 * is its own 580 card and `big-number` the 400 `number` card, while `gantt` stays
 * in the 500 `table` card — the block board has no gantt kind and `PondTemplate`
 * gives it no width of its own, exactly as `calendar` and `chart`.
 *
 * `board` is absent: its lanes lie straight on the page. `list` is absent: it is a
 * card of its own, and a frame around it would be a card inside a card.
 */
type FramedViewMode = Exclude<ViewMode, 'board' | 'list'>

/**
 * A view that sets itself on the page without the block card: the board's lanes, the
 * list (its own card) and the chart card (`PondChart` draws its own paper). The one
 * predicate the frame and the summary line both read.
 */
export function isFramelessView(block: ViewBlock): boolean {
  return block.mode === 'board' || block.mode === 'list' || isChartCard(block)
}

const VIEW_KIND: Record<FramedViewMode, PondBlockKind> = {
  table: 'table',
  calendar: 'table',
  gantt: 'table',
  chart: 'table',
  gallery: 'gallery',
  'big-number': 'number',
}

const VIEW_HEADING: Record<FramedViewMode, string> = {
  table: 'table',
  calendar: 'calendar',
  gantt: 'gantt',
  chart: 'chart',
  gallery: 'gallery',
  'big-number': 'big number',
}

// `many` is explicit for an irregular plural (`entry` → `entries`), so every head
// note in this file goes through one idiom instead of hand-rolling the next one.
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/**
 * Which collection a view block draws: a LINKED view names another collection
 * (`collectionId`, #41); otherwise it draws its HOST page's own rows. One helper so
 * the canvas (deciding emptiness) and the view (drawing) can never read different
 * collections. `undefined` when there is neither — a view outside a page host.
 */
export function viewCollectionId(block: ViewBlock, pageId: string | undefined): string | undefined {
  return block.collectionId ?? pageId
}

/**
 * The card the page's typed properties sit in (#260). ADR 0007: `PropertyInspector`
 * (#17) IS `PondBlock.dc.html`'s `properties` kind — it renders a page's `_schema`
 * as field-rows and holds no copy — so it is FRAMED, not rebuilt. It is not a block
 * and carries no label, so the eyebrow is the kind's name (the same fallback every
 * unlabelled block takes) and the note is the field count. Unlike `blockFrame()`
 * this also answers the frame's STATE: a schema's emptiness is read off the schema
 * alone, with no rows to fetch, so there is nothing for a host hook to decide.
 */
export function propertiesFrame(schema: PropertySchema): BlockFrame & { state: PondBlockState } {
  const n = schema.length
  const headNote = plural(n, 'field')
  return { kind: 'properties', heading: 'properties', headNote, state: n ? 'rest' : 'empty' }
}

export function blockFrame(block: Block): BlockFrame | null {
  switch (block.type) {
    case 'text': {
      // `bare = k === 'text' && !label`: an UNLABELLED text block is bare at
      // `padding 2px 4px` (#237) — now conditional on the label (#258).
      // A labelled one (`project → goal`, `meeting → notes`) is the `list` card:
      // `PondTemplate.dc.html` gives a text block no width of its own, so — as
      // highlight — it sits in the standard 400 card. No note: none is drawn for prose.
      const label = blockLabel(block)
      return label ? { kind: 'list', heading: label, headNote: '' } : null
    }
    case 'todo': {
      // #219: the card follows the MARKER. A `check` todo is the board's `checklist`
      // (`meeting › actions`, `note: '1 of 2'`); a `dot` / `none` todo is its `list`
      // (`list › items`, `note: '5'`). The note is the count of DONE items only
      // where there are boxes to tick — meaningless on a list, where the board
      // writes the item count instead.
      const marker = todoMarker(block)
      const n = block.items.length
      const done = block.items.filter((it) => it.checked).length
      return {
        kind: TODO_KIND[marker],
        // The eyebrow when the block has no label of its own (#258) is the kind's name.
        heading: blockLabel(block) ?? TODO_KIND[marker],
        headNote: marker === 'check' ? `${done} of ${n}` : `${n}`,
      }
    }
    case 'table':
      // The ONE exception to the shared `label` field (#258): `table`'s existing
      // `title` IS its label — the tracker's `log`, the database's `records`, the
      // reading list's `books`. It is NOT renamed and gets NO second field, because
      // persisted rows carry `title` and a rename needs a migration. So this reads
      // `title` through the same trimmer every label goes through, not a second
      // `trim() ||` of its own. Do not "harmonise" it onto `label`.
      return {
        kind: 'table',
        heading: trimmedOrNone(block.title) ?? 'table',
        headNote: plural((block.rows ?? []).length, 'row'),
      }
    case 'view':
      // #227: a chart drawn as the CARD is `PondChart` — level 3 beside `PondBlock`
      // (`Pond 02` 2o: "charts: blocks that draw a database") — and it draws its
      // own paper, shadow, head and footer. A card inside a card is drawn by no
      // board, so the frame steps aside. The compact marks (#259) are the
      // template's, and keep its card.
      if (isFramelessView(block)) return null
      // The row count lives with the rows, which the view fetches itself — the
      // frame can't name it from config alone, so the note stays empty here.
      return {
        // Every mode `isFramelessView` passes is a `FramedViewMode`.
        kind: VIEW_KIND[block.mode as FramedViewMode],
        heading: blockLabel(block) ?? VIEW_HEADING[block.mode as FramedViewMode],
        headNote: '',
      }
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
      // the standard head row. So the default 400 card, as image. #258: the eyebrow
      // is the block's own persisted LABEL (the reading list's `kept`), falling back
      // to the kind when it has none. No note: the board draws none for it.
      return { kind: 'list', heading: blockLabel(block) ?? 'highlight', headNote: '' }
    case 'entries': {
      // #250: `PondBlock.dc.html`'s `log` kind (460) is a stack of `{ meta: date,
      // title: prose }` rows — exactly a dated log — so this is the first block to
      // reach that card, and `POND_BLOCK_EMPTY.log` (`no entries yet` / `write one`)
      // becomes live with it. The board's `log` heading is `entry log` and its note
      // `cooked 3 times`, both fixtures of the demo recipe. #258: the eyebrow is the
      // block's own persisted LABEL (`updates` in project, `entries` in journal),
      // falling back to the kind; the note is the true count.
      return {
        kind: 'log',
        heading: blockLabel(block) ?? 'entries',
        headNote: plural(block.entries.length, 'entry', 'entries'),
      }
    }
  }
}
