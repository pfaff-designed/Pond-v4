/**
 * Delta encoding for the extracted vals.
 *
 * Why deltas: a component's `renderVals()` returns the style objects for EVERY
 * element it can draw, regardless of the kind asked for — the template picks with
 * `sc-if`. So the full matrix is ~25k near-identical copies (~50MB). Deltas cut
 * that to the part that actually differs, which is also the answer to the question
 * a builder is asking: "what does hover change?"
 *
 * Two conventions, both documented in the generated file's `readme`:
 *   - `null` means the key is absent in the derived state.
 *   - `{ __arrayPatch: { "1": … } }` patches one index of a same-length array.
 */

export type Delta = Record<string, unknown>

export const ARRAY_PATCH = '__arrayPatch'

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function valueDelta(av: unknown, bv: unknown): unknown {
  if (isPlain(av) && isPlain(bv)) return diff(av, bv) ?? {}
  if (Array.isArray(av) && Array.isArray(bv) && av.length === bv.length) {
    const patch: Record<string, unknown> = {}
    for (let i = 0; i < bv.length; i++) {
      if (same(av[i], bv[i])) continue
      patch[String(i)] = valueDelta(av[i], bv[i])
    }
    return { [ARRAY_PATCH]: patch }
  }
  return bv
}

/** Changed/added keys only. A key present in `a` but gone from `b` becomes null. */
export function diff(a: Record<string, unknown>, b: Record<string, unknown>): Delta | undefined {
  const out: Delta = {}
  for (const k of Object.keys(b)) {
    if (same(a[k], b[k])) continue
    out[k] = valueDelta(a[k], b[k])
  }
  for (const k of Object.keys(a)) if (!(k in b)) out[k] = null
  return Object.keys(out).length ? out : undefined
}
