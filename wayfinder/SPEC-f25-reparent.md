# SPEC — F25: Drag pages to reparent + reorder (issue #9)

_Branch `feat/f25-reparent`. Grilled + resolved 2026-09-01. Epic A (structural integrity) — the last tree-trust prereq before the Database Primitive._

## Context

The rail is a nestable page tree (`pages` rows, `parent_id`, `['pages', workspace]` React Query cache, nested by `buildTree`). Today you can create, open, and delete pages, but you cannot **restructure** the tree — there's no way to move a page under a different parent or set sibling order. The Database Primitive epic rides on a trustworthy tree; giving the user direct MOVE control is the last Epic-A prereq. F26 (create-placement) already shipped; this is its structural sibling.

## Current State (verified 2026-09-01)

- `src/lib/pages/tree.ts` — `PageRow { id, parent_id, type, title, order, updated_at }`; `fetchPages` reads the `['pages', workspace]` cache (Life `home` row stripped); `insertPageOptimistic` is the established optimistic-cache pattern.
- `src/lib/rail/tree.ts` — pure, jest-covered: `buildTree` nests + sorts by `order` then `title.localeCompare`; `flattenVisible`, `isFolderNode`, `treeKeyCommand` (focus/expand/collapse/open/delete/addChild — **no move**), `LIFE_ID`/`LIFE_NODE` synthetic root.
- `src/lib/pages/client.ts` — `createPage`, `deletePage`, `saveBlocks`. **No `movePage`.** `createPage` never writes `order` → **every existing row has `order = 0`**, so today's ordering is effectively alphabetical.
- `src/components/organisms/Rail.tsx` — container owns `['pages']` query, `expanded` set, optimistic mutations (`handleAddChild`, delete with `removeRow`/`restoreRow`/`notify`), reveal effect. `RailView` (same file) renders `TreeRow` rows; `role="tree"` WAI-ARIA APG.
- Drag precedent: `src/components/organisms/BlockCanvas.tsx` (ticket-37) — native HTML5 `draggable`, armed on handle-pointer-down.

## Proposed Change

Whole-row drag-and-drop in the rail that MOVEs a page: reparent (drop _into_ a row) and reorder (drop _before_/_after_ a sibling), persisting `parent_id` + sibling `order`.

### Interaction

