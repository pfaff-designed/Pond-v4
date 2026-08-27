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

2. **Undo toast on leaf + block delete (deferred commit).** A leaf-page or
   editor-block deletion removes the item optimistically at once, opens an
   `UndoToast` (molecule) with a draining grace-window bar (~6s), and _defers the
   destructive write_. **Undo** cancels the pending write and restores the item
   exactly (rail: refetch, since the DB row still exists during the window; block:
   re-insert at its original index). **Dismiss** or window-elapse commits.

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
  early, both idempotent and undo-wins-over-flush. A React host hook
  `useDeletionUndo` owns the toast queue and wires each toast's Undo/Dismiss to a
  controller. Rail leaf-delete and DocumentPanel block-delete both drive it.
- **⚠️ CRASH-WINDOW CAVEAT (honest — no durability claimed).** This is _client-side
  deferral_, NOT durable soft-delete. During the ~6s window the item is gone from
  the UI but the DB row still exists; the destructive write only lands when the
  window closes. If the tab closes/crashes mid-window the delete simply never
  happens — the row survives and reappears on reload (safe: nothing lost, but the
  reverse of "guaranteed committed"). On unmount/route-change the hook _flushes_
  pending deletes so a settled user action isn't silently resurrected. A durable
  `deleted_at` trash with restore would remove this window — **DEFERRED** to a
  later pass (needs the schema migration explicitly out of scope here).
- **Count computation.** Blast radius = `countDescendants` (children →
  grandchildren → …, node itself excluded) over the in-memory rail tree, matching
  the DB `on delete cascade` FK. `needsConfirm(count) = count > 0` is the single
  seam deciding modal-vs-straight-to-undo. All pure, in
  `src/lib/deletion/blast-radius.ts`, jest-covered.
- **Atomic design.** `ConfirmDialog` + `UndoToast` are molecules with Storybook
  stories + story tests (the confirm story asserts the blast-radius copy; the
  toast story exercises Undo and Dismiss). Reused the existing base-ui dep +
  `buttonVariants` rather than adding a dialog/toast library.

### Deferred / not in this pass

- **Durable soft-delete / trash (`deleted_at` + restore).** DEFERRED — needs a DB
  migration, explicitly out of orchestrator scope. The undo here is the
  client-side stopgap; the crash-window is the honest gap it leaves.
- Multi-item / bulk delete, a trash bin surface, and time-travel restore.

### Validation

- `npm run typecheck` — clean.
- `npm test` (jest) — 330 passed (incl. new `deletion-blast-radius` +
  `deferred-commit` suites covering the count logic and undo/flush/window state).
- `npm run test-storybook` — 17 files / 65 tests passed (incl. new ConfirmDialog
  - UndoToast stories).
- `npm run build` — succeeds.
- Lint: touched files clean; the ~80 pre-existing problems (charts + proto) are
  identical to main and untouched here.
