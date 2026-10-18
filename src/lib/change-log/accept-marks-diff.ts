/**
 * What an accept touches, named at the finest unit the diff has (KAN-143).
 *
 * Built ON `touchedBlockIds` (`revert-plan.ts`) rather than re-diffing blocks: that
 * function already does the by-id, not-by-position comparison this needs, and a
 * second implementation of the same comparison is the duplicate `AGENTS.md` deletes.
 *
 * A touched block is reported as one target, `block:<id>`, UNLESS it is a `todo`
 * block present on both sides — the only row-targeted kind this slice builds (table
 * rows are the split-off child; see the ticket). For a todo block, each touched item
 * is its own target, `block:<id>:row:<itemId>`; if the block's own non-row fields
 * (label, marker, …) also changed, that is reported too, since no row target speaks
 * for it.
 *
 * Item identity is id-first, content-fallback — NOT pure id zipping, despite
 * `touchedBlockIds`' own rule above it. `ai-composition.ts`'s omit-chain strips
 * every item id from what the AI emits, so `hydrateBlock` mints a fresh id for
 * EVERY item on an AI-authored edit, changed or not (`edits.ts`'s edit branch).
 * A pure id zip would then see zero overlap between before/after ids and report
 * every row touched, including ones whose label/checked never changed. So: ids
 * present on both sides are compared directly; the ids left over on each side
 * (added, removed, or — in practice — EVERY id on an AI edit) are paired off by
 * content, and only a leftover with no content match on the other side is
 * touched. Ids that happen to be stable (a person's own edit, this file's own
 * synthetic tests) take the id path and never reach the content fallback.
 */

import type { Block } from '@/lib/documents/types'
import type { TodoItem } from '@/lib/modules/todo/schema'
import { jsonEqual } from '@/lib/json-equal'
import { indexById, touchedBlockIds } from './revert-plan'

/** The mark target string for a block, or one of its rows — the one home for
 *  this format (AGENTS.md "one home per fact"): `block:<id>` or
 *  `block:<id>:row:<rowId>`. */
export function markTarget(blockId: string, rowId?: string): string {
  return rowId === undefined ? `block:${blockId}` : `block:${blockId}:row:${rowId}`
}

function indexItemsById(items: TodoItem[]): Map<string, TodoItem> {
  const map = new Map<string, TodoItem>()
  for (const item of items) map.set(item.id, item)
  return map
}

function sameContent(a: TodoItem, b: TodoItem): boolean {
  const { id: _a, ...restA } = a
  const { id: _b, ...restB } = b
  void _a
  void _b
  return jsonEqual(restA, restB)
}

function touchedItemIds(before: TodoItem[], after: TodoItem[]): string[] {
  const beforeById = indexItemsById(before)
  const afterById = indexItemsById(after)
  const touched = new Set<string>()
  const leftoverBefore: TodoItem[] = []
  const leftoverAfter: TodoItem[] = []

  for (const [id, beforeItem] of beforeById) {
    const afterItem = afterById.get(id)
    if (afterItem === undefined) {
      leftoverBefore.push(beforeItem)
      continue
    }
    if (!jsonEqual(beforeItem, afterItem)) touched.add(id)
  }
  for (const [id, afterItem] of afterById) {
    if (!beforeById.has(id)) leftoverAfter.push(afterItem)
  }

  const unmatchedBefore = [...leftoverBefore]
  for (const afterItem of leftoverAfter) {
    const matchIndex = unmatchedBefore.findIndex((beforeItem) => sameContent(beforeItem, afterItem))
    if (matchIndex === -1) {
      touched.add(afterItem.id)
      continue
    }
    unmatchedBefore.splice(matchIndex, 1)
  }
  for (const beforeItem of unmatchedBefore) touched.add(beforeItem.id)

  return [...touched]
}

/** The mark targets an accepted edit from `before` to `after` leaves. */
export function touchedMarks(before: Block[], after: Block[]): string[] {
  const beforeById = indexById(before)
  const afterById = indexById(after)
  const targets: string[] = []
  for (const blockId of touchedBlockIds(before, after)) {
    const beforeBlock = beforeById.get(blockId)
    const afterBlock = afterById.get(blockId)
    // Added, removed, or changed kind — there is no row data to key against.
    if (beforeBlock === undefined || afterBlock === undefined) {
      targets.push(markTarget(blockId))
      continue
    }
    if (beforeBlock.type !== 'todo' || afterBlock.type !== 'todo') {
      targets.push(markTarget(blockId))
      continue
    }
    const itemIds = touchedItemIds(beforeBlock.items, afterBlock.items)
    for (const itemId of itemIds) targets.push(markTarget(blockId, itemId))
    const { items: _beforeItems, ...beforeRest } = beforeBlock
    const { items: _afterItems, ...afterRest } = afterBlock
    void _beforeItems
    void _afterItems
    if (!jsonEqual(beforeRest, afterRest)) targets.push(markTarget(blockId))
  }
  return targets
}
