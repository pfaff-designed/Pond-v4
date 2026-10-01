---
spec_issue_number:
spec_branch: refactor/module-accessor
spec_base: origin/main @ f871218
spec_filed_at: 2026-09-12
spec_kind: refactor (arch review Candidate 3)
---

# BUILD BRIEF — C3: Module accessor (`resolveDescriptor`)

## Context

`ModuleDescriptor` splits into optional facets (`preview`, `nestedIdPaths`) that
default to something when absent, and `descriptorFor(type)` returns `undefined`
for an unregistered type. Every server-side reader re-implements the same two
defensive idioms by hand: `descriptor?.nestedIdPaths ?? []` and
`(descriptor.preview ?? descriptor.serialize)(...)`, each behind its own
null-safe `descriptorFor(...)?.` dispatch.

The highest-value case is the two id-stampers — `hydrate.ts` (write-time mint)
and `preview.ts` (display-time stamp) — which walk `nestedIdPaths` with
**byte-identical** code (`for (const path of descriptor?.nestedIdPaths ?? [])`).
They must stay in lockstep or a module gets ids in one path and not the other.
Today nothing enforces that; it is copy-paste discipline.

This is arch-review Candidate 3. Correctness already shipped and is well tested;
this is a pure dedup with a **zero behavior change** bar. Candidate 1 (Deep
Proposal Store, #73) and Candidate 2 (PGLite schema-invariant suite, #75) are
done; C3 is next in the recommended order.

## Current State (verified 2026-09-12, worktree @ f871218)

Four production call sites read descriptor facets. All go through
`descriptorFor` and hand-roll the defaults:

| #   | Site                                                   | Current code                                                                                                                                     | Idiom                                   |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 1   | `src/lib/context/assemble.ts:94`                       | `descriptorFor(block.type)?.serialize(block, blocks) ?? ''`                                                                                      | serialize + `?? ''`                     |
| 2   | `src/lib/context/assemble.ts:148,150` (`blockPreview`) | `const descriptor = descriptorFor(block.type); if (!descriptor) return ''; return (descriptor.preview ?? descriptor.serialize)(block, siblings)` | `preview ?? serialize`                  |
| 3   | `src/lib/modules/hydrate.ts:24,26` (`hydrateBlock`)    | `const descriptor = descriptorFor(d.type as string); ... for (const path of descriptor?.nestedIdPaths ?? [])`                                    | `nestedIdPaths ?? []`                   |
| 4   | `src/lib/modules/preview.ts:47,49` (`stampDisplayIds`) | `const descriptor = descriptorFor(data.type); ... for (const path of descriptor?.nestedIdPaths ?? [])`                                           | `nestedIdPaths ?? []` (identical to #3) |

`descriptorFor` (`registry.ts:69`) returns `ModuleDescriptor | undefined`.
`ModuleDescriptor` (`types.ts:38-82`): `serialize` required, `preview?` optional
(defaults to `serialize`), `nestedIdPaths?` optional (defaults to `[]`).

Other `descriptorFor` callers (NOT touched): `module-nested-ids.test.ts:16,159,227`
— test oracles that independently re-implement the coalescing. `descriptorFor`
stays exported for them and for anyone needing an existence check.

No facet reads (`.serialize` / `.preview` / `.nestedIdPaths`) exist anywhere else
in the codebase. Renderer dispatch (`renderers.tsx:72`, `ModuleDiffCard.tsx:87`)
reads the _client_ `moduleRenderers` map, a different runtime half — **out of
scope** (see Out of Scope).

## Proposed Change

Add one total accessor that resolves a persisted `type` string to a descriptor
with defaults already applied and the missing-type case already handled, so no
call site coalesces.

### 1. Type — `src/lib/modules/types.ts` (beside `ModuleDescriptor`)

Minimal, non-generic, only the three facets callers consume. Data is `unknown`
(callers already cast).

```ts
/**
 * A ModuleDescriptor with its optional facets resolved to total ones: `preview`
 * falls back to `serialize`, `nestedIdPaths` to `[]`. Produced by
 * `resolveDescriptor`, which also absorbs the unknown-type case (a no-op
 * descriptor), so callers never coalesce. Only the three facets read on the
 * server half are surfaced; use `descriptorFor` when you need existence, the
 * schema, or the AI-catalog description.
 */
export interface ResolvedDescriptor {
  serialize(data: unknown, siblings?: readonly unknown[]): string
  preview(data: unknown, siblings?: readonly unknown[]): string
  nestedIdPaths: readonly string[]
}
```

### 2. Function — `src/lib/modules/registry.ts` (beside `descriptorFor`)

```ts
import type { ModuleDescriptor, ResolvedDescriptor } from './types'

// Unknown/unregistered type -> a callable no-op. serialize/preview yield '' (the
// same empty string assemble already filters out) and there are no id paths to
// walk (the same no-op as skipping). Keeps every caller free of ?./?? — the
// missing-type policy (t12 §2: tolerate, never hard-fail on read) lives here.
const NULL_DESCRIPTOR: ResolvedDescriptor = {
  serialize: () => '',
  preview: () => '',
  nestedIdPaths: [],
}

/**
 * Resolve a persisted `type` to a total descriptor: optional facets defaulted,
 * unknown type -> NULL_DESCRIPTOR. Never returns undefined — the one place the
 * `preview ?? serialize` and `nestedIdPaths ?? []` defaults live, so the two
 * id-stampers (hydrate + preview) can no longer drift.
 */
export function resolveDescriptor(type: string): ResolvedDescriptor {
  const d = descriptorFor(type)
  if (!d) return NULL_DESCRIPTOR
  return {
    // Forward via arrows (not the raw method refs) so a descriptor that reads
    // `this` still works; today none do, but this keeps the accessor honest.
    serialize: (data, siblings) => d.serialize(data, siblings),
    preview: (data, siblings) => (d.preview ?? d.serialize)(data, siblings),
    nestedIdPaths: d.nestedIdPaths ?? [],
  }
}
```

`descriptorFor` is unchanged and stays exported.

### 3. Migrate the four call sites (behavior identical)

**`assemble.ts`** — swap the import to `resolveDescriptor` (drop `descriptorFor`;
no other use remains), then:

- `:94` → `.map((block) => resolveDescriptor(block.type).serialize(block, blocks))`
  (the `.filter((line) => line.length > 0)` on the next line still drops the
  empty string a missing type now yields — same result as `?? ''`).
- `blockPreview` (`:147-151`) collapses to:
  ```ts
  function blockPreview(block: Block, siblings: Block[]): string {
    return resolveDescriptor(block.type).preview(block, siblings)
  }
  ```
  (the `if (!descriptor) return ''` guard is absorbed by the null-object).

**`hydrate.ts`** — swap import to `resolveDescriptor`; in `hydrateBlock` remove
the `const descriptor = descriptorFor(...)` line and write:

```ts
for (const path of resolveDescriptor(d.type as string).nestedIdPaths) {
  mintNestedIds(withIds, path, () => mintId())
}
```

**`preview.ts`** — swap import to `resolveDescriptor`; in `stampDisplayIds`
remove the `const descriptor = descriptorFor(...)` line and write:

```ts
for (const path of resolveDescriptor(data.type).nestedIdPaths) {
  let n = 0
  mintNestedIds(withIds, path, () => `${base}-${n++}`)
}
```

### 4. New unit test — `src/__tests__/resolve-descriptor.test.ts`

Targets the accessor directly (nothing does today). Covers:

1. **Known type, all facets** — `resolveDescriptor('text').serialize(sample)` and
   `.nestedIdPaths` match the underlying descriptor.
2. **Preview fallback** — for a type whose descriptor declares no `preview`,
   `resolveDescriptor(type).preview(x)` returns the same string as
   `descriptorFor(type)!.serialize(x)`.
3. **nestedIdPaths default** — a type with no declared paths (e.g. `chart-line`)
   resolves to `nestedIdPaths: []`.
4. **Unknown-type null-object** — `resolveDescriptor('does-not-exist')` returns a
   callable whose `serialize`/`preview` yield `''` and whose `nestedIdPaths` is
   `[]` (the genuinely new behavior; no existing test exercises it).

## Out of Scope

- **Renderer-cast dedup** (`renderers.tsx:72`, `ModuleDiffCard.tsx:87` reading
  `moduleRenderers`). Different runtime half (client), different shape
  (contravariant `onChange`, no `descriptorFor` equivalent). File as a separate
  tiny cleanup if desired.
- **DRYing the existing test oracles.** `module-serialize.test.ts:142-149` and
  `module-nested-ids.test.ts:159,227` deliberately re-implement the rules to
  cross-check the accessor independently; routing them through `resolveDescriptor`
  would make them pass by construction. Leave unchanged.
- Any change to `descriptorFor`, `ModuleDescriptor`, schemas, prompt output, or
  wire format.
- Perf work. The per-call wrapper object is negligible (a handful of blocks per
  assembly); do not memoize.

## Acceptance Criteria

1. `resolveDescriptor(type)` exists in `registry.ts`, returns `ResolvedDescriptor`
   (never `undefined`), with the null-object for unknown types.
2. `ResolvedDescriptor` (3 facets) exists in `types.ts`.
3. All four call sites use `resolveDescriptor` and contain **no** `?.` or `??`
   around facet access. `grep -n "nestedIdPaths ?? \[\]\|preview ?? " src/lib`
   returns only comment lines, no live code.
4. No production file imports `descriptorFor` anymore; `descriptorFor` is still
   exported (test oracles + existence checks).
5. New `src/__tests__/resolve-descriptor.test.ts` covers the 4 cases above and
   passes.
6. Existing tests unchanged and green (`module-serialize.test.ts`,
   `module-nested-ids.test.ts`, per-module tests).
7. **Zero behavior change**: no snapshot, prompt-output, or wire diffs.
8. `tsc --noEmit` clean; full jest suite green in CI.

## Testing Plan

| Layer      | What                                                                                         | Count |
| ---------- | -------------------------------------------------------------------------------------------- | ----- |
| Unit       | `resolveDescriptor`: known facets, preview fallback, `[]` default, unknown null-object       | +4    |
| Regression | Existing `module-serialize` / `module-nested-ids` / per-module suites (unchanged) unaffected | 0 new |

## Verification

- **Local (worktree):** `npx tsc --noEmit` (works in-worktree; the jest suite
  does not — `jest.config.mjs` ignores `/.claude-worktrees/`, so `npm test`
  vacuously matches 0 tests).
- **CI:** push `refactor/module-accessor`; GitHub Actions runs the full jest
  suite. Green CI + the new test present + no snapshot/wire/prompt diffs = the
  zero-behavior-change bar met (same path PR #75 used).

## Rollback

Single self-contained PR. Revert the PR — the accessor is additive and the four
call-site edits are mechanical.

## Files Reference

| File                                        | Change                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| `src/lib/modules/types.ts`                  | + `ResolvedDescriptor` interface                        |
| `src/lib/modules/registry.ts`               | + `NULL_DESCRIPTOR`, + `resolveDescriptor()`            |
| `src/lib/context/assemble.ts:23,94,147-151` | import swap; migrate `:94` and `blockPreview`           |
| `src/lib/modules/hydrate.ts:19,24,26`       | import swap; drop local `descriptor`; loop via accessor |
| `src/lib/modules/preview.ts:19,47,49`       | import swap; drop local `descriptor`; loop via accessor |
| `src/__tests__/resolve-descriptor.test.ts`  | new unit test (4 cases)                                 |

## Effort

~30 min: 10 min accessor + type, 10 min four call-site migrations + import
cleanup, 10 min unit test. Then `/code-review` (Standards + Spec) → `/ship`
(conventional-commit PR; repo squash-merges; no VERSION/CHANGELOG).

## Related

- Arch review: `project_pond_arch_review.md` (Candidate 3).
- C1 Deep Proposal Store #73; C2 PGLite schema-invariant suite #75.
