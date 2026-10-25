/**
 * The `/` menu's rows — PRESETS, derived from the module registry (#278).
 *
 * A row is not a module type. `PondPicker.dc.html` draws nineteen rows over eight
 * registered types and they do not line up: `list` and `checklist` are both `todo`
 * at different markers (#219), `gallery` / `chart` / `big number` are all `view` at
 * different modes (ADR 0007), and seven rows name no type at all. So a row is
 * `{ id, group, label, alias, key, icon, type }` plus a factory in
 * {@link mintPreset}, and one type may contribute several rows.
 *
 * The derivation survives, sharpened: **every registered content type reaches the
 * menu through at least one row with no edit here.** Each descriptor contributes
 * a row named by its own `label` (Pond's words — `types.ts`); `VARIANT_ROWS` adds
 * a type's other faces; `WITHHELD` drops a type's plain row when its variants are
 * the whole story (`view`) or when it is structural (`page`). A ninth type appears
 * at merge in the `blocks` group with the fallback mark — that is what made
 * `highlight` (#249) and `entries` (#250) appear for free, and
 * `slash-menu.test.tsx` asserts it over `moduleDescriptors`.
 *
 * `page-link` (KAN-122) is registered but withheld: it is inserted only by
 * `makePage`'s `/ nested page` swap, never picked directly from this menu. There is
 * no `pond — update` block type, so that one has no row at all.
 */

import { moduleDescriptors, type DescriptorType } from '@/lib/modules/registry'
import { ICON, TPL_ICON, type SlashGroup } from '@/components/molecules/slash-entries'
import type { SlashIcon, SlashRow } from '@/components/molecules/SlashMenu'
import type { Block } from '@/lib/documents/types'
import { viewModeSchema, type ViewMode } from '@/lib/modules/view/schema'
import { VIEW_KINDS } from '@/lib/modules/view/kinds'
import { isTextMarkupId, TEXT_MARKUP } from '@/lib/modules/text/markup'

/**
 * Per-type chrome for a descriptor's OWN row. Anything absent takes the fallback.
 * `label` overrides the descriptor's own word when the row needs a different one —
 * `table` the static block's row, so `/table` stays the database view (ADR 0009)
 * and the hand-typed grid reads as `grid`, never alike.
 */
const ROW_CHROME: Partial<
  Record<
    DescriptorType,
    { group: SlashGroup; icon: SlashIcon; key?: string; alias?: string; label?: string }
  >
> = {
  text: { group: 'text', icon: ICON.text },
  highlight: { group: 'text', icon: ICON.quote, key: '"' },
  image: { group: 'text', icon: ICON.file },
  todo: { group: 'blocks', icon: ICON.check, key: '[]', alias: 'todo' },
  table: { group: 'blocks', icon: ICON.table, label: 'grid' },
  entries: { group: 'blocks', icon: ICON.log, alias: 'dated table' },
  // KAN-482: app-over-board, like KAN-462's rows — the board draws no mark for
  // this row. `ICON.list` already reads as "a list of lines", the same shape
  // this block is, and the registry's `highlight`/`quote` pair already shares
  // one mark across two rows, so a second type sharing it is not new.
  toc: { group: 'blocks', icon: ICON.list },
}

/**
 * A `view` row is one view KIND (ADR 0009): its id IS the `ViewMode` it opens in
 * (`mintPreset` parses it with `viewModeSchema`), so a row that names no mode does
 * not compile. Its mark is always the kind's own (`VIEW_KINDS`); its label is too,
 * unless overridden — `list`'s view row takes `'list view'` so `/list` never reads
 * alike the bulleted list (whose own row is `bulleted-list`, label `list`). `table`
 * keeps its view row's label as the kind's own word: `/table` is the database table
 * view (ADR 0009), and the static table block moved to its own `grid` row
 * (`ROW_CHROME.table`) so the two never read alike.
 */
const viewRow = (mode: ViewMode, alias?: string, label?: string): SlashRow & { id: ViewMode } => ({
  id: mode,
  type: 'view',
  group: 'blocks',
  label: label ?? VIEW_KINDS[mode].label,
  ...(alias ? { alias } : {}),
  icon: VIEW_KINDS[mode].icon,
})

