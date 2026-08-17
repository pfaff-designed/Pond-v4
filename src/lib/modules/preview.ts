/**
 * Diff-card preview blocks for an AI-proposed composition change (t16 Phase 5).
 *
 * The display twin of `applyProposedChanges` (the write path in `pages/edits.ts`).
 * A `ModuleChange` carries id-less module data — the AI never mints ids; the client
 * mints the real ones only on accept. But `ModuleDiffCard` renders id-ful `Block`s,
 * so this turns a change into the `{ before, after }` pair the card needs, stamping
 * a **display-only** placeholder id that is never persisted.
 *
 *   - `create` → before: null,             after: preview(data)
 *   - `edit`   → before: existing block,   after: preview(data)   (may type-morph)
 *   - `remove` → before: existing block,   after: null
 *
 * Pure: `blocks` is only read. Kept separate from the write path so the organism
 * stays thin and the id-stamping is unit-testable in isolation.
 */
import type { Block } from '@/lib/documents/types'
import type { ModuleChange, ModuleData } from './ai-composition'
import { descriptorFor } from './registry'

/** Display-only id on a proposed block. Replaced by a real minted id on accept. */
export const PREVIEW_ID = '__preview__'

export interface ChangePreview {
  op: ModuleChange['op']
  /** Existing block (edit / remove); null for a create. */
  before: Block | null
  /** Proposed block with a placeholder id (create / edit); null for a remove. */
  after: Block | null
  /** Optional one-line note from the model on what changed and why. */
  reason?: string
}

/**
 * Stamp id-less module `data` into a display Block. Mirrors `hydrateBlock`'s
 * id-minting — both walk the module's declared `nestedIdPaths` — but skips
 * validation and stamps deterministic `${base}-${index}` ids: this block is
 * shown, never written, so stable React keys are all it needs. Shared by the
 * diff card (here) and the create-page proposal card.
 */
export function stampDisplayIds(data: ModuleData, base: string): Block {
  const descriptor = descriptorFor(data.type)
  const withIds: Record<string, unknown> = { ...data, id: base }
  for (const path of descriptor?.nestedIdPaths ?? []) {
    const collection = (data as Record<string, unknown>)[path]
    if (Array.isArray(collection)) {
      withIds[path] = collection.map((el, i) => ({ ...(el as object), id: `${base}-${i}` }))
    }
  }
  return withIds as unknown as Block
}

export function previewForChange(change: ModuleChange, blocks: Block[]): ChangePreview {
  if (change.op === 'remove') {
    return {
      op: 'remove',
      before: blocks.find((b) => b.id === change.blockId) ?? null,
      after: null,
      reason: change.reason,
    }
  }
  if (change.op === 'create') {
    return {
      op: 'create',
      before: null,
      after: stampDisplayIds(change.data, PREVIEW_ID),
      reason: change.reason,
    }
  }
  // edit — the block keeps its identity; the proposed data may type-morph.
  return {
    op: 'edit',
    before: blocks.find((b) => b.id === change.blockId) ?? null,
    after: stampDisplayIds(change.data, PREVIEW_ID),
    reason: change.reason,
  }
}
