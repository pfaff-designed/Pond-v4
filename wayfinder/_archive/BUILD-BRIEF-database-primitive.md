# Build Brief: The Database Primitive (#16–20) — properties → collections → views → relations

**Status:** SPECCED (grilled 2026-09-01, all decisions user-confirmed) — pieces #17–19 ready to build; #20 stops at the `relation` type and gets its own grill.
**Epic:** #16. Pieces: #17 properties · #18 collections · #19 views · #20 relations.
**Strategic stance:** don't clone Notion's manual config UX — build the underlying primitive and let Pond drive it conversationally, with just enough manual UI to inspect and tweak.

## The spine decision (the fork that opened the grill)

"Does kanban become a view over a collection, or stay a standalone block?" → **a board IS a view over a collection**, because a **card is a row-page**.

Keep the current two-store model (**Option 3**): a page has an inline **blocks body** _and_ a **child-pages zone** — never a single interleaved list. The all-rows model (Option 1) was rejected: it's a non-sliceable spine rewrite touching 27 `.blocks` sites + the whole full-state-emit spine + a one-way data migration + embeddings, and it buys only free prose/row interleaving. Option 3's work is additive and survives an eventual Option-1 migration, so Option 1 is deferred-on-spec, not chosen.

**A database = a page whose `type='row'` children share a schema. A view = an inline block that draws those rows.**

Why Option 3 is also the AI-easiest: prose wants **re-emit** editing (LLMs are good at it — the current full-state-emit contract), data rows want **targeted** editing (`set_property`, never re-emit 500 rows). The two-zone boundary tells the AI which mode to use; the uniform all-rows list would force one mode on both.

## Decisions (grilled + resolved)

### #17 — Properties (foundation)

1. **Values** live per-page in the existing (dormant) `props` JSON, keyed by property id. `props` is greenfield — only ever written as `{}` today (`client.ts:164`, `home.ts:69`), nothing reads it.
2. **Schema** lives on the collection page at `props._schema` — a reserved key, **no new column**.
3. **Type set (7):** `text, number, date, select, status, checkbox, relation`. `relation` is _defined_ here, _implemented_ in #20. Resist url/formula/multi-select this pass.
4. **`status` reconciliation = uniform (option a).** The live `status` column (threaded through `client.ts`) migrates into `props`; status is just a `select`-typed property. No special-case column — the board's group-by is "group by property X" with zero branching.
5. A lone page's props are **free-form**; a validating schema applies only when the page is a row in a collection.

### #18 — Collections

6. A page **is** a collection iff it carries `props._schema`. No new type/flag — defining a child-schema is what makes it a collection.
7. **Mixed children (fork = b).** A collection holds both **rows** (`type='row'`, schema-bound, shown in views, hidden from rail) and **ordinary sub-pages** (rail-visible, not in views). Discriminator = the `'row'` NodeType.
8. New **`'row'` NodeType** (`NodeType` currently `area|routine|project|action|page|home`). The rail's `parent_id` child-fetch (`client.ts:117`) filters out `'row'` — a one-line filter.
9. **Lenient non-conforming:** missing prop → empty; unknown prop → tolerated, never deleted; removing a schema prop orphans but preserves values. No hard rejection (it would fight conversational authoring).
10. Add-to-collection mints a `row`; adding a sub-page is a **distinct gesture** → distinct AI tools, so Pond never guesses row-vs-subpage.

### #19 — Views (greenfield — nothing migrated in)

