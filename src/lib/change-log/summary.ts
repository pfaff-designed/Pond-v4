/**
 * The short line a record reads as, derived from its own before/after.
 *
 * The boards' rows: "wrote 3 paragraphs · you" and "highlighted a passage"
 * (`Pond 06.17` 6q frame 11), "added schedule table" (`Pond 06.15` 6o frame 8),
 * "added chickpeas, harissa · recipes · you" (6o frame 1). Derived at read time,
 * not stored: the record already carries the diff, and 0011 freezes it, so a
 * line computed from it can never disagree with it.
 *
 * Prose is read through the text module's own `serialize` facet, so a change to
 * how a text block stores its words changes what is counted here with it.
 */

import type { Block } from '@/lib/documents/types'
import { descriptorFor } from '@/lib/modules/registry'
import { blockLabel } from '@/lib/modules/types'
import { jsonEqual, readBlockSnapshot } from './revert-plan'
import type { RowSnapshot } from './types'

const count = (n: number, one: string, many: string = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`

/** Every paragraph of prose on a page — one non-empty line of a text block each. */
const paragraphsOf = (blocks: Block[]): string[] =>
  blocks.flatMap((block) => {
    if (block.type !== 'text') return []
    const prose = descriptorFor(block.type)?.serialize(block) ?? ''
    return prose
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  })

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
const blockName = (block: Block): string => {
  const kind = descriptorFor(block.type)?.label ?? block.type
  const label = blockLabel(block)
  return label ? `${label} ${kind}` : kind
}

const blocksPhrase = (verb: string, blocks: Block[]): string | null => {
  if (blocks.length === 0) return null
  if (blocks.length === 1) return `${verb} ${blockName(blocks[0])}`
  return `${verb} ${count(blocks.length, 'block')}`
}

const prosePhrases = (before: Block[], after: Block[]): string[] => {
  const was = paragraphsOf(before)
  const is = paragraphsOf(after)
  const written = leftOver(is, was).length
  // A paragraph changed in place leaves its old wording behind as well as its new
  // one; only what goes beyond the written count was actually cut.
  const cut = Math.max(0, leftOver(was, is).length - written)
  const phrases: string[] = []
  if (written > 0) phrases.push(`wrote ${count(written, 'paragraph')}`)
  if (cut > 0) phrases.push(`removed ${count(cut, 'paragraph')}`)
  return phrases
}

const otherBlockPhrases = (before: Block[], after: Block[]): string[] => {
  const others = (blocks: Block[]) => blocks.filter((block) => block.type !== 'text')
  const beforeById = new Map(others(before).map((block) => [block.id, block]))
  const afterIds = new Set(others(after).map((block) => block.id))

  const added = others(after).filter((block) => !beforeById.has(block.id))
  const edited = others(after).filter((block) => {
    const was = beforeById.get(block.id)
    return was !== undefined && !jsonEqual(was, block)
  })
  const removed = others(before).filter((block) => !afterIds.has(block.id))

  return [
    blocksPhrase('added', added),
    blocksPhrase('edited', edited),
    blocksPhrase('removed', removed),
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

  const order = (blocks: Block[]) => blocks.map((block) => block.id)
  return jsonEqual(order(before), order(after)) ? null : 'moved a block'
}

const readRowSnapshot = (value: unknown): RowSnapshot | null => {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null
  if (typeof row.values !== 'object' || row.values === null) return null
  return row as unknown as RowSnapshot
}

/** `added chickpeas, harissa`, or `added a row` when it carries no title. */
export const summarizeAddedRow = (afterValue: unknown): string => {
  const title =
    typeof afterValue === 'object' && afterValue !== null
      ? (afterValue as { title?: unknown }).title
      : undefined
  return typeof title === 'string' && title.trim() !== '' ? `added ${title.trim()}` : 'added a row'
}

/** `renamed dal to dal, weeknight` for a title change, `edited dal` for anything else. */
export const summarizeRowEdit = (beforeValue: unknown, afterValue: unknown): string => {
  const before = readRowSnapshot(beforeValue)
  const after = readRowSnapshot(afterValue)
  if (before === null || after === null) return 'edited a row'
  if (before.title !== after.title) {
    return `renamed ${before.title || 'a row'} to ${after.title || 'untitled'}`
  }
  return `edited ${after.title || 'a row'}`
}
