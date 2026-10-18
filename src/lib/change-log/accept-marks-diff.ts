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
 * (by id, same rule as blocks) is its own target, `block:<id>:row:<itemId>`; if the
 * block's own non-row fields (label, marker, …) also changed, that is reported too,
 * since no row target speaks for it.
 */

import type { Block } from '@/lib/documents/types'
import type { TodoItem } from '@/lib/modules/todo/schema'
import { jsonEqual } from '@/lib/json-equal'
import { indexById, touchedBlockIds } from './revert-plan'

function indexItemsById(items: TodoItem[]): Map<string, TodoItem> {
  const map = new Map<string, TodoItem>()
  for (const item of items) map.set(item.id, item)
  return map
}

/** Touched item ids, by the same by-id rule as {@link touchedBlockIds}. */
function touchedItemIds(before: TodoItem[], after: TodoItem[]): string[] {
  const beforeById = indexItemsById(before)
  const afterById = indexItemsById(after)
  const ids = new Set<string>([...beforeById.keys(), ...afterById.keys()])
  const touched: string[] = []
  for (const id of ids) {
    if (!jsonEqual(beforeById.get(id) ?? null, afterById.get(id) ?? null)) touched.push(id)
  }
  return touched
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
      targets.push(`block:${blockId}`)
      continue
    }
    if (beforeBlock.type !== 'todo' || afterBlock.type !== 'todo') {
      targets.push(`block:${blockId}`)
      continue
    }
    const itemIds = touchedItemIds(beforeBlock.items, afterBlock.items)
    for (const itemId of itemIds) targets.push(`block:${blockId}:row:${itemId}`)
    const { items: _beforeItems, ...beforeRest } = beforeBlock
    const { items: _afterItems, ...afterRest } = afterBlock
    void _beforeItems
    void _afterItems
    if (!jsonEqual(beforeRest, afterRest)) targets.push(`block:${blockId}`)
  }
  return targets
}
