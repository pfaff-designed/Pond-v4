import type { Block } from '@/lib/documents/types'
import { blockSchema } from '@/lib/modules/content'
import type { ModuleChange } from '@/lib/modules/ai-composition'

/**
 * Hydrate AI-emitted module data (id-less, t16 branch 2) into a persistable Block:
 * stamp the block `id`, then mint ids for any nested collection the module owns.
 * Today `todo` items are the only nested-id case — a small, documented special
 * case rather than a per-module hydrate facet (ship flat, refactor when it hurts,
 * t12 §5). The result is validated against `blockSchema`; anything malformed
 * returns `null` so the caller skips it rather than writing corrupt JSONB (branch 7
 * accept-time gate).
 */
function hydrateBlock(data: unknown, id: string, mintId: () => string): Block | null {
  const d = data as Record<string, unknown>
  const withIds: Record<string, unknown> = { ...d, id }
  if (d.type === 'todo' && Array.isArray(d.items)) {
    withIds.items = d.items.map((it) => ({ ...(it as object), id: mintId() }))
  }
  const parsed = blockSchema.safeParse(withIds)
  return parsed.success ? parsed.data : null
}

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
      const block = hydrateBlock(change.data, mintId(), mintId)
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
    const block = hydrateBlock(change.data, change.blockId, mintId)
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
