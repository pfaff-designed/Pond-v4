/**
 * Same-batch binding resolution (ticket-31) — pure, server-safe, no React.
 *
 * Closes ticket-23's deferred boundary: a metric could only bind to a block that
 * ALREADY existed, because the AI never mints ids (the client mints on accept — t16
 * branch 2), so a block created in the SAME `changes[]` batch had no id at emit time.
 *
 * The fix is a symbolic ref resolved at accept time, entirely client-side:
 *
 *   1. A `create` op may tag itself with a batch-local `key` (e.g. `"chores"`).
 *   2. A metric's `source` may name that key via `{ ref: "chores", kind }` instead of
 *      a real `blockId`.
 *   3. At accept the client mints an id per create op FIRST, building a `key → id`
 *      map, then rewrites every `source.ref` to the matching minted `blockId`.
 *
 * What persists is always the `{ blockId, kind }` form — an unresolved `ref` never
 * survives into storage, so serialize/derive stay truthful post-accept (a ref-bound
 * metric becomes an ordinary blockId binding). An UNKNOWN ref (its create op was
 * rejected, or the key was never emitted) DROPS the whole `source`, so the metric
 * falls back to its manual value and never dangles.
 *
 * This module owns only the map-building + per-block rewrite; the accept path
 * (`pages/edits.applyProposedChanges`) owns the id minting and array placement and
 * calls in here.
 */

/** A batch-local key → the real block id minted for that create op at accept time. */
export type RefMap = ReadonlyMap<string, string>

/**
 * Rewrite a metric-shaped block's `source.ref` against the resolved key map, in place
 * of returning a `blockId` binding. Non-metric data, or a metric with no `ref`
 * source, is returned unchanged. An unknown ref drops the whole `source` (fall back
 * to manual — never a dangling binding).
 *
 * Operates on the raw AI-emitted data (before id minting/validation), so it stays a
 * plain-object transform with no schema import — `applyProposedChanges` re-validates
 * the result through `hydrateBlock`, which is where a malformed metric would be
 * caught anyway.
 */
export function resolveSourceRef(data: unknown, refs: RefMap): unknown {
  if (!isRecord(data) || data.type !== 'metric') return data
  const source = data.source
  if (!isRecord(source) || !('ref' in source)) return data

  const ref = source.ref
  const kind = source.kind
  if (typeof ref !== 'string') return data

  const resolved = refs.get(ref)
  if (resolved === undefined) {
    // Unknown ref (create op rejected or key never emitted) → drop the binding.
    // The metric keeps its manual `value`; it never dangles on a phantom id.
    const withoutSource = { ...data }
    delete withoutSource.source
    return withoutSource
  }
  return { ...data, source: { blockId: resolved, kind } }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
