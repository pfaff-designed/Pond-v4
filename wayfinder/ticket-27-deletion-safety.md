---
id: 27
label: ux-audit:finding
status: open
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
