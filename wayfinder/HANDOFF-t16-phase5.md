# HANDOFF — t16 Phases 1–4 done → Phase 5 next (AITerminal wiring + write path)

_Written 2026-08-15, session 8. Supersedes `wayfinder/HANDOFF-t16-phase4.md` (which
has the full data-layer detail). This session built and **committed + pushed** the t16
data layer (Phases 1–3) and the typed diff cards (Phase 4). Next session wires it into
the terminal (Phase 5)._

## TL;DR

t16 (AI module composition) is a 6-phase build. **Phases 1–4 are done, reviewed,
verified green, committed, and pushed** to `main`:

- `beb1948` feat — data layer (registry-derived tool schema, catalog, `applyProposedChanges`)
- `cff5a5b` docs — Phase 4 handoff
- `674ce7e` feat — Phase 4 typed diff cards (`ModuleDiffCard` + `TextDiffer`)

It is **not yet user-visible**: `AITerminal` still renders only the old
`tool-propose_edit` card. A compose request calls `propose_changes` and silently
no-ops until Phase 5 wires it. Verify path (Node 22, jest ts-node workaround, storybook
vitest) is in `HANDOFF-t16-phase4.md` — unchanged.

## What exists now (the pieces Phase 5 connects)

| Piece                                           | Where                                              | Role                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `propose_changes` tool                          | `src/app/api/chat/route.ts`                        | No-execute; strict `inputSchema` = emit-time server gate. Streams `{ changes: [...] }`.                                         |
| `moduleDataSchema` / `changeSchema`             | `src/lib/modules/ai-composition.ts`                | The `ModuleChange` shape (`op: create\|edit\|remove`, `blockId?`, `after?`, `data?`); ids stripped.                             |
| `applyProposedChanges(blocks, changes, mintId)` | `src/lib/pages/edits.ts`                           | The write transform: mints all ids, anchors, re-validates, skips malformed. Returns `{ blocks, applied, skipped }`.             |
| `ModuleDiffCard`                                | `src/components/molecules/ModuleDiffCard.tsx`      | Per-op typed card. Props: `op`, `before?: Block\|null`, `after?: Block\|null`, `reason?`, `status`, `onAccept/onReject/onEdit`. |
| `TextDiffer` + `differ` facet                   | `src/lib/modules/text/differ.tsx`, `renderers.tsx` | Typed body for `text`; other types fall back to read-only `ModuleView` inside the card.                                         |
| `commitBlocks`                                  | `src/lib/pages/commit.ts`                          | The shared persist tail (saveBlocks + invalidate `['pages']` + re-embed). **Do not add a new write handler.**                   |

## Next: Phase 5 — wire AITerminal (branch 6 + 7 accept-time gate)

Model on the **existing `propose_edit` handling in `AITerminal.tsx`** (the
`ProposeEditPart` interface, `proposals.map(...)` render, `proposalDecisions` local
state, `writeAcceptedEdit`) — Phase 5 is the `propose_changes` twin of all of it.

1. **Read the tool part.** Add a `ProposeChangesPart` type for `tool-propose_changes`
   (`input: { changes: ModuleChange[] }`). Render **one proposal message = a stack of
   `ModuleDiffCard`s**, one per change in `input.changes`.

2. **Build each card's `before`/`after` (the placeholder-id gotcha — this is the crux).**
   `ModuleDiffCard` takes id-ful `Block`s, but a proposed change carries **no id**
   (`change.data` is id-stripped). For each change:
   - `before` = the existing block from `currentPage.blocks.find(b => b.id === change.blockId)`
     for `edit`/`remove`; `null` for `create`.
   - `after` = a **preview block** = `{ ...change.data, id: '__preview__' }` (+ placeholder
     ids on nested todo items) for `create`/`edit`; `null` for `remove`. The preview id is
     display-only — never persisted.

3. **Accept path — per card + group.** Per-card Accept/Reject/Edit **plus group
   Accept-all / Reject-all**; **partial accept** allowed (accept a subset). On accept,
   collect the accepted `ModuleChange[]` and call
   `applyProposedChanges(page.blocks, acceptedChanges, () => crypto.randomUUID())` →
   `commitBlocks(supabase, queryClient, nodeId, result.blocks)` →
   `invalidateQueries(['page', nodeId])` (external write to the open page — same pattern
   as `writeAcceptedEdit`). This is the **accept-time client re-validation gate** (branch 7):
   `applyProposedChanges` already skips anything that fails `blockSchema`; surface a
   "couldn't apply" state if `result.skipped > 0`.

4. **Local decision state** keyed by `toolCallId` + change index (the no-execute client
   tool stays `input-available`, so drive the card `status` off local state exactly like
   `proposalDecisions` does today).

## Phase 6 / cleanup (after Phase 5 is live)

- Collapse `propose_edit` into `propose_changes`; delete the old tool, its `AITerminal`
  handling, and the now-unused `DiffCard` + `applyProposedEdit`.
- Wire `experimental_repairToolCall` (ai@7 supports it) — verify against a live model; it's
  a self-correction enhancement on top of the strict `inputSchema` gate already in place.
- Full verify (tsc / jest / storybook / eslint).

## Watch / deferred

- **metric-ring `pct`** stays presentation-shaped (not `value`+`target`). Resolve only if
  Phase 5's AI needs to compose a ring against a target.
- **Bare reorder** is awkward — `edit` requires `data`, so a pure move re-emits full block
  data. Faithful to branch 3 but revisit if reorder becomes common.
- **`hydrateBlock` typing** (`unknown` + cast) left defensive on purpose; optional cleanup.
