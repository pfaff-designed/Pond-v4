/**
 * The block menu's `turn into` targets — pure, no React, no writes until a
 * table is asked for.
 *
 * Three of the targets are the one line shape drawn three ways:
 *
 *   list       a `todo` block at the `dot` (or `none`) marker — the `/` menu's `list`
 *   checklist  a `todo` block at the `check` marker
 *   text       a `text` block, one line per item
 *
 * so moving between them maps lines to items and back. The block keeps its id
 * (a copied link to it still lands) and its label. Checked state is the one
 * thing a list or text has nowhere to put, so it is dropped going there and only
 * there; list ⇄ checklist otherwise keeps every item byte-for-byte. A text line
 * becomes an item as the words it shows: its list marker, task mark, heading
 * `#`s and emphasis marks go.
 *
 * The fourth, `table`, is a view of a new database, so its `apply` delegates to
 * the list → database writer in `list-to-table.ts`, which reads a text block of
 * list lines. A `todo` list is handed over as exactly those lines.
 *
 * `heading-1`/`heading-2`/`heading-3`/`quote`/`code` are a single-node text
 * block retyped by `retype.ts` (text ⇄ heading ⇄ quote ⇄ code). They are
 * offered only when the block is one of those shapes — a multi-line or list
 * text block gets none of the five, same as it gets no table.
 *
 * Only targets that keep the content are offered: a checklist has no table (its
 * checked state has no column to go to), prose has no table (its lines are not a
 * list), and a block with nothing in it has nothing to keep.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  LIST_LINE,
  createDatabaseFromList,
  listItems,
  plainLine,
  previewListTable,
  type DatabaseFromList,
} from '@/lib/pages/list-to-table'
import type { Block } from './content'
import type { TextBlock } from './text/schema'
import { retypeText, textKindOf, type TextKind } from './text/retype'
import { todoMarker, type TodoBlock, type TodoItem } from './todo/schema'

/** In the menu's order. */
export const CONVERSION_TARGETS = [
  'table',
  'heading-1',
  'heading-2',
  'heading-3',
  'quote',
  'code',
  'list',
  'checklist',
  'text',
] as const
export type ConversionTarget = (typeof CONVERSION_TARGETS)[number]

/** `conversions.ts`'s target ids are dashed (`heading-1`); `retype.ts`'s `TextKind` isn't (`heading1`) — this is their one map. */
const TEXT_KIND_OF_TARGET: Partial<Record<ConversionTarget, TextKind>> = {
  text: 'text',
  'heading-1': 'heading1',
  'heading-2': 'heading2',
  'heading-3': 'heading3',
  quote: 'quote',
  code: 'code',
}

const TARGET_OF_TEXT_KIND: Record<TextKind, LineTarget> = {
  text: 'text',
  heading1: 'heading-1',
  heading2: 'heading-2',
  heading3: 'heading-3',
  quote: 'quote',
  code: 'code',
}

/** Offered only for a single-node text block (never for a multi-node one, and never for a list/table). */
const RETYPE_ONLY_TARGETS = new Set<ConversionTarget>([
  'heading-1',
  'heading-2',
  'heading-3',
  'quote',
  'code',
])

const HEADING_LEVEL_OF_KIND: Partial<Record<TextKind, 1 | 2 | 3>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
}

/** `target`'s heading level, read off the one target↔kind map above — null for
 * every target that isn't a heading (so the menu knows which rows get a chord hint). */
export const headingLevelOf = (target: ConversionTarget): 1 | 2 | 3 | null =>
  HEADING_LEVEL_OF_KIND[TEXT_KIND_OF_TARGET[target] ?? 'text'] ?? null

type LineTarget = Exclude<ConversionTarget, 'table'>

export interface TableConversionInput {
  title: string
  pondId: string | null
}

export interface LineConversion {
  target: LineTarget
  /** Nothing to count: the lines stay the lines. */
  preview: null
  apply: () => Block
}

export interface TableConversion {
  target: 'table'
  /** What will come out, e.g. "3 rows · 2 columns". */
  preview: string
  apply: (
    supabase: SupabaseClient<Database>,
    input: TableConversionInput,
    mintId: () => string
  ) => Promise<DatabaseFromList>
}

export type Conversion = LineConversion | TableConversion

/** The `[ ]` / `[x]` a list line's item may open with. */
const TASK_MARK = /^\[([ xX])\]\s+(.*\S)$/

