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
import { resolveDescriptor } from '@/lib/modules/registry'

/** Hydrate one id-less block: stamp its id, mint any nested ids, and validate. */
export function hydrateBlock(data: unknown, id: string, mintId: () => string): Block | null {
  const d = data as Record<string, unknown>
  const withIds: Record<string, unknown> = { ...d, id }
  for (const path of resolveDescriptor(d.type as string).nestedIdPaths) {
    mintNestedIds(withIds, path, () => mintId())
  }
  const parsed = blockSchema.safeParse(withIds)
  return parsed.success ? parsed.data : null
}

/**
 * Mint an `id` on every element of the array reached by `path` — a top-level field
 * (`'columns'`) or one dotted deep segment (`'columns.cards'`, walking each column's
 * `cards`, ticket-35). `next(index)` supplies each fresh id. Mutates `root` in
 * place; a missing or non-array target is skipped (the schema re-validation in
 * `hydrateBlock` catches a real omission). A module declaring BOTH a parent and its
 * deep child (`['columns', 'columns.cards']`) walks the parent first, so the deep
 * pass sees the already-id'd columns. Shares its deep-path shape with `preview.ts`'s
 * display stamp — one convention, two id sources (minted uuid here, deterministic
 * `${base}-${i}` there).
 */
export function mintNestedIds(
  root: Record<string, unknown>,
  path: string,
  next: (index: number) => string
): void {
  const dot = path.indexOf('.')
  if (dot === -1) {
    const collection = root[path]
    if (Array.isArray(collection)) {
      root[path] = collection.map((el, i) => ({ ...(el as object), id: next(i) }))
    }
    return
  }
  const parent = root[path.slice(0, dot)]
  if (!Array.isArray(parent)) return
  const nested = path.slice(dot + 1)
  root[path.slice(0, dot)] = parent.map((el) => {
    const clone = { ...(el as Record<string, unknown>) }
    mintNestedIds(clone, nested, next)
    return clone
  })
}
