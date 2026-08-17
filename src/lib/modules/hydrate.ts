/**
 * Hydrate AI-emitted module data into a persistable Block — the single source for
 * the id-minting + validation step shared by BOTH the propose_changes accept path
 * (pages/edits.applyProposedChanges) and the create_page accept path
 * (pages/create-page.createPageFromProposal).
 *
 * The AI never mints ids (t16 branch 2): every id — block-level AND nested — is
 * stamped here from the injected `mintId`. Which fields carry nested ids is the
 * module's declared fact (`descriptor.nestedIdPaths`), not a per-type ladder here.
 * The result is re-validated against `blockSchema`; anything malformed returns
 * `null` so the caller skips it rather than writing corrupt JSONB (branch 7
 * accept-time gate) — including a module whose schema demands nested ids but whose
 * descriptor forgot to declare the path.
 *
 * Server-safe: pure Zod + data, no React.
 */
import type { Block } from '@/lib/documents/types'
import { blockSchema } from '@/lib/modules/content'
import { descriptorFor } from '@/lib/modules/registry'

/** Hydrate one id-less block: stamp its id, mint any nested ids, and validate. */
export function hydrateBlock(data: unknown, id: string, mintId: () => string): Block | null {
  const d = data as Record<string, unknown>
  const descriptor = descriptorFor(d.type as string)
  const withIds: Record<string, unknown> = { ...d, id }
  for (const path of descriptor?.nestedIdPaths ?? []) {
    const collection = d[path]
    if (Array.isArray(collection)) {
      withIds[path] = collection.map((el) => ({ ...(el as object), id: mintId() }))
    }
  }
  const parsed = blockSchema.safeParse(withIds)
  return parsed.success ? parsed.data : null
}
