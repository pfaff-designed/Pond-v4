# SPEC — Relation Rollups (#20, second half — rollups slice)

**Issue:** #20 DB Primitive 4/4 — Relations & rollups. First half (the `relation`
property type, end-to-end) shipped in PRs #34/#35. This spec covers **rollups only**;
the other three second-half pieces (backlinks, AI link-authoring, linked-view unstub)
are split into their own issues and are OUT of scope here.

**Prior art:** `wayfinder/SPEC-relation-type.md` (the relation half, decisions 1–8).
This spec reuses that half's seams and posture (tolerate-don't-sync, client-side
resolution, AI-only authoring).

---

## What a rollup is

A **rollup** is a derived property on a collection that aggregates a value across the
pages a **relation** on that same collection points at. Example: a `Projects`
collection with a `Purchases` relation → a `Total spent` rollup = `sum` of the
`Amount` property over the linked purchase rows.

---

## Decisions (grilled + user-confirmed)

**D1 — Scope: rollups only.** Backlinks, AI link-authoring, and linked-view unstub are
separate issues, sequenced after rollups.

**D2 — Derived / never-stored.** A rollup's `PropertyDef` lives in the collection schema,
but there is **no** entry in a row's value map. It is computed on read every time it is
displayed. `valueSchemaFor('rollup')` does not produce a stored value; editing surfaces
render it **read-only**. This matches the relation half's "aggregate is a query, not a
synced field" and sidesteps stale-write invalidation entirely.

**D3 — `PropertyDef` shape.** Extend `propertyDefSchema` in `src/lib/properties/schema.ts`:

```ts
{
  id, name,
  type: 'rollup',
  relationId: string,        // id of a relation PropertyDef on THIS collection
  rollupProperty?: string,   // id of a property on the TARGET collection's schema;
                             //   omitted when aggregate === 'count'
  aggregate: 'count' | 'sum' | 'average' | 'min' | 'max',
}
```

- Rollup references the relation **by property id** (`relationId`), resolved within the
  same collection's schema. Ids are stable; every other cross-reference here uses ids.
- **One** `rollupProperty` per rollup. Multiple aggregations = multiple rollup properties.
- **Constraint:** value-based aggregates require the referenced relation to be **targeted**
  (have a `target` collection) so `rollupProperty` resolves against a known schema.
  `count` works over an untargeted relation. Untargeted/dangling `relationId` → renders "—".

**D4 — Aggregation set + type applicability.**

| Aggregate | Valid `rollupProperty` types | Empty-relation result |
| --------- | ---------------------------- | --------------------- |
| `count`   | _none_ (counts linked pages) | `0`                   |
| `sum`     | number                       | `0`                   |
| `average` | number                       | `—`                   |
| `min`     | number, date                 | `—`                   |
| `max`     | number, date                 | `—`                   |

- Applicability validated against the target property's type. Wrong type / deleted target
  property → quiet **"—"**, never a crash or coerced garbage.
