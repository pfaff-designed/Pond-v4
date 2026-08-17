/**
 * Hydrate AI-emitted module data into a persistable Block — the single source for
 * the id-minting + validation step shared by BOTH the propose_changes accept path
 * (pages/edits.applyProposedChanges) and the create_page accept path
 * (pages/create-page.createPageFromProposal).
 *
 * The AI never mints ids (t16 branch 2): every id — block-level AND nested (`todo`
 * items and `table` rows are the nested-id cases, small documented special cases
 * rather than a per-module hydrate facet — ship flat, refactor when it hurts,
 * t12 §5) — is stamped here from the injected `mintId`. The result is re-validated against
 * `blockSchema`; anything malformed returns `null` so the caller skips it rather
 * than writing corrupt JSONB (branch 7 accept-time gate).
 *
 * Server-safe: pure Zod + data, no React.
 */
import type { Block } from '@/lib/documents/types'
import { blockSchema } from '@/lib/modules/content'

/** Hydrate one id-less block: stamp its id, mint any nested ids, and validate. */
export function hydrateBlock(data: unknown, id: string, mintId: () => string): Block | null {
  const d = data as Record<string, unknown>
  const withIds: Record<string, unknown> = { ...d, id }
  if (d.type === 'todo' && Array.isArray(d.items)) {
    withIds.items = d.items.map((it) => ({ ...(it as object), id: mintId() }))
  }
  if (d.type === 'table' && Array.isArray(d.rows)) {
    withIds.rows = d.rows.map((r) => ({ ...(r as object), id: mintId() }))
  }
  const parsed = blockSchema.safeParse(withIds)
  return parsed.success ? parsed.data : null
}
