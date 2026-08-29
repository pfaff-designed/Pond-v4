---
id: 38
label: cycle-3:vocabulary
status: open
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
