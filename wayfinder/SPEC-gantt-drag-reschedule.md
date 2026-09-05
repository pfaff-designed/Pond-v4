# Spec — Gantt drag-to-reschedule

**Status:** awaiting sign-off · **Author:** this session · **Fast-follow to:** #27 (gantt view, epic #26)
**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` · single Next.js app, shadcn + atomic + Storybook

## Goal

Make gantt bars draggable to reschedule, matching the board/calendar "direct optimistic
write, bypass the AI" pattern (decision 17). Today `CollectionGantt` (`view.tsx:572`) is
read-only — bars are inert. This spec makes them **move** and **edge-resize** in an editable
host.

## Resolved decisions (from the grill)

1. **Gestures = move + edge-resize.** Drag the bar body → shift Start+End together by the same
   day delta (duration unchanged). Drag the left edge → change Start only. Drag the right edge →
   change End only.
2. **Drag-only.** No keyboard/non-drag path this pass (matches the board/calendar fast-follow;
   revisit a11y later). Bars keep `role="img"`; their `aria-label` re-renders with the new span
   after a commit.
3. **Freeze the axis during a drag.** Snapshot `{rangeStart, totalDays, trackWidthPx}` at
   pointer-down and hold it for the whole gesture so the dragged bar tracks the pointer 1:1;
   recompute the range only on drop (natural re-render from the new dates).

## Resolved sub-branches (defaults chosen — flag any you'd change)

- **Edge-cross / min span:** the dragged edge cannot cross the other; minimum span is **1 day**
  (Start stops one day before End, and vice-versa). Move never changes duration. (Render already
  clamps End < Start → single-day tick as a backstop.)
- **Milestone rows (has a Start, no End value) when an End property exists:** right-edge resize
  **creates** an End (writes `endDef`), turning a tick into a span. Left-edge/body still shift
  Start.
- **Single-date collections (`endDef` undefined):** there is nowhere to store an End, so
  **resize is disabled** — bars are move-only single-day ticks. No `ew-resize` edges rendered.
- **Narrow bars:** edge hit-zones are ~6px each side. Below ~18px rendered width the bar is
  **move-only** (edges suppressed) so the target isn't fiddly.
- **Writes:** move = up to two `setValue` calls (Start + End); resize = one (the dragged edge's
  def). **Only write when the day-delta ≠ 0** (a click is not a reschedule).
- **Editable gating:** reschedule only when the host passes `editable` (page edit mode), exactly
  like board/calendar. A read-only host keeps today's inert bars.

## Architecture (mirrors existing seams)

1. **Pure math → `apply.ts`** (jest-tested, no DOM):
   - `pixelsToDays(deltaPx, trackWidthPx, totalDays): number` — signed day delta, rounded.
   - `shiftBar(bar, mode, dayDelta, endDef?): { startIso?, endIso? }` — applies the delta per
     gesture with the min-1-day clamp and the milestone/single-date rules above; returns only the
     fields that changed. Keeping this pure is what makes the interaction testable off-DOM
     (getBoundingClientRect is 0 in jsdom).
2. **New hook `use-gantt-bar-drag.ts`** — shaped like `use-pointer-bucket-drag.ts`: pointer burst
   in refs, React state only for the live visual, a travel threshold. Differences: it carries a
   `mode` ('move' | 'resize-start' | 'resize-end'), snapshots the frozen axis + track width at
   pointer-down, computes `dayDelta` via `pixelsToDays`, exposes the live working dates for the
   dragged bar, and calls `onCommit(rowId, changed)` on pointer-up (which maps to `setValue`).
3. **`CollectionGantt` (`view.tsx`)** gains `editable?` + `onEdit?`, threaded from `CollectionView`
   (already holds both) and `ViewView` (already has `setValue`/`editable`). Add a track ref for
   pixel width; render body-grab (cursor `grab`) + two edge handles (cursor `ew-resize`) when
   editable and `endDef` exists; the dragged bar renders from the hook's working dates over the
   frozen axis.

## Files

- `src/lib/modules/view/apply.ts` — add `pixelsToDays` + `shiftBar`.
- `src/lib/modules/view/apply.test.ts` — unit tests for both (deltas, rounding, min-span clamp,
  milestone→span, single-date move-only).
- `src/lib/modules/view/use-gantt-bar-drag.ts` — new hook.
- `src/lib/modules/view/view.tsx` — `CollectionGantt` editable rendering + wiring; pass `onEdit`
  through the gantt branch of `CollectionView`.
- `src/lib/modules/view/view.stories.tsx` — new `GanttReschedule` editable story (renders handles;
  drives a pointer drag with an injected track rect to prove wiring) + keep read-only inert.

## Verification

- **jest:** `pixelsToDays` + `shiftBar` (the clamp/milestone/single-date matrix).
- **storybook:** editable gantt shows handles; read-only host shows none.
- **live `/verify` on :3000:** move a bar; drag each edge; milestone → span via right edge;
  single-date collection is move-only; axis holds steady mid-drag then reflows on drop; reload
  persists the new dates.
- **`/code-review` two-axis** on the branch before merge.

## Out of scope

Keyboard reschedule, multi-bar/lane selection, dependency arrows, snapping to anything but days,
cross-collection (linked) views.

## Post-review resolutions

- **Narrow-bar rule — implemented.** `CollectionGantt` measures the shared flex-1 track via a
  `ResizeObserver` (callback ref on the first row's track) and suppresses both edge handles when a
  bar's rendered width falls below `NARROW_BAR_PX` (18) → move-only. Unmeasured (0) shows edges.
- **Freeze-axis (accepted as-is).** `rangeStart`/`startDay` read live per render rather than being
  snapshotted in the drag session. Safe because the row data `layoutGanttBars` reads is unchanged
  mid-gesture (drag previews locally, commits on pointer-up), so the axis can't reflow under the
  pointer. Not worth threading a snapshot through for a structural invariant that already holds.
- **Milestone left-edge (accepted as-is).** Milestones/ticks expose body-move (shifts Start) and a
  right-edge extend, but no left-edge handle — there is no span to shrink until an End exists.
  Moving covers start-shift; adding a dedicated left handle would duplicate that affordance.
