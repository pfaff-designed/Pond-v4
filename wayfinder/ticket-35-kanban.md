---
id: 35
label: cycle-3:vocabulary
status: resolved
blocked-by: []
blocks: []
---

# Kanban board module (finding F4)

Registry gains a `kanban` module: columns + cards. Schema (t12: Zod single
source): columns [{id, title, cards: [{id, title, note?}]}]. Facets: view
(drag card between columns via pointer events — no new dep; add/edit/archive
card; add/rename column), serialize (honest text: per-column counts + card
titles), preview. AI-composable per t16 (catalog when-to-use: "workflow with
stages — use ONE kanban per workflow, not kanban + checklist for the same
tasks"); full-state emit is fine at this scale (ops-patch stays deferred per
map fog). bindKey-able as a metric source later is OUT of scope (needs a
kanban-count kind — note as deferred). Design per w2-design-brief.md; builder
may take ONE short mobbin look (≤5 searches) for board interaction detail.
Stories + story tests (drag via play fn if feasible, else jest the pure
move logic; long titles; empty board; add flows). Empty starting state for
manual creation (t37): 3 columns To do/Doing/Done, no cards.

Token regime: jest+story proof only, no dev server; touched-files lint clean.
Resolution + status: resolved.

## Resolution

Built the `kanban` module in `src/lib/modules/kanban/` (schema, view, pure move
logic) and wired it through the t12/t16 registry seams.

**Schema** (`schema.ts`): `{id, type:'kanban', title?, columns: [{id, title,
cards: [{id, title, note?}]}]}` — a two-level nested-id structure (columns AND
cards carry minted ids). Exported `emptyKanban(id, mintId)` factory = 3 columns
To do/Doing/Done, no cards (the t37 manual-creation starting state), so t37 reads
it off the registry rather than hardcoding. Descriptor `serialize` is honest text
(title + per-column count + every card title, notes in parens, `(0): —` for empty
columns); `preview` is the short count line (`To do 1 · Doing 1 · Done 0`).

**Deep nested ids**: kanban is the first two-level module, so the flat one-level
`nestedIdPaths` walker was extended to accept ONE dotted deep segment
(`'columns.cards'`). `NestedIdPath<T>` in `types.ts` now allows
`` `${keyof T}.${string}` ``; the shared walkers in `hydrate.ts` (new exported
`mintNestedIds`) and `preview.ts` (`stampDisplayIds`) recurse it. Additive —
existing single-segment paths (`items`, `rows`) unchanged. Kanban declares
`['columns', 'columns.cards']`.

**Drag** (view.tsx): pointer events, no new dep. A dedicated drag handle (⠿) per
card owns the drag (the card body is full of edit inputs, so dragging the whole
card conflicts with editing). Press → threshold → the source card ghosts
(opacity-30) and a tilted, shadowed clone floats under the pointer; the column the
pointer is over brightens its wash (`bg-press-accent-wash`); release drops the card
to that column's foot via pure `moveCard`. The whole lifecycle is **ref-driven**
(`dragRef`/`overColumnRef`/`startRef`) — pointerdown→move→up fire in one burst with
no re-render, so a state-closure handler reads stale nulls; state exists only to
render the lift visuals. Cross-column only (within-column reorder is out of scope
per spec). Tilt is `motion-reduce:rotate-0` guarded.

**Also editable in-view** (folds into the view, no separate `editor`, per t12):
add-card field at each column foot (Enter/blur commits), inline card title+note
edit, archive card (×), rename column (header input), add column (+ Column). Every
interaction emits a whole new block via `onChange` (full-state, per contract).

**AI-composable** (t16): added `kanbanData` (id-stripped at both levels) to
`moduleDataSchema` + `createPageBlockSchema`, plus registry/renderers/content-union
entries and the catalog when-to-use line ("ONE kanban per workflow; a card IS the
task; prefer a checklist when items are simply done/undone"). bindKey-as-metric-
source (a kanban-count kind) is OUT of scope — deferred (needs a new metric source
kind; note for a future ticket).

**Proof**: tsc 0, jest 557/557 (added kanban samples to the shared completeness
fences: module-nested-ids, module-serialize, module-registry — swapped the latter's
"kanban" unregistered-type placeholder to "gantt"; new move.test + schema.test),
test-storybook 125/125 (8 kanban stories incl. a real pointer-drag play test that
asserts the ghost lift then the landed card), touched-files lint clean (79-problem
repo baseline untouched).
