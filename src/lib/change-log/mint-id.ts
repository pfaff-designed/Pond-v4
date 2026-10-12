/**
 * A deterministic stand-in for `crypto.randomUUID` for `applyProposedChanges`
 * (KAN-93 fix). `propose.ts` mints a record's `after` at propose time; `accept.ts`
 * mints the SAME batch's blocks again at accept time, independently. Two
 * independent `randomUUID()` calls give a created block two different ids, so the
 * written blocks never equal `record.after` byte-for-byte — and 0021's
 * `set_back` compare-and-swap (which requires `pages.blocks` to equal the record's
 * snapshot) refuses every undo of a create. Seeding both calls from the same
 * `toolCallId` makes them mint identical ids for an identical batch.
 *
 * Assumes toolCallIds are unique per pond — two different tool calls in the
 * same pond seeding the same ids would mint colliding blocks.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** UUID-shaped (8-4-4-4-12 hex), not a real v4 — a deterministic stand-in id. */
function hashToUuid(seed: string): string {
  const hex = [0, 1, 2, 3]
    .map((i) => fnv1a(`${seed}#${i}`).toString(16).padStart(8, '0'))
    .join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** A `mintId` whose Nth call always returns the same id for a given `toolCallId`. */
export function createDeterministicMintId(toolCallId: string): () => string {
  let n = 0
  return () => hashToUuid(`${toolCallId}:${n++}`)
}