- Missing/empty per-row values are **skipped**, not coerced to 0 (empty ≠ 0; won't drag an average).
- Checkbox/select/status aggregates (percent-checked, count-per-option) are OUT of scope.

**D5 — Compute seam: reuse the `['rows', targetId]` cache, NOT F14.**
`PondPage.props` (client.ts:49) carries each row's full value map. The relation half already
primes `['rows', targetId]` (via `useRelationTitles` / the picker). A rollup computes purely
from **that cache + the parent's linked-id list**.

- Pure `computeRollup(def, linkedIds, targetRows, targetSchema)` — no I/O, fully unit-testable.
- Thin `useRollup(def, relationValue, relationDef)` hook pulls `['rows', targetId]` (reusing the
  exact query key / `getCollectionRows`) and calls the pure fn.
- **F14 `useCrossPageBlocks` is deliberately set aside** — it fetches _blocks_ over _tree-children_,
  a different data axis than _row props_ over _relation-linked ids_. F14 remains the seam for
  tree-aggregate metrics; it is not generalized here. (Explicit deviation from the build brief's
  "F14 fold-in" suggestion — investigated and rejected.)

**D6 — Cycles are impossible by construction; no detector.** Because rollups are never stored
(D2), a rollup that rolls over a property which is itself a rollup reads `props[thatRollupId]` →
nothing → that row is skipped → "—". We only ever read one level into stored props; we never
recursively compute. Runtime tolerates; the only guard is authoring-side: exclude rollup-typed
properties from `rollupProperty` choices offered to the AI.

**D7 — Authoring is AI-only via `define_schema`** (no manual schema UI exists). Extend
`aiPropertyDefSchema` with a by-name rollup variant:

```ts
{ type: 'rollup', name: 'Total spent',
  relation: 'Purchases',      // NAME of a relation property on this collection
  rollupProperty: 'Amount',   // NAME of a property on the target collection
  aggregate: 'sum' }
```

On accept, `hydratePropertySchema` resolves: `relation` name→relation def id (this schema),
`rollupProperty` name→property id (target collection schema, found via the resolved relation's
`target`), and validates `aggregate`. **Unresolvable → keep the def but render "—"** (more
debuggable than a vanished property; differs from relation-target which is dropped).

**D8 — Rendering.** `RollupValueField` (organism, fetch boundary via `useRollup`) →
`RollupValue` (pure presentational: integer for count, formatted number for sum/average,
formatted date for min/max, "—" for blank/wrong-type; quiet placeholder while loading).
Wired into `view.tsx` Cell (`case 'rollup'`) and `PropertyInspector` (`case 'rollup'`),
**always non-editable**. Reuse existing number/date cell formatting. Modes that route through
the shared property renderer get rollups for free; no rollup-specific card layouts.

**D9 — AI serialization: definition-only.** `assemble.ts` serializes the rollup's _meaning_
("Total spent — rollup: sum of Amount via Purchases"), NOT a server-computed value (would
require server-side target-row fetch). Pond can still see the underlying relation + rows.
Computed-value serialization is a clean follow-up (the pure `computeRollup` makes it easy later).

---

## Slice plan (each commit green: tsc · eslint · jest · stories)

1. **Schema** — `'rollup'` in `PROPERTY_TYPES` + `propertyDefSchema` (`relationId`,
   `rollupProperty?`, `aggregate`); `aiPropertyDefSchema` by-name rollup variant;
   `valueSchemaFor`/`emptyValue` never-stored handling. Unit tests.
2. **`computeRollup`** — pure fn (count/sum/average/min/max; type-validation; empty & wrong-type
   → "—"; skip stragglers). Unit tests.
3. **Accept-path hydration** — `hydratePropertySchema` resolves relation-name→id +
   rollupProperty-name→id (via target schema) + aggregate validation; unresolvable → keep-but-blank.
   Tests (mirror `define-schema-from-proposal.test.ts`).
4. **`useRollup` + `RollupValue` + `RollupValueField`** — fetch boundary reusing `['rows', targetId]`;
   presentational formatting; loading placeholder. Stories (seeded QueryClient + `nextjs.appDirectory`).
5. **Wire-in** — `view.tsx` Cell + `PropertyInspector` `case 'rollup'`, read-only.
6. **AI copy + card + serialize** — `define_schema` tool + `prompt.ts` teach rollup authoring;
   `DefineSchemaProposalCard` previews it ("Σ Amount via Purchases"); `assemble.ts` serialize
   definition-only.

## Verification

tsc · eslint · jest · storybook, then live `/verify` on :3000 — AI authors a rollup over an
existing relation → value computes → add/remove a link updates it → reload persists → 0 console
errors. Then `/code-review` both axes.

## Out of scope (tracked separately)

- Backlinks (reverse-lookup query) — own issue.
- AI link-authoring tool — own issue.
- Linked-view unstub (`view.tsx` `collectionId` stub) — own issue.
- Server-side computed-value serialization (D9 option B).
- Manual schema-editor UI; grouped/type-specific aggregates; materialized/stored rollups.

## Lazy-client note (CI)

Any new hook that constructs the Supabase client must do so **inside the queryFn** (lazy), not at
render — envless CI/Storybook otherwise throws (see #38 and the fix in `useRelationTitles`).
