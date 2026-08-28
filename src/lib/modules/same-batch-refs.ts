/**
 * Same-batch binding resolution (ticket-31) — pure, server-safe, no React.
 *
 * Closes ticket-23's deferred boundary: a metric could only bind to a block that
 * ALREADY existed, because the AI never mints ids (the client mints on accept — t16
 * branch 2), so a block created in the SAME batch had no id at emit time.
 *
 * The fix is a symbolic ref resolved at accept time, entirely client-side:
 *
 *   1. A create — a propose_changes `create` op or a create_page block entry — may
 *      tag itself with a batch-local `bindKey` (e.g. `"chores"`).
 *   2. A metric's emit-time `source` may name that key via `{ ref: "chores", kind }`
 *      instead of a real `blockId` (the PERSISTED metric schema accepts only
 *      `blockId` — see metric/schema.ts — so an unresolved ref cannot reach storage;
 *      it fails hydration instead).
 *   3. At accept the client builds a `bindKey → minted-id` map over the FULL batch
 *      (`collectBatchRefIds`) and rewrites every `source.ref` to the mapped id
 *      (`resolveSourceRef`).
 *
 * Guarantees:
 *
 * - **Never a phantom binding.** A key maps ONLY if its create's data passes block
 *   validation (a create that will be skipped at accept can never be a binding
 *   target), and never if that create was explicitly REJECTED. An unknown ref drops
 *   the whole `source`, so the metric falls back to its manual value.
 * - **Per-change accepts stay consistent.** The map is built from the WHOLE proposal
 *   batch, and minted ids are remembered in a caller-owned `refIds` record across
 *   separate Accept clicks: accept the metric first and it binds to the id RESERVED
 *   for the pending checklist; accept the checklist later and it lands with that
 *   same id, healing the binding. (If the caller's memory is lost — e.g. a reload
 *   between per-change accepts — a later ref resolves against a fresh record and
 *   the binding degrades to the stale-with-fallback state, never a wrong number.)
 */
import { hydrateBlock } from './hydrate'

/** A batch-local bindKey → the real block id minted/reserved for that create. */
export type RefMap = ReadonlyMap<string, string>

/** The shape `collectBatchRefIds` reads: a create's data plus its optional key. */
export interface KeyedCreate {
  bindKey?: string
  data: unknown
}

/**
 * Build the bindKey→id map for a batch's creates, in batch order.
 *
 * - `refIds` is the caller-owned cross-call memory: ids already minted for a key in
 *   an earlier accept are reused; newly reserved ids are written back into it.
 * - A key whose create was REJECTED (`rejectedKeys`) or whose data fails block
 *   validation is NOT mapped — a metric ref'ing it falls back to manual rather than
 *   binding to an id that will never land (review fix: phantom-blockId dangle).
 * - First occurrence of a duplicate key wins; later ones are ignored.
 */
export function collectBatchRefIds(
  creates: readonly KeyedCreate[],
  mintId: () => string,
  opts?: { refIds?: Record<string, string>; rejectedKeys?: ReadonlySet<string> }
): RefMap {
  const refIds = opts?.refIds ?? {}
  const map = new Map<string, string>()
  for (const { bindKey, data } of creates) {
    if (!bindKey || map.has(bindKey)) continue
    if (opts?.rejectedKeys?.has(bindKey)) continue
    if (!isValidBlockData(data)) continue
    const id = (refIds[bindKey] ??= mintId())
    map.set(bindKey, id)
  }
  return map
}

/**
 * Would this create's data hydrate into a valid block? Probe with throwaway ids —
 * validity never depends on id VALUES, so this consumes nothing from the caller's
 * mint sequence. Used to keep invalid creates out of the ref map (they will be
 * skipped at accept, so nothing may bind to them). Note: a metric whose own source
 * is still a `ref` probes invalid (the persisted schema is blockId-only) — chained
 * key→key bindings are deliberately unsupported.
 */
function isValidBlockData(data: unknown): boolean {
  return hydrateBlock(data, VALIDITY_PROBE_ID, () => VALIDITY_PROBE_ID) !== null
}
const VALIDITY_PROBE_ID = 'validity-probe'

/**
 * Rewrite a metric-shaped block's `source.ref` to the mapped `blockId`. Non-metric
 * data, or a metric with no `ref` source, is returned unchanged. An unknown ref
 * drops the whole `source` (fall back to manual — never a dangling binding).
 *
 * Operates on the raw AI-emitted data (before id minting/validation), so it stays a
 * plain-object transform with no schema import — the accept paths re-validate the
 * result through `hydrateBlock`, which is where a malformed metric is caught anyway.
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
    // Unknown ref (create rejected, invalid, or key never emitted) → drop the
    // binding. The metric keeps its manual `value`; it never dangles.
    const withoutSource = { ...data }
    delete withoutSource.source
    return withoutSource
  }
  return { ...data, source: { blockId: resolved, kind } }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
