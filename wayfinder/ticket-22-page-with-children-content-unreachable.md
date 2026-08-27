---
id: 22
label: ux-audit:finding
status: open
blocked-by: []
blocks: []
---

# A page with children silently hides its own content

## Problem

The shell's type-switched view (shell-harvest slice 4) renders any node with
children as a folder overview — and its own blocks become unreachable:

- **Workout Routines** is a content page: an accepted proposal added the
  "Consistency beats intensity" text block to it (visible in the transcript,
  stamped `→ Workout Routines`, Accepted). But because it has one child
  (3-Day Full-Body Dumbbell Routine), opening it shows only the OverviewSurface
  ("1 page within, at a glance") — no route to its own blocks exists.

A user who accepts an edit to such a page can never see the result. Worse, the
transition is silent: give any leaf page a sub-page and its content vanishes
from view. This is a data-invisibility (perceived data-loss) path.

"Everything is a page" (ticket-02) means every node can hold blocks AND
children — the view contract must honor both.

## Direction (not yet designed)

- Render the page's own blocks on the same surface as the children grid
  (Notion's page + subpages model): document content above, "Everything
  within" below — or the inverse for area-flavored pages.
- Or: an explicit view toggle (overview ⇄ page) in the header. Weaker — default
  still hides one half.
- Decide what the pure areas (Personal/Health/…) do when they have no blocks:
  today's overview is exactly right for them, so the answer is likely
  "overview + content section that collapses to nothing when empty."

## Build notes

Touches `OverviewSurface` + `DocumentPanel` organisms and the type-switch in
the workspace shell. Atomic design per ticket-13; Storybook stories for any
changed organism states.

## Origin

Hands-on UX audit, 2026-08-27. Reproduce: open Health → Workout Routines.
