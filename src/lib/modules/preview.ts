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
 * id-stamping (block-level + nested todo item / table row ids) but skips
 * validation — this block is shown, never written, so a placeholder id is all it
 * needs.
 */
function toPreviewBlock(data: ModuleData): Block {
  const withId = { ...data, id: PREVIEW_ID }
  if (withId.type === 'todo') {
    return {
      ...withId,
      items: withId.items.map((item, i) => ({ ...item, id: `${PREVIEW_ID}-${i}` })),
    } as Block
  }
  if (withId.type === 'table') {
    return {
      ...withId,
      rows: withId.rows.map((row, i) => ({ ...row, id: `${PREVIEW_ID}-${i}` })),
    } as Block
  }
  return withId as Block
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
    return { op: 'create', before: null, after: toPreviewBlock(change.data), reason: change.reason }
  }
  // edit — the block keeps its identity; the proposed data may type-morph.
  return {
    op: 'edit',
    before: blocks.find((b) => b.id === change.blockId) ?? null,
    after: toPreviewBlock(change.data),
    reason: change.reason,
  }
}
