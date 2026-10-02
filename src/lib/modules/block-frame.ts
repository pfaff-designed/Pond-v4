/**
 * Which board card a persisted block renders in (#237, PondBlock 1/4).
 *
 * `PondBlock.dc.html` draws the block family by KIND — list · checklist · table ·
 * gallery · number · log · properties — each with its own width and a head row
 * (eyebrow + mono note). The registry keys blocks by TYPE (text / todo / table /
 * view / image), so this is the one place a type is read into its board kind. Pure
 * data, no React: the frame component takes the result, the view underneath it is
 * untouched.
 *
 * `null` means the block is BARE — no card. `PondTemplate.dc.html` draws a prose
 * block that way (`bare = k === 'text' && !label` → `padding: 2px 4px`, no card):
 * prose is the page, cards sit on it.
 */
import type { Block } from './content'
import type { ViewMode } from './view/schema'
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
 * frame implements rest · hover · selected · empty (#239) · loading · error ·
 * disabled; `deleted` (the tombstone) is #240 and falls through to rest until its
 * slice lands.
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
 * Whether a persisted block is EMPTY, read off the block alone (#239). A checklist
 * with no items and a table with no rows are; prose and a file never are. A view
 * block is config only — its rows live with the host collection, fetched by the
 * canvas — so it answers `null`: the host decides from the rows it has.
 */
export function blockIsEmpty(block: Block): boolean | null {
  switch (block.type) {
    case 'todo':
      return block.items.length === 0
    case 'table':
      return (block.rows ?? []).length === 0
    case 'view':
      return null
    case 'text':
    case 'image':
      return false
  }
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

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

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
  }
}