interface Line {
  label: string
  checked: boolean
}

const kindOf = (block: Block): LineTarget | null => {
  if (block.type === 'text') return TARGET_OF_TEXT_KIND[textKindOf(block.content) ?? 'text']
  if (block.type === 'todo') return todoMarker(block) === 'check' ? 'checklist' : 'list'
  return null
}

const lineOf = (line: string): Line => {
  const item = LIST_LINE.exec(line)?.[1]
  const task = item === undefined ? null : TASK_MARK.exec(item)
  return {
    label: plainLine(task ? task[2] : (item ?? line)),
    checked: task !== null && task[1] !== ' ',
  }
}

const linesOf = (content: string): Line[] =>
  content
    .split('\n')
    .map(lineOf)
    .filter((line) => line.label !== '')

/** One list line per item; the item's meta rides along as the todo serializer writes it. */
const listText = (items: readonly TodoItem[]) =>
  items.map((item) => `- ${item.label}${item.meta ? ` · ${item.meta}` : ''}`).join('\n')

const labelled = (label: string | undefined) => (label === undefined ? {} : { label })

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

const toTodo = (block: TextBlock, marker: 'dot' | 'check', mintId: () => string): TodoBlock => ({
  id: block.id,
  type: 'todo',
  marker,
  ...labelled(block.label),
  items: linesOf(block.content).map((line) => ({
    id: mintId(),
    label: line.label,
    checked: marker === 'check' && line.checked,
  })),
})

const toText = (block: TodoBlock): TextBlock => ({
  id: block.id,
  type: 'text',
  ...labelled(block.label),
  content: listText(block.items),
})

const toMarker = (block: TodoBlock, marker: 'dot' | 'check'): TodoBlock =>
  marker === 'check'
    ? { ...block, marker }
    : { ...block, marker, items: block.items.map((item) => ({ ...item, checked: false })) }

/** The list as the database writer reads it: a text block of list lines, or null when it is not one. */
const tableSource = (block: Block): TextBlock | null => {
  if (block.type === 'text') return listItems(block) ? block : null
  if (block.type !== 'todo' || kindOf(block) !== 'list') return null
  return { id: block.id, type: 'text', content: listText(block.items) }
}

const tableConversion = (block: Block): TableConversion | null => {
  const source = tableSource(block)
  const shape = source ? previewListTable(source) : null
  if (!source || !shape) return null
  return {
    target: 'table',
    preview: `${plural(shape.rows, 'row')} · ${plural(shape.columns, 'column')}`,
    apply: (supabase, { title, pondId }, mintId) =>
      createDatabaseFromList(supabase, { block: source, title, pondId }, mintId),
  }
}

const lineConversion = (
  block: TextBlock | TodoBlock,
  target: LineTarget,
  mintId: () => string
): LineConversion => {
  const line = (apply: () => Block): LineConversion => ({ target, preview: null, apply })
  const kind = TEXT_KIND_OF_TARGET[target]
  if (block.type === 'text' && kind) {
    return line(() => ({ ...block, content: retypeText(block.content, kind) }))
  }
  if (block.type === 'text') {
    return line(() => toTodo(block, target === 'checklist' ? 'check' : 'dot', mintId))
  }
  if (target === 'text') return line(() => toText(block))
  return line(() => toMarker(block, target === 'checklist' ? 'check' : 'dot'))
}

/**
 * The targets `block` can become without losing what it says, in the menu's
 * order, never including what it already is. `mintId` names the items a text
 * block's lines become.
 */
export const conversionsFor = (
  block: Block,
  mintId: () => string = () => crypto.randomUUID()
): Conversion[] => {
  const kind = kindOf(block)
  if (kind === null || (block.type !== 'text' && block.type !== 'todo')) return []
  if (block.type === 'text' && linesOf(block.content).length === 0) return []
  if (block.type === 'todo' && block.items.length === 0) return []

  const singleNode = block.type === 'text' && textKindOf(block.content) !== null

  return CONVERSION_TARGETS.flatMap((target): Conversion[] => {
    if (target === kind) return []
    if (target === 'table') {
      const table = tableConversion(block)
      return table ? [table] : []
    }
    if (RETYPE_ONLY_TARGETS.has(target) && !singleNode) return []
    return [lineConversion(block, target, mintId)]
  })
}
