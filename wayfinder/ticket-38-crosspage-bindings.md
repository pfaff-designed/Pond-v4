---
id: 38
label: cycle-3:vocabulary
status: resolved
blocked-by: []
blocks: []
---

# Cross-page bindings — live rollups across pages (finding F14)

Pond itself confessed: "live metrics can only bind to checklists on the same
page." Extend the t23/t31 binding lineage so a parent project page holds LIVE
rollups from child pages.

1. **Schema** (emit + persisted, per the t31 split): metric source gains
   optional `pageId` — {pageId, blockId, kind} binds to a block on another
   page; NEW aggregate form {pages: 'children', kind} sums the kind across all
   direct child pages' blocks (checklist-checked/total, table-rows). Persisted
   schema accepts both new forms (they're stable references, unlike refs).
2. **Derivation seam**: extend the metric view/derive path to read other
   pages' blocks via react-query ['page', pageId] (fetch on mount if not
   cached; the invalidation from commits/accepts already keeps them fresh —
   trace and jest-pin this). Aggregate form walks ['pages'] tree for children
   then reads each. Loading state = quiet placeholder, never a wrong number.
   Stale (page/block gone) → manual fallback + "source missing" per t23.
3. **Serialize honesty** across pages (siblings param can't reach other pages
   — extend the serialize seam minimally or state the boundary honestly in the
   emitted text; do NOT emit a wrong number).
4. **Catalog teaching**: AI PREFERS live rollups over manual summary tables
   (the exact anti-pattern it apologized into); teaches both forms + scope
   caption ("across N milestone pages" per w2-design-brief.md).
5. Caption shows scope quietly; count-up (t31) still works on rollup changes.

CONTRACT WORK → full review pair at review time. Jest hard: aggregate math,
loading/stale, invalidation freshness, serialize honesty, catalog pins.
Token regime: jest+story proof, no dev server. Resolution + status: resolved.

## Resolution (2026-08-29)

