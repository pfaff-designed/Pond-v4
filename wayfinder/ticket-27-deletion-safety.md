---
id: 27
label: ux-audit:finding
status: resolved
blocked-by: []
blocks: []
---

# Deletion is scary in the wrong way — no trash, no undo, native confirm

## Problem

- Every rail row exposes an always-available `×`; page deletion runs a
  **native browser `confirm()`** ("Delete "Untitled"? This cannot be undone.")
  — and it means it: no trash, no undo toast, hard delete of the subtree.
- Every block in the editor likewise has an always-visible `×` with (from the
  affordance) no confirm or undo at all.
- The confirm doesn't state blast radius — deleting Health would read the same
  as deleting an empty page, while actually dropping every descendant.

For a premium app this is both a polish gap (native dialog) and a trust gap
(one misclick + muscle-memory confirm = lost subtree).

## Direction (not yet designed)

- **Soft delete / trash** with restore (schema likely just `deleted_at` on
  `pages`); undo toast on both page and block deletion.
- In-app styled confirm that states the blast radius ("deletes 3 pages
  inside") — only for subtrees; leaf/block deletes can go straight to
  undo-toast, no modal.
- Reconsider always-visible `×` on rail rows (hover-reveal or overflow menu).

## Build notes

Confirm dialog is a molecule (Storybook story + story test); rail/editor
changes in their organisms. Atomic design per ticket-13.

## Origin

Hands-on UX audit, 2026-08-27 — hit live when deleting the audit's throwaway
"Untitled" page.

## Resolution (2026-08-27)

**status: resolved.** Deletion is no longer scary in the wrong way — the native
`confirm()` is gone, subtree deletes state their blast radius, and every leaf /
block delete is undoable. This pass is the _orchestrator-scoped_ version: **no DB
migration, no `deleted_at` trash** — that stays DEFERRED (see caveat below).

### What shipped

1. **Styled confirm for subtrees, blast-radius honest.** Rail page deletion now
   routes on descendant count: a page _with_ a subtree opens a Press-aesthetic
   `ConfirmDialog` (molecule, on base-ui `AlertDialog` — focus trap, Esc,
   `role="alertdialog"`) whose body states the _real_ count —
   `"Deletes N pages inside."` (singular at 1). Deleting Health no longer reads
   like deleting an empty page. Leaf pages skip the modal entirely.

2. **Undo toast on leaf + block delete.** Both open an `UndoToast` (molecule)
   with a draining grace-window bar (~6s) — but their mechanics differ, stated
   honestly:
   - **Leaf page (rail): true deferred commit.** The row is surgically dropped
     from the tree cache at once and the destructive `deletePage` write is _held
     back_ until the window elapses or the toast is dismissed. **Undo** cancels
     the pending write and re-inserts _only that row_ (then reconciles by
     refetch — the DB row still exists during the window).
   - **Editor block: NOT deferred — undo-by-reinsert.** The block removal
     persists _immediately_ via the editor's normal debounced save; nothing is
     held back. **Undo** re-inserts the block at its original index and re-saves.
     The grace window here is purely the undo affordance's lifetime, and no
     crash-window claim applies to blocks (a crash after the save simply leaves
     the block deleted, as any other committed edit would be).

3. **Rail × / + become hover-reveal + keyboard/touch reachable.** The row CRUD
   affordances rest at `opacity-0` and reveal on `group-hover`,
   `group-focus-within`, and the control's own `focus-visible` (with a focus ring)
   — so they're reachable by keyboard/AT without a pointer, not permanently
   shouting on every row. Same treatment applied to the editor block-delete ×.

4. **Same undo for block delete in the editor** — wired where block deletion
   already lives (`DocumentPanel.removeBlockAt`), composable with the t20/t23
   text-module + `SiblingBlocksProvider` changes (untouched).

### Design decisions

- **Undo mechanics — client-side deferred commit.** Core is a pure,
  timer-injectable `scheduleDeferredCommit` (`src/lib/deletion/deferred-commit.ts`):
  it holds the write behind a grace window; `undo()` cancels, `flush()` commits
  early, both idempotent and undo-wins-over-flush. A single React
  `DeletionUndoProvider` (workspace layout) owns the toast queue + viewport and
  exposes `stageDeletion` / `notify` / `flushScope` via the `useDeletionUndo`
  context hook. Rail leaf-delete and DocumentPanel block-delete both drive it.
- **⚠️ CRASH-WINDOW CAVEAT (honest — no durability claimed; applies to RAIL
  leaf-page deletes only).** The rail path is _client-side deferral_, NOT durable
  soft-delete. During the ~6s window the row is gone from the UI but still exists
  in the DB; the destructive write only lands when the window closes. If the tab
  closes/crashes mid-window the delete simply never happens — the row survives
  and reappears on reload (safe: nothing lost, but the reverse of "guaranteed
  committed"). On provider unmount pending deletes are _flushed_ so a settled
  user action isn't silently resurrected. Block deletes make no such claim —
  they persist immediately (see What shipped #2). A durable `deleted_at` trash
  with restore would remove the window — **DEFERRED** to a later pass (needs the
  schema migration explicitly out of scope here).
- **Count computation.** Blast radius = `countDescendants` (children →
  grandchildren → …, node itself excluded) over the in-memory rail tree, matching
  the DB `on delete cascade` FK. `needsConfirm(count) = count > 0` is the single
  seam deciding modal-vs-straight-to-undo. All pure, in
  `src/lib/deletion/blast-radius.ts`, jest-covered.
- **Atomic design.** `ConfirmDialog` + `UndoToast` are molecules with Storybook
  stories + story tests (the confirm story asserts the blast-radius copy; the
  toast story exercises Undo and Dismiss). Reused the existing base-ui dep +
  `buttonVariants` rather than adding a dialog/toast library.

### Review fixes (same day)

Code review surfaced five correctness defects, all fixed:

- **Surgical undo restore.** Undoing deletion A used to restore a whole
  pre-delete cache snapshot — resurrecting any concurrently-deleted row B. Now
  undo re-inserts _only_ the deleted row (`row-cache.ts`), duplicate-safe, then
  reconciles by refetch.
- **Undo can no longer race the commit timer.** `performUndo` (in
  deferred-commit.ts) runs the restore _only_ if the undo actually beat the
  window; a click landing after the commit fired is a no-op instead of racing
  the in-flight `deletePage`.
- **Block toasts can't leak across pages.** `DocumentPanel` is layout-level and
  never unmounts on `?nodeId` change, so pending block toasts are flushed via
  `flushScope('block')` whenever the open page changes — Undo can never insert
  page A's block into page B.
- **Commit failure handling.** If the deferred `deletePage` rejects, the removed
  row is restored to the cache, the tree re-fetched, and a notice toast
  ("Couldn't delete …") shown. The commit also re-reads the _current_ selection
  (ref) instead of a value captured up to 6s earlier.
- **One shared toast viewport.** A single `DeletionUndoProvider` in the
  workspace layout owns the toast queue and renders one viewport, absolutely
  positioned bottom-right of the content row — clear of the AI terminal at any
  drawer height, and concurrent rail/editor toasts stack instead of overlapping.

Wiring-level jest coverage was added for the two races (second-delete clobber,
undo-after-commit) plus provider lifecycle and `flushScope`.

### Deferred / not in this pass

- **Durable soft-delete / trash (`deleted_at` + restore).** DEFERRED — needs a DB
  migration, explicitly out of orchestrator scope. The undo here is the
  client-side stopgap; the crash-window is the honest gap it leaves.
- Multi-item / bulk delete, a trash bin surface, and time-travel restore.

### Validation

- `npm run typecheck` — clean.
- `npm test` (jest) — 341 passed (incl. `deletion-blast-radius`,
  `deferred-commit`, and the wiring-level `deletion-undo-wiring` suites covering
  count logic, undo/flush/window state, both review races, and provider
  lifecycle/flushScope).
- `npm run test-storybook` — 17 files / 66 tests passed (incl. ConfirmDialog +
  UndoToast stories; CancelCloses asserts the dialog visibly closes).
- `npm run build` — succeeds.
- Lint: touched files clean; the ~80 pre-existing problems (charts + proto) are
  identical to main and untouched here.