- **Arming:** each `TreeRow` (except the synthetic Life root) is `draggable`. A plain click still navigates — native DnD only starts on pointer movement past threshold.
- **Three-zone drop** per hovered row, computed from pointer Y within the row rect:
  - top ¼ → **before** (new sibling above the target, same parent as target)
  - middle ½ → **into** (becomes target's child, appended last)
  - bottom ¼ → **after** (new sibling below the target, same parent as target)
- **Life root** is an _into_-only target → `parent_id = null` (top-level), appended. No before/after on Life (it's a set of one).
- **Visuals:** a horizontal drop-line at the row's top/bottom edge for before/after; a full-row highlight for into. Dragged row dims (~50% opacity) during the drag. A cycle target (see below) shows a "rejected" affordance (no drop-line, `not-allowed`) and drop is a no-op.
- **Auto-expand on drop:** an _into_ drop expands the target folder so the moved child is visible.

### Rules

- **Full structural freedom** — any page → into/before/after any page or into Life, regardless of `type`. Dropping _into_ a leaf turns it into a folder (allowed).
- **Only rejected move = cycle:** dropping a node into its own subtree (target is the dragged node or any descendant). Rejected at dragover (no drop-line) and re-guarded at drop.
- **No-op drops skip the mutation:** drop onto self, or into a slot that yields the same `parent_id` + same position, does nothing.

### Ordering

- `order` stays `int`. On a move, **reindex the target sibling group** densely `0,1,2,…` in the resulting visual order and persist those rows. This repairs the legacy all-zeros state on first touch.
- The **old** parent's sibling group is left as-is (a gap in its order sequence sorts fine — `buildTree` tolerates it).
- Before/after: the moved node takes the slot relative to the target; into: appended at end of target's children.

### Data / mutation

New `movePage` in `src/lib/pages/client.ts`:

```ts
// Sets parent_id on the moved node and persists the reindexed target-group order.
// siblingOrder: the full ordered list of the target group's child ids AFTER the move
// (including the moved node), used to write order = index for each.
export async function movePage(
  supabase: SupabaseClient<Database>,
  input: { id: string; newParentId: string | null; siblingOrder: string[] }
): Promise<void>
```

Persistence: update the moved row's `parent_id`, then update `order` for each id in `siblingOrder` to its array index (batched per-id updates or an upsert; all scoped to the current user + workspace).

### Pure helpers (in `src/lib/rail/tree.ts`, jest-tested)

- `isDescendant(rows, nodeId, maybeAncestorId): boolean` — cycle guard (walk `parent_id` up, or subtree down).
- `computeMove(rows, draggedId, targetId, zone): { newParentId, siblingOrder } | null` — returns the new parent and the reindexed target-group id order; `null` for cycle or no-op. `zone ∈ 'before' | 'into' | 'after'`. Handles Life target (`targetId = LIFE_ID` → `newParentId = null`).

### Optimistic cache (in `src/lib/pages/tree.ts`)

- `applyMoveOptimistic(queryClient, workspace, { movedId, newParentId, siblingOrder })` — mirror `insertPageOptimistic`: set the moved row's `parent_id`, set `order` for the reindexed group, in the `['pages', workspace]` cache. Snapshot prior rows for rollback.

### Rail wiring (`Rail.tsx` + `RailView`/`TreeRow`)

- Drag state: `draggingId`, `dropTarget { id, zone }`.
- `TreeRow` gets `draggable`, `onDragStart`, `onDragOver` (compute zone, set drop state, `preventDefault` to allow drop), `onDragLeave`, `onDrop`, `onDragEnd`, plus `isDragging`/`dropZone` props for visuals.
- On drop: call `computeMove`; if `null`, abort. Else `applyMoveOptimistic`, expand target on _into_, then `movePage` via the existing `withUser`/`createClient` pattern; on failure restore the snapshot + `notify("Couldn't move …")`, then `invalidateQueries(['pages', workspace])`.

## Acceptance Criteria

1. Dragging a page onto the **middle** of another row moves it to be that row's last child; the target auto-expands and the moved page is visible nested under it. Persists across refresh.
2. Dragging onto the **top ¼** of row B places the dragged page as a sibling immediately **above** B under B's parent; onto the **bottom ¼**, immediately **below** B. Order persists across refresh.
3. Dragging onto the **Life root** makes the page top-level (`parent_id = null`), appended after existing top-level rows.
4. Dropping a page **into its own subtree** (itself or any descendant) is rejected: no drop-line shown on those rows during dragover, and dropping performs no mutation.
5. Dropping a page **into a leaf** page turns that leaf into a folder (caret appears, dragged page nested inside).
6. A **no-op** drop (onto self, or a slot producing identical parent+position) performs no network write and no cache change.
7. **Optimistic + rollback:** the move is reflected in the rail instantly; if the persistence call fails, the tree reverts to its pre-move state and a "Couldn't move …" notice appears.
8. A plain **click** on a row still navigates to that page (drag does not hijack click).
9. The moved row **dims** while being dragged; the drop-line / into-highlight render correctly per zone.
10. After a move, `order` values in the target sibling group are dense `0..N-1`; the old parent group still sorts correctly.
11. All existing rail keyboard/tree behavior (`treeKeyCommand`, reveal, delete, add-child) is unchanged.
12. New pure helpers and `movePage` covered by tests; full jest suite green; `tsc` clean; `eslint` clean.

## Testing Plan

| Layer                 | What                                                                                                                              | Count |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Unit                  | `isDescendant` (self, direct child, deep descendant, unrelated)                                                                   | +4    |
| Unit                  | `computeMove` (into / before / after / Life-into / cycle→null / no-op→null / reindex correctness / leaf-into)                     | +8    |
| Unit                  | `applyMoveOptimistic` (parent_id set, group reindexed, idempotent, snapshot restore)                                              | +3    |
| Integration/Component | Rail DnD: dragstart→dragover zone→drop calls movePage with expected args; failure path restores + notifies; click still navigates | +4    |

E2E: manual `/verify` in the running app on `:3000` (drag across a few real moves + refresh persistence) — no Playwright image diff per project QA norm.

## Rollback Plan

Pure additive feature. Revert the branch/PR. No schema migration (uses existing `order int`). No data backfill; reindex is opportunistic and self-healing, so partial adoption is safe.

## Effort Estimate

~0.5 day: pure helpers + tests (~1.5h), `movePage` + optimistic mutator (~1h), Rail/TreeRow DnD wiring + visuals (~2h), component tests + `/verify` (~1h).

## Files Reference

| File                                      | Change                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/rail/tree.ts`                    | + `isDescendant`, `computeMove` (pure, tested)                                 |
| `src/lib/rail/tree.test.ts` (or existing) | + unit tests for the above                                                     |
| `src/lib/pages/client.ts`                 | + `movePage`                                                                   |
| `src/lib/pages/tree.ts`                   | + `applyMoveOptimistic` (mirror `insertPageOptimistic`)                        |
| `src/components/organisms/Rail.tsx`       | drag state, drop handlers, `movePage` call, optimistic + rollback, auto-expand |
| `TreeRow` (in `Rail.tsx`)                 | `draggable` + drag/drop handlers + `isDragging`/`dropZone` visuals             |

## Out of Scope

- Keyboard-accessible move (cut/paste-into). Pure helpers make it a cheap additive follow-up; not this ticket.
- Spring-loaded folders (auto-expand on hover during drag). Expand-on-drop only.
- Multi-select drag; dragging pages out to other workspaces; undo toast.
- Any Database-Primitive work (collections/views/relations) — separate epic (#16–20).

## Related

- #9 (this), #8 (F26 create-placement, shipped), roadmap Epic A in `wayfinder/ROADMAP-notion-parity.md`.