const VIEW_ROWS = [
  viewRow('table'),
  viewRow('board', 'kanban'),
  viewRow('calendar'),
  viewRow('list', undefined, 'list view'),
  viewRow('gallery'),
  viewRow('gantt', 'gantt'),
  viewRow('chart', 'graph'),
  viewRow('big-number'),
]

/** A type's other faces — the same block at another marker or mode. */
const VARIANT_ROWS: Partial<Record<DescriptorType, readonly SlashRow[]>> = {
  // `heading` is the `text` block opened on a markdown heading, not a block kind:
  // `PondBlock` and ADR 0007 name none, the descriptor's own words are "prose on a
  // page… notes, explanations, headings", and `Markdown.tsx` already typesets
  // `h1`–`h3`. `Pond 03` 3a's `section` — "a heading and the blocks under it,
  // stored as one group" — is a CONTAINER, which is a different thing and not this
  // row. The level is `##` because a page's own title is its `h1` (the title field
  // in `DocumentPanel`), so the first heading inside a page is the second level;
  // the board's `#` is the key you press, not the level you get.
  text: [
    {
      id: 'heading',
      type: 'text',
      group: 'text',
      label: 'heading',
      key: '#',
      icon: ICON.heading,
    },
    // KAN-462: markup inside the current text block, not new block types — Linear
    // and Notion both list these with their markdown key as the hint.
    { id: 'quote', type: 'text', group: 'text', label: 'quote', key: '>', icon: ICON.quote },
    { id: 'code', type: 'text', group: 'text', label: 'code', key: '```', icon: ICON.code },
    {
      id: 'divider',
      type: 'text',
      group: 'text',
      label: 'divider',
      key: '---',
      icon: ICON.divider,
    },
    {
      id: 'numbered-list',
      type: 'text',
      group: 'text',
      label: 'numbered list',
      key: '1.',
      icon: ICON.numbered,
    },
  ],
  todo: [
    {
      id: 'bulleted-list',
      type: 'todo',
      group: 'blocks',
      label: 'list',
      key: '-',
      icon: ICON.list,
    },
  ],
  view: VIEW_ROWS,
}

/**
 * Types whose plain row is withheld, each with the reason — the
 * `NON_EMITTABLE_MODULES` shape (#261). `slash-menu.test.tsx` asserts every
 * registered type is either reached by a row or named here with a reason, so a
 * type added to this map cannot vanish from the menu unremarked. A type may be
 * both withheld and reached: `view` is, through `VIEW_ROWS`.
 */
export const WITHHELD = {
  page: 'structural — a page is made through the rail or `page from template`, not inserted as a block',
  view: 'wholly covered by its variants — each view kind is its own row (ADR 0009)',
  'page-link':
    "minted only by `makePage`'s `/ nested page` swap (KAN-122), never picked from the menu directly",
} as const satisfies Partial<Record<DescriptorType, string>>

/**
 * The board's row order. A row not placed here (a new type's) still lists — last,
 * in the `blocks` group, with the fallback mark — but `slash-menu.test.tsx` asserts
 * every row is ranked, so it fails loudly there rather than drifting to the end.
 */
export const BOARD_ORDER: readonly string[] = [
  'text',
  'heading',
  'highlight',
  // KAN-462: markup rows, ranked right after `highlight` and ahead of `embed-file`
  // so the app-over-board additions sit together; `numbered-list` is markup in a
  // text block too (not `bulleted-list`'s own `todo` kind), so it stays in this
  // group rather than beside `bulleted-list` in `blocks`.
  'quote',
  'code',
  'divider',
  'numbered-list',
  'embed-file',
  'bulleted-list',
  'checklist',
  'table',
  'grid',
  'board',
  'calendar',
  'list',
  'gallery',
  'gantt',
  'chart',
  'big-number',
  'entry-log',
  // KAN-482: app-over-board, placed right after `entry-log` (the ticket's own
  // order, not a board position — the board draws no row for this type).
  'table-of-contents',
  'page-from-template',
  'page',
]
const GROUP_ORDER: readonly SlashGroup[] = ['text', 'blocks', 'templates', 'pages']

