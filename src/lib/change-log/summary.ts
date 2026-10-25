/**
 * The short line a record reads as, derived from its own before/after:
 * "wrote 3 paragraphs", "added schedule table", "added chickpeas, harissa",
 * "electrician → w/c 6 oct". Derived at read time, not stored: the record
 * already carries the diff and is frozen once written, so a line computed from
 * it can never disagree with it.
 *
 * Prose is read through the text module's own `serialize` facet, so a change to
 * how a text block stores its words changes what is counted here with it. A
 * record's values are read as the field showed them when they were written
 * (`RowSnapshot.shown`), so a choice reads as its label, not its stored id.
 */

import type { Block } from '@/lib/documents/types'
import { descriptorFor } from '@/lib/modules/registry'
import { blockLabel } from '@/lib/modules/types'
import type { TableBlock } from '@/lib/modules/table/schema'
import { jsonEqual } from '@/lib/json-equal'
import { HEADING_LINE } from '@/lib/modules/text/heading-line'
import { propertySchemaSchema, type PropertySchema } from '@/lib/properties/schema'
import { readBlockSnapshot } from './revert-plan'
import type { RowSnapshot, TrashSnapshot } from './types'

const count = (n: number, one: string, many: string = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`

/** Every line of prose on a page, split into headings and plain paragraphs — the two are counted apart. */
const paragraphsOf = (blocks: Block[]): { headings: string[]; paragraphs: string[] } => {
  const lines = blocks.flatMap((block) => {
    if (block.type !== 'text') return []
    const prose = descriptorFor(block.type)?.serialize(block) ?? ''
    return prose
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  })
  return {
    headings: lines.filter((line) => HEADING_LINE.test(line)),
    paragraphs: lines.filter((line) => !HEADING_LINE.test(line)),
  }
}

/** The entries of `from` left over once each entry of `minus` has cancelled one match. */
const leftOver = (from: string[], minus: string[]): string[] => {
  const pool = new Map<string, number>()
  for (const entry of minus) pool.set(entry, (pool.get(entry) ?? 0) + 1)
  return from.filter((entry) => {
    const left = pool.get(entry) ?? 0
    if (left === 0) return true
    pool.set(entry, left - 1)
    return false
  })
}

/** `schedule table`, or the kind alone when the block has no label. */
export const blockName = (block: Block): string => {
  const kind = descriptorFor(block.type)?.label ?? block.type
  const label = blockLabel(block)
  return label ? `${label} ${kind}` : kind
}

const blocksPhrase = (verb: string, blocks: Block[]): string | null => {
  if (blocks.length === 0) return null
  if (blocks.length === 1) return `${verb} ${blockName(blocks[0])}`
  return `${verb} ${count(blocks.length, 'block')}`
}

/** `wrote`/`removed` phrases for one line category (headings, or paragraphs). */
const linesPhrases = (noun: string, before: string[], after: string[]): string[] => {
  const written = leftOver(after, before).length
  // A line changed in place leaves its old wording behind as well as its new
  // one; only what goes beyond the written count was actually cut.
  const cut = Math.max(0, leftOver(before, after).length - written)
  const phrases: string[] = []
  if (written > 0) phrases.push(`wrote ${count(written, noun)}`)
  if (cut > 0) phrases.push(`removed ${count(cut, noun)}`)
  return phrases
}

const prosePhrases = (before: Block[], after: Block[]): string[] => {
  const linesBefore = paragraphsOf(before)
  const linesAfter = paragraphsOf(after)
  return [
    ...linesPhrases('heading', linesBefore.headings, linesAfter.headings),
    ...linesPhrases('paragraph', linesBefore.paragraphs, linesAfter.paragraphs),
  ]
}

const EMPTY_MARK = '—'

const shownCell = (cell: string | undefined): string => cell?.trim() || EMPTY_MARK

/**
 * One record of a table, when it is all that changed: `electrician → w/c 6 oct`,
 * `added skip hire`, `removed skip hire`. A table row is named by its first cell.
 * Null for anything wider — columns, caption, more than one record.
 */
const tableRecordPhrase = (before: TableBlock, after: TableBlock): string | null => {
  if (!jsonEqual({ ...before, rows: [] }, { ...after, rows: [] })) return null
  const rowsBefore = new Map(before.rows.map((row) => [row.id, row]))
  const rowsAfter = new Map(after.rows.map((row) => [row.id, row]))
  const changed = after.rows.filter((row) => {
    const previous = rowsBefore.get(row.id)
    return previous !== undefined && !jsonEqual(previous.cells, row.cells)
  })
  const added = after.rows.filter((row) => !rowsBefore.has(row.id))
  const removed = before.rows.filter((row) => !rowsAfter.has(row.id))
  if (changed.length + added.length + removed.length !== 1) return null

  if (added.length === 1) {
    const name = added[0].cells[0]?.trim()
    return name ? `added ${name}` : null
  }
  if (removed.length === 1) {
    const name = removed[0].cells[0]?.trim()
    return name ? `removed ${name}` : null
  }
  const row = changed[0]
  const previousCells = rowsBefore.get(row.id)?.cells ?? []
  const name = previousCells[0]?.trim() || row.cells[0]?.trim()
  if (!name) return null
  const newCells = row.cells
    .filter((cell, i) => cell !== previousCells[i])
    .map((cell) => shownCell(cell))
  return `${name} → ${newCells.join(', ')}`
}

const editedPhrase = (edited: Block[], beforeById: Map<string, Block>): string | null => {
  if (edited.length === 1) {
    const block = edited[0]
    const previous = beforeById.get(block.id)
    if (block.type === 'table' && previous?.type === 'table') {
      const phrase = tableRecordPhrase(previous, block)
      if (phrase) return phrase
    }
  }
  return blocksPhrase('edited', edited)
}

const otherBlockPhrases = (before: Block[], after: Block[]): string[] => {
  const others = (blocks: Block[]) => blocks.filter((block) => block.type !== 'text')
  const beforeById = new Map(others(before).map((block) => [block.id, block]))
  const afterIds = new Set(others(after).map((block) => block.id))

  const added = others(after).filter((block) => !beforeById.has(block.id))
  const edited = others(after).filter((block) => {
    const previous = beforeById.get(block.id)
    return previous !== undefined && !jsonEqual(previous, block)
  })
  const removed = others(before).filter((block) => !afterIds.has(block.id))

  return [
    blocksPhrase('added', added),
    editedPhrase(edited, beforeById),
    blocksPhrase('removed', removed),
  ].filter((phrase): phrase is string => phrase !== null)
}

/** A text block added or removed with no prose in it, which no paragraph count sees. */
const emptyTextPhrases = (before: Block[], after: Block[]): string[] => {
  const texts = (blocks: Block[]) => blocks.filter((block) => block.type === 'text')
  const idsOf = (blocks: Block[]) => new Set(blocks.map((block) => block.id))
  const beforeIds = idsOf(before)
  const afterIds = idsOf(after)
  return [
    blocksPhrase('added', texts(after).filter((block) => !beforeIds.has(block.id))),
    blocksPhrase('removed', texts(before).filter((block) => !afterIds.has(block.id))),
  ].filter((phrase): phrase is string => phrase !== null)
}

/**
 * What a block edit did, e.g. `wrote 3 paragraphs, added schedule table`. Null
 * when either side is not a block snapshot, or when nothing differs.
 */
export const summarizeBlockEdit = (beforeValue: unknown, afterValue: unknown): string | null => {
  const before = readBlockSnapshot(beforeValue)
  const after = readBlockSnapshot(afterValue)
  if (before === null || after === null) return null

  const phrases = [...prosePhrases(before, after), ...otherBlockPhrases(before, after)]
  if (phrases.length > 0) return phrases.join(', ')

  const emptyText = emptyTextPhrases(before, after)
  if (emptyText.length > 0) return emptyText.join(', ')

  const order = (blocks: Block[]) => blocks.map((block) => block.id)
  return jsonEqual(order(before), order(after)) ? null : 'moved a block'
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A `before`/`after` value read back as a row snapshot, or null when it
 *  isn't one — shared with `undo-strike.ts`, which uses the same shape check
 *  to tell a row's removal from every other kind of step. */
export const readRowSnapshot = (value: unknown): RowSnapshot | null => {
  if (!isPlainObject(value)) return null
  const { id, title, values, shown } = value
  if (typeof id !== 'string' || typeof title !== 'string') return null
  if (!isPlainObject(values) || !isPlainObject(shown)) return null
  const shownEntries = Object.entries(shown)
  if (!shownEntries.every(([, text]) => typeof text === 'string')) return null
  return { id, title, values, shown: Object.fromEntries(shownEntries) as Record<string, string> }
}

const recordName = (title: string): string => title.trim() || 'a record'

/** `added chickpeas, harissa`, or `added a record` when it carries no title. */
export const summarizeAddedRow = (afterValue: unknown): string => {
  const record = readRowSnapshot(afterValue)
  return `added ${recordName(record?.title ?? '')}`
}

/** `removed chickpeas, harissa` — the reverse of {@link summarizeAddedRow},
 *  for an undo of an `add_row`. */
export const summarizeRemovedRow = (afterValue: unknown): string => {
  const record = readRowSnapshot(afterValue)
  return `removed ${recordName(record?.title ?? '')}`
}

const fieldText = (record: RowSnapshot, fieldId: string): string => {
  const shown = record.shown[fieldId]
  if (shown !== undefined) return shownCell(shown)
  const value = record.values[fieldId]
  return value === null || value === undefined ? EMPTY_MARK : shownCell(String(value))
}

/**
 * `electrician → w/c 6 oct` when values changed — the record, then each changed
 * field as it now shows — and `renamed dal to dal, weeknight` for a title alone.
 */
export const summarizeRowEdit = (beforeValue: unknown, afterValue: unknown): string => {
  const before = readRowSnapshot(beforeValue)
  const after = readRowSnapshot(afterValue)
  if (before === null || after === null) return 'edited a record'

  const fieldIds = [...new Set([...Object.keys(after.values), ...Object.keys(before.values)])]
  const changedFields = fieldIds.filter(
    (fieldId) => !jsonEqual(before.values[fieldId] ?? null, after.values[fieldId] ?? null)
  )
  if (changedFields.length > 0) {
    const shownValues = changedFields.map((fieldId) => fieldText(after, fieldId))
    return `${recordName(after.title)} → ${shownValues.join(', ')}`
  }
  if (before.title !== after.title) {
    return `renamed ${recordName(before.title)} to ${after.title.trim() || 'untitled'}`
  }
  return 'edited a record'
}

export const readTrashSnapshot = (value: unknown): TrashSnapshot | null => {
  if (!isPlainObject(value)) return null
  const { title, parentId, order, pageIds, blockCount, nestedPageCount, parentPath } = value
  if (typeof title !== 'string') return null
  if (typeof parentId !== 'string' && parentId !== null) return null
  if (typeof order !== 'number') return null
  if (!Array.isArray(pageIds) || !pageIds.every((id) => typeof id === 'string')) return null
  if (typeof blockCount !== 'number' || typeof nestedPageCount !== 'number') return null
  if (!Array.isArray(parentPath) || !parentPath.every((title) => typeof title === 'string')) {
    return null
  }
  return { title, parentId, order, pageIds, blockCount, nestedPageCount, parentPath }
}

/** `deleted old quotes` / `restored old quotes`, or the bare verb when the
 *  snapshot is missing or carries no title. */
export const summarizeTrash = (value: unknown, verb: 'deleted' | 'restored'): string => {
  const title = readTrashSnapshot(value)?.title.trim()
  return title ? `${verb} ${title}` : verb
}

const readPropertySchema = (value: unknown): PropertySchema | null => {
  const parsed = propertySchemaSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * `renamed field field 2 to due` / `deleted field due` / `added field due` —
 * the one def that differs between an `edit_schema` record's before and
 * after (KAN-380: the table header menu's rename and delete each write
 * exactly one). Falls back to a bare verb when either side isn't a well-formed
 * schema, or the diff is wider than a single field.
 */
export const summarizeSchemaEdit = (beforeValue: unknown, afterValue: unknown): string => {
  const before = readPropertySchema(beforeValue)
  const after = readPropertySchema(afterValue)
  if (before === null || after === null) return 'edited the fields'

  const beforeById = new Map(before.map((def) => [def.id, def]))
  const afterById = new Map(after.map((def) => [def.id, def]))
  const added = after.filter((def) => !beforeById.has(def.id))
  const removed = before.filter((def) => !afterById.has(def.id))
  const renamed = after.filter((def) => {
    const prior = beforeById.get(def.id)
    return prior !== undefined && prior.name !== def.name
  })

  if (removed.length === 1 && added.length === 0 && renamed.length === 0) {
    return `deleted field ${removed[0].name}`
  }
  if (added.length === 1 && removed.length === 0 && renamed.length === 0) {
    return `added field ${added[0].name}`
  }
  if (renamed.length === 1 && added.length === 0 && removed.length === 0) {
    return `renamed field ${beforeById.get(renamed[0].id)?.name} to ${renamed[0].name}`
  }
  return 'edited the fields'
}
