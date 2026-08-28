import type { Block } from '@/lib/documents/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { resolveSourceRef } from '@/lib/modules/same-batch-refs'

export interface ApplyChangesResult {
  blocks: Block[]
  applied: number
  /** Changes dropped as no-ops: missing target, or data that failed re-validation. */
  skipped: number
}

/**
 * Apply a batch of AI-proposed composition changes to a page's block array (t16 —
 * the generalized Accept path behind the diff-card stack). Pure: the input is never
 * mutated.
 *
 * The AI emits id-less module data; every id is minted here (block-level and
 * nested — branch 2). `after` anchors placement and `changes[]` array order
 * sequences the batch (branch 3); an anchor that no longer exists (e.g. it pointed
 * at a rejected create) falls back to append (branch 6). Each resulting block is
 * re-validated before it lands — a malformed change is skipped, never written
 * (branch 7). `edit` preserves the block's identity and, by default, its position;
 * it may type-morph and may reorder when it carries `after`.
 *
 * Same-batch bindings (ticket-31): a `create` op may carry a batch-local `key`, and a
 * metric in the same batch may bind to it via `source: { ref: <key>, kind }`. Create
 * ids are minted in a FIRST pass so a metric can reference a checklist that appears
 * LATER in the array; then every `source.ref` is resolved to the minted `blockId`
 * (unknown ref → the binding is dropped, metric falls back to manual). What persists
 * is always the ordinary `{ blockId, kind }` form.
 */
export function applyProposedChanges(
  blocks: Block[],
  changes: ModuleChange[],
  mintId: () => string
): ApplyChangesResult {
  let next = [...blocks]
  let applied = 0
  let skipped = 0
  // Same-anchor creates must land in array order, so track how many we've already
  // placed after each anchor and offset the next insert past them (branch 3).
  const placedAfter = new Map<string, number>()

  // First pass: pre-mint one id per create op and build the batch-local key→id map,
  // so a metric can bind (via `source.ref`) to a create that appears later in the
  // array (ticket-31). Ids are consumed in the same order below, so deterministic
  // mintId counters in tests stay predictable.
  const createIds = new Map<ModuleChange, string>()
  const refs = new Map<string, string>()
  for (const change of changes) {
    if (change.op !== 'create') continue
    const id = mintId()
    createIds.set(change, id)
    if (change.key) refs.set(change.key, id)
  }

  const insertAfter = (arr: Block[], block: Block, after?: string): Block[] => {
    if (!after) return [...arr, block]
    const i = arr.findIndex((b) => b.id === after)
    if (i === -1) return [...arr, block] // anchor missing/rejected → append
    const offset = placedAfter.get(after) ?? 0
    placedAfter.set(after, offset + 1)
    const at = i + 1 + offset
    return [...arr.slice(0, at), block, ...arr.slice(at)]
  }

  for (const change of changes) {
    if (change.op === 'remove') {
      if (!next.some((b) => b.id === change.blockId)) {
        skipped++
        continue
      }
      next = next.filter((b) => b.id !== change.blockId)
      applied++
      continue
    }

    if (change.op === 'create') {
      const resolved = resolveSourceRef(change.data, refs)
      const block = hydrateBlock(resolved, createIds.get(change)!, mintId)
      if (!block) {
        skipped++
        continue
      }
      next = insertAfter(next, block, change.after)
      applied++
      continue
    }

    // edit — preserve identity (reuse blockId); optionally type-morph and reorder.
    if (!next.some((b) => b.id === change.blockId)) {
      skipped++
      continue
    }
    // An edit may also introduce a bound metric that refs a same-batch create.
    const block = hydrateBlock(resolveSourceRef(change.data, refs), change.blockId, mintId)
    if (!block) {
      skipped++
      continue
    }
    if (change.after) {
      next = insertAfter(
        next.filter((b) => b.id !== change.blockId),
        block,
        change.after
      )
    } else {
      next = next.map((b) => (b.id === change.blockId ? block : b))
    }
    applied++
  }

  return { blocks: next, applied, skipped }
}