/** A row's id is its board label as a slug: `embed / file` → `embed-file`, `entry log` → `entry-log`. */
const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const ownRows: SlashRow[] = Object.values(moduleDescriptors)
  .filter((d) => !(d.type in WITHHELD))
  .map((d) => {
    const chrome = ROW_CHROME[d.type as DescriptorType] ?? { group: 'blocks', icon: TPL_ICON }
    const label = chrome.label ?? d.label
    return {
      id: slug(label),
      type: d.type,
      group: chrome.group,
      label,
      alias: chrome.alias,
      key: chrome.key,
      icon: chrome.icon,
    }
  })

const templateRow: SlashRow = {
  id: 'page-from-template',
  group: 'templates',
  label: 'page from template',
  icon: TPL_ICON,
  submenu: 'templates',
}

/**
 * One page. It is a page on this page: a link where you typed, and the new page
 * under this one. The blank page shape stays in the templates pane.
 */
const PAGE_ROWS: readonly SlashRow[] = [
  { id: 'page', group: 'pages', label: 'page', icon: ICON.page, placement: 'child' },
]

const rank = (row: SlashRow) => {
  const i = BOARD_ORDER.indexOf(row.id)
  return i === -1 ? BOARD_ORDER.length : i
}
const groupRank = (row: SlashRow) =>
  row.group === undefined ? GROUP_ORDER.length : GROUP_ORDER.indexOf(row.group)

/** Every row of the `/` menu, in the board's groups and order. */
export const slashRows: readonly SlashRow[] = [
  ...ownRows,
  ...Object.values(VARIANT_ROWS).flat(),
  templateRow,
  ...PAGE_ROWS,
].sort((a, b) => groupRank(a) - groupRank(b) || rank(a) - rank(b))

/**
 * The manual-authoring empty state per module: todo = one blank item, table = 2×2,
 * view = a table over the host page's rows, image = the upload affordance,
 * highlight = an empty passage, entries = no rows (the frame's `log` empty state
 * offers `write one`). Returns null for a type with no local empty state — callers
 * must guard null.
 */
export function emptyBlockForType(type: string): Block | null {
  const id = crypto.randomUUID()
  switch (type) {
    case 'text':
      return { id, type: 'text', content: '' }
    case 'todo':
      return {
        id,
        type: 'todo',
        items: [{ id: crypto.randomUUID(), label: '', checked: false }],
      }
    case 'table':
      return {
        id,
        type: 'table',
        columns: ['Column 1', 'Column 2'],
        rows: [
          { id: crypto.randomUUID(), cells: ['', ''] },
          { id: crypto.randomUUID(), cells: ['', ''] },
        ],
      }
    // #19: a view defaults to a table over the host page's own rows (inline). No
    // groupBy/sort/filter yet — the user configures those (or the AI, slice 5).
    case 'view':
      return { id, type: 'view', mode: 'table' }
    // #61: empty url = the authoring state; the view renders the upload
    // affordance until a file lands.
    case 'image':
      return { id, type: 'image', url: '' }
    // #249: empty content = the authoring state; the view shows the board's empty
    // line with no wheat until a passage lands.
    case 'highlight':
      return { id, type: 'highlight', content: '' }
    // #250: no rows = the authoring state. The `log` card's empty state (#239) is the
    // designed one — `no entries yet` / `write one` — and `write one` prepends the
    // first entry through `addEntry`, so nothing is minted blank here.
    case 'entries':
      return { id, type: 'entries', entries: [] }
    // KAN-482: the block stores nothing but its id/type — headings are derived
    // live from the page's own blocks, never minted into the block itself.
    case 'toc':
      return { id, type: 'toc' }
    default:
      return null
  }
}

/**
 * Mint the block a `/` row inserts: the type's empty state, then the preset's own
 * marker or mode on top. Null for a row that inserts no block (`page from
 * template` opens a submenu) and for an unknown id, so a pick degrades to a no-op.
 */
export function mintPreset(rowId: string): Block | null {
  const row = slashRows.find((r) => r.id === rowId)
  if (!row?.type) return null
  const block = emptyBlockForType(row.type)
  if (!block) return null
  if (block.type === 'text' && isTextMarkupId(rowId)) return { ...block, content: TEXT_MARKUP[rowId] }
  if (block.type === 'todo' && rowId === 'bulleted-list') return { ...block, marker: 'dot' }
  if (block.type === 'view') {
    const mode = viewModeSchema.safeParse(rowId)
    return mode.success ? { ...block, mode: mode.data } : block
  }
  return block
}