Shipped all five parts. A parent page now holds LIVE rollups over other pages —
a metric can bind to a block on ANOTHER page, or SUM a kind across every direct
child page — extending the t23/t31 binding lineage without disturbing it. The
finding-F14 confession ("live metrics can only bind to checklists on the same
page") is retired.

### 1. Schema — two new PERSISTED source forms (metric/schema.ts)

The metric `source` is now a `z.union` of three STABLE forms:

- `{ blockId, kind }` — same-page (ticket-23), unchanged.
- `{ pageId, blockId, kind }` — a block on ANOTHER page (ticket-38).
- `{ pages: 'children', kind }` — SUM `kind` across every direct child page's
  blocks (the rollup).

Both new forms PERSIST, unlike the ephemeral `ref` — justified per the t31
precedent: they are STABLE references (real minted ids / a `'children'` literal
that survives child churn), so there is no dangling-binding risk to keep out of
storage. Jest fences persistence of both and re-asserts the ticket-31 invariant
that a raw `ref` still fails the persisted schema.

**Union-order is load-bearing** (a real bug caught + fenced): zod strips unknown
keys, so the permissive same-page `{ blockId }` branch would SILENTLY DROP a
`pageId` and collapse a cross-page binding to same-page. Both the persisted union
and the emit union in ai-composition.ts are ordered most-specific-first
(cross-page, aggregate, same-page, then emit-only ref LAST). Pinned by a
"PRESERVES pageId" test.

### 2. The cross-page read seam (metric/use-cross-page-metric.tsx — the design care)

The pure `derive.ts` stays server-safe and gained a `CrossPageBlocks` resolution
param: `{ loaded, blocksByPage, childPageIds }`. It resolves ALL three forms into
one `DerivedMetric` — new states `aggregate` (carries `pageCount` for the scope
caption) and `pending` (cross-page data not yet loaded). A CLIENT hook
`useCrossPageBlocks(source, pageId)` feeds it:

- cross-page block → one `useQuery(['page', pageId])`;
- aggregate → walk `['pages']` for this page's direct children, then `useQueries`
  over `['page', childId]` for each.

It reads the SAME `['page', id]` / `['pages']` caches the editor, the cross-page
edit preview, the rail and the overview surfaces already use — so the
invalidations that ALREADY fire keep rollups fresh with **zero extra wiring**:
`accept.ts` fires `invalidateQueries(['page', target])`, `commit.ts` fires
`invalidateQueries(['pages'])`. Both freshness paths are jest-traced (fire the
exact invalidation → assert re-derive). While any needed page is fetching,
`loaded:false` → the view shows a **quiet em-dash placeholder, never a wrong
number**; a resolved-but-missing page → `stale` (manual fallback + "source
missing"), per t23.

`pageId` is plumbed to the metric via the existing `SiblingBlocksProvider` seam
(DocumentPanel passes `page.id`, PageView passes `data.id`) — the aggregate scope
needs it to find children. A host without a page identity (Storybook, terminal
reference render) omits it and the aggregate degrades to `pending`.

**Graceful-degrade without a QueryClient** (t23 "never crash outside a page host"
extended): `MetricView` reads `QueryClientContext` via `useContext` (not the
throwing `useQuery`); the react-query hook is confined to a child
`CrossPageMetricRow` that mounts ONLY when the source needs a cross-page read AND
a client is present. Absent either, the pure same-page path runs and a cross-page
source renders a `pending` placeholder. So every existing bare-render surface
(module-registry test, same-page metric stories, diff cards) is untouched — no
harness churn.

### 3. Serialize honesty (metric/schema.ts serialize)

`siblings` holds only THIS page's blocks and serialize is a pure server-safe
facet with no react-query reach — so a cross-page/aggregate number CANNOT be
derived there. Rather than risk a lie, serialize states the binding honestly and
keeps the manual fallback: cross-page names the page + block ("...on page X
(cross-page; manual fallback: N)"), aggregate states the scope ("rolled up live
across child pages (manual fallback: N)"). The live number lives where it's
actually computed — the UI, backed by the seam. Jest asserts NO fabricated
number is ever emitted (even when a same-id decoy block sits on the local page)
and that output is identical with/without siblings.

### 4. Catalog teaching (metric descriptor description)

Appended (not rewritten — clean keep-both merge with tickets 35/36) the two new
forms + the anti-pattern steer: **STRONGLY PREFER a live `pages: 'children'`
rollup over a hand-written summary table** (the exact pattern Pond apologized
into). Catalog pins assert `pageId`, `pages: "children"`, "child pages",
"PREFER", "summary table".

### 5. Scope caption + count-up

The aggregate view shows a quiet caption — "across N pages" (contributing pages
only; an empty/non-matching child does not inflate N) — per w2-design-brief. The
t31 NumberFlow count-up now also fires on an `aggregate` value change (the
`hasLiveValue` gate covers both `derived` and `aggregate`).

### Validation

- `npm run typecheck` clean.
- `npm test` → **45 suites / 569 tests** pass (was 404 at t31). New/extended:
  `use-cross-page-metric.test.tsx` (loading→pending, resolved-missing→stale, both
  freshness traces, aggregate over the real hook, no-fetch-when-not-needed);
  `metric-derive.test.ts` (+cross-page & aggregate pure math, pending/stale,
  contributing-pages count, empty rollup); `module-serialize.test.ts` (cross-page
  & aggregate honesty); `ai-composition.test.ts` (emit accepts both forms +
  pageId-preserved ordering fence + persisted-schema fences + catalog pins).
- `test-storybook` → **119 pass** (incl. new `CrossPageBound` + `ChildPagesRollup`
  stories, each with a pre-seeded QueryClient so the seam resolves from cache
  without network).
- Lint: every touched file clean; repo-wide 79 problems unchanged from main (all
  in `src/components/charts/` + `src/app/proto/`).

### Deferred / boundaries

- **Cross-page `→` scroll** — an aggregate has no single source to jump to (no
  affordance); cross-page navigation is out of scope — no `→` on cross-page,
  only same-page keeps it.
- **Table column-predicate `kind`** (t23's other deferred) still open — orthogonal;
  a predicate rollup across children would compose once that `kind` lands.
- **Deeper-than-direct children** — `pages: 'children'` is direct children only
  (a `'descendants'` scope is the natural next literal if a case lands).
- **Cross-page metric in the terminal reference render** fetches live (it's inside
  the app's QueryClient) — acceptable; it shows the real rollup or a placeholder.
- **metric-ring cross-page** — same seam would suit a ring's fill fraction; left
  for a real case (as t23 noted for same-page).
