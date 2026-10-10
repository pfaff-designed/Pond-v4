import type { Block } from '@/lib/documents/types'
import type { ModuleChange } from '@/lib/modules/ai-composition'
import { hydrateBlock } from '@/lib/modules/hydrate'
import { collectBatchRefIds, resolveSourceRef } from '@/lib/modules/same-batch-refs'

export interface ApplyChangesResult {
  blocks: Block[]
  applied: number
  /** Changes dropped as no-ops: missing target, or data that failed re-validation. */
  skipped: number
  /**
   * Fix-1 (F1a): one short human reason per skipped change, in encounter order —
   * "couldn't place" copy for the proposal card, so an accept that lands nothing
   * says WHY instead of silently succeeding.
   */
  skippedReasons: string[]
}

/** Same-batch binding context (ticket-31) for partial/per-change accepts. */
export interface ApplyChangesOptions {
  /**
   * The FULL proposal batch the accepted `changes` subset came from. Refs are
   * resolved against the whole batch, not just the subset — so accepting the metric
   * and its keyed checklist in separate clicks (either order) still binds them.
   * Defaults to `changes` (an Accept-all is its own batch).
   */
  batch?: readonly ModuleChange[]
  /**
   * Caller-owned cross-call memory of bindKey→minted-id for THIS proposal. MUTATED:
   * newly reserved ids are written back, so a later per-change accept of the keyed
   * create lands it with the id an earlier accept already bound a metric to.
   */
  refIds?: Record<string, string>
  /** bindKeys whose create op the user explicitly REJECTED — excluded from the ref
   *  map so a metric ref'ing one falls back to manual (never dangles). */
  rejectedKeys?: ReadonlySet<string>
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
 * Same-batch bindings (ticket-31): a `create` op may carry a batch-local `bindKey`,
 * and a metric in the same batch may bind to it via `source: { ref: <bindKey>, kind }`.
 * The bindKey→id map is built over the FULL proposal batch (`opts.batch`) by
 * `collectBatchRefIds` — only for creates that pass validation and were not
 * rejected — so a metric can reference a checklist later in the array OR one being
 * accepted in a separate click. Every `source.ref` is then resolved to the mapped
 * `blockId` (unknown ref → the binding is dropped, metric falls back to manual).
 * What persists is always the ordinary `{ blockId, kind }` form — the persisted
 * metric schema rejects a `ref`, so a resolution miss is skipped, never written.
 */
export function applyProposedChanges(
  blocks: Block[],
  changes: ModuleChange[],
  mintId: () => string,
  opts?: ApplyChangesOptions
): ApplyChangesResult {
  let next = [...blocks]
  let applied = 0
  let skipped = 0
  const skippedReasons: string[] = []
  const skip = (reason: string) => {
    skipped++
    skippedReasons.push(reason)
  }
  // Same-anchor creates must land in array order, so track how many we've already
  // placed after each anchor and offset the next insert past them (branch 3).
  const placedAfter = new Map<string, number>()

  // The bindKey→id map over the WHOLE batch (defaults to the accepted subset).
  // Reserved ids are remembered in opts.refIds across per-change accept calls.
  const batch = opts?.batch ?? changes
  const refs = collectBatchRefIds(
    batch.filter((c) => c.op === 'create').map((c) => ({ bindKey: c.bindKey, data: c.data })),
    mintId,
    { refIds: opts?.refIds, rejectedKeys: opts?.rejectedKeys }
  )

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
        skip('the block to remove no longer exists on the page')
        continue
      }
      next = next.filter((b) => b.id !== change.blockId)
      applied++
      continue
    }

    if (change.op === 'create') {
      const resolved = resolveSourceRef(change.data, refs)
      // A keyed create lands with its RESERVED id (possibly bound to by a metric in
      // an earlier accept call); anything else mints inline. A keyed create absent
      // from the map (invalid/rejected) mints a throwaway id and is skipped below.
      const id = (change.bindKey ? refs.get(change.bindKey) : undefined) ?? mintId()
      const block = hydrateBlock(resolved, id, mintId)
      if (!block) {
        skip(`the proposed ${change.data?.type ?? 'block'} failed validation`)
        continue
      }
      next = insertAfter(next, block, change.after)
      applied++
      continue
    }

    // edit — preserve identity (reuse blockId); optionally type-morph and reorder.
    const target = next.find((b) => b.id === change.blockId)
    if (!target) {
      skip('the block to edit no longer exists on the page')
      continue
    }
    // An edit may also introduce a bound metric that refs a same-batch create.
    const hydrated = hydrateBlock(resolveSourceRef(change.data, refs), change.blockId, mintId)
    if (!hydrated) {
      skip(`the edited ${change.data?.type ?? 'block'} failed validation`)
      continue
    }
    // The AI's `data` never carries a `width` (KAN-43: Pond never authors layout),
    // so an edit must keep the block's own width across the swap, or accepting a
    // Pond diff would silently reset the person's layout choice to full.
    const block = target.width !== undefined ? { ...hydrated, width: target.width } : hydrated
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

  return { blocks: next, applied, skipped, skippedReasons }
}
