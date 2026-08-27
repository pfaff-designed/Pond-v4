---
id: 22
label: ux-audit:finding
status: resolved
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

## Resolution (2026-08-27)

The reproduction confirmed the root cause: **Workout Routines is a `type: 'area'`
node that carries its own blocks (the accepted "Consistency beats intensity" text)
AND a child page** — the DocumentPanel type-switch routed any `area` straight to
the OverviewSurface, so its blocks had no route to screen. The editor branch,
symmetrically, never showed a node's children at all. Both halves were blind.

**One surface now honours both.** DocumentPanel's type-switch is decided per node:

- **Pure area / container (no blocks)** → the calm Press overview, unchanged — its
  focal-numeral treatment earns its place. A new quiet **"+ Add content"**
  affordance sits beside "ask Pond"; clicking it adds a text block, which flips the
  node to the composite below (so a container can always gain content).
- **Any node WITH blocks (or a non-area with children)** → the full editor (title +
  blocks + "+ Add text", identical capability to before), with the **"Everything
  within" children grid rendered below it**, collapsing to nothing when childless.

**Render order — content above, children below.** Decided from the observed
failure: Workout Routines' accepted edit must be visible the instant the node
opens, so the page's own blocks lead and its sub-pages read as a quiet index
beneath. Verified live: opening Workout Routines now shows the intro text, the
accepted "Consistency beats intensity" block, "+ Add text", then the
"3-Day Full-Body Dumbbell Routine" child card.

**Add-content affordance.** The editor's existing "+ Add text" is the affordance
for a node that already shows the editor. For a pure area (which shows the overview,
not the editor) the new header-level "+ Add content" button bridges the gap —
adding the first block promotes the node to the composite editor+grid surface.

### Atomic-design changes

- **New molecule `ChildrenGrid`** (`src/components/molecules/ChildrenGrid.tsx`) — the
  "Everything within" label + card grid, extracted from OverviewSurface so the
  overview and the editor share one grid (can't drift). Renders nothing when empty.
  Story + story tests: Default / NoLabel / Empty.
- **`OverviewSurface`** refactored to render its grid through `ChildrenGrid` (label
  kept inline so its rise animation is byte-identical); added optional
  `onAddContent` header affordance; exported `useOpenCard`. New story
  `WithAddContent`.
- **`DocumentPanel`** reads the `['pages']` tree to derive this node's children,
  applies the decision tree above, and renders the shared `ChildrenGrid` beneath the
  editor.

### Validation

`npm run typecheck` clean · `npm test` 315 passed · `npm run test-storybook` 63
passed · `npx eslint` clean on every touched file · live browser-verified against
the exact reproduction (Workout Routines shows content + children; pure Health area
unchanged + gains "+ Add content").