11. **View block:** `{ id, type:'view', mode, groupBy?, sort?, filter?, collectionId? }`.
12. **Inline-only this cycle:** a view renders its own page's `type='row'` children. `collectionId` is in the schema but the **linked-view path is stubbed** (explicit future feature; will ride #20's reference-integrity machinery).
13. **All 4 render modes:** table, board (group by select/status), calendar (place by date prop), gallery. Table/board adapt existing renderer code; calendar/gallery are new but small.
14. **Multiple views per collection** — just multiple view blocks on the page. Free under the block model.
15. **Config depth:** single-clause filter (`property op value`), single-key sort, single groupBy. **Compound/AND-OR filters deferred.**
16. **Read-hydration seam:** a view block gets its rows injected before `serialize` runs (`serialize(data, siblings)` is sync and gets page-mates, not children). One new hook in `assemble.ts`, which already `fetchChildren`. Named seam, not a subsystem.
17. **Write split:** direct _user_ manipulation (drag card, edit cell, move calendar event) → **optimistic `set_property(rowPageId, key, value)`**, never a proposal card. _Pond-initiated_ changes → proposal card (see #23–24).

### #20 — Relations (DATA-MODEL ONLY this cycle)

18. **`relation` value = array of page-ids + optional `single` cap; one-way.** Reverse side is a query ("pages whose relation X contains me"), not a stored synced field. Two-way is additive later.
19. **Deferred to a dedicated #20-start grill** (per `AGENTS.md`): rollup aggregation set (count/sum/min-max/rollup-of-prop), cycle/consistency handling, and F14 (`use-cross-page-metric`) fold-in. This cycle only guarantees the `relation` _type_ exists so #17's schema isn't repainted later.

### AI authoring surface

20. **Views are blocks** → authored through the existing full-state-emit proposal path (reuse).
21. **Schema/rows/props** live outside the `blocks` array → **new discrete tools:** `define_schema(pageId, props[])`, `add_row(collectionId, props)`, `set_property(rowId, key, value)`, `create_view(pageId, {...})`.
22. **Approval = proposal-card path (option a).** Pond-initiated data mutations go through the hardened ticket-19 `{messages, resolutions}` envelope, **batched into ONE card** per logical change (e.g. "create collection Tasks + add 3 rows" = one card, not four).

### Retirement / migration

23. **Nothing kept.** `kanban` and `table` blocks are **retired**: removed from the palette (no new ones), left registered for read-tolerance (t12) so stragglers don't crash, optional one-shot cleanup delete. **Zero data migration anywhere.**

## Suggested build sequence (each piece commits green: tsc, eslint, jest, stories)

1. **#17 properties** — `props` typed schema (Zod, per t12) + 7 types + `status`→`props` migration + single-page property read/write/edit + a minimal manual property inspector.
2. **#18 collections** — `'row'` NodeType + rail filter + `_schema`-on-collection + lenient conform + `add_row`/add-subpage tools.
3. **#19 views** — 4 renderers + inline read-hydration seam in `assemble.ts` + single-clause config + `create_view` + retire `kanban`/`table` from palette.
4. **#20** — implement ONLY the `relation` type end-to-end (author, store, render as page chips). **Full relations/rollups = separate grill + brief.**

Grill covered #17–19 fully; each may proceed to build without re-grilling unless implementation surfaces new scope. #20 must re-grill before its rollup half.

## Constraints & gotchas for the builder

- **Don't clobber `_schema`.** Property tooling writes row values into the same `props` JSON that holds `_schema` on collection pages — merge, never overwrite the object.
- **Exhaustiveness tests.** Retiring `kanban`/`table` keeps their descriptors registered (read-tolerance) but the `moduleDescriptors` exhaustiveness/palette tests need updating.
- **`serialize` stays sync.** Do not make `serialize` async to reach children — hydrate the view block _before_ it's serialized (in `assemble.ts`), preserving the pure-function contract in `types.ts`.
- **Optimistic writes bypass the AI path.** User drag/cell-edit must not route through `propose_changes`; only Pond's own mutations do.
- **`'row'` pages are real pages.** They can be opened, hold their own body blocks, and carry `props` — they're just filtered from the rail. Don't model them as a lesser type that can't be navigated to.
- **Linked views are stubbed, not absent.** `collectionId` exists in the schema and must round-trip through persistence; only the _foreign-child hydration + dangle handling_ is unbuilt. Guard the path explicitly.
