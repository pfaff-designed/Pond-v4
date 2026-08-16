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

## Phase 5 — DONE (session 9, 2026-08-15). Reworked to atomic decomposition.

Built + verified green + live-verified, **not yet committed at time of writing**
(commit is the next step). Rather than cram the wiring into `AITerminal` (the
handoff's original instruction below), it was decomposed bottom-up per the repo's
atomic-design + Storybook workflow:

- **Layer 0 — pure helper** `src/lib/modules/preview.ts`: `previewForChange(change,
blocks) → { op, before, after }`. Isolates the placeholder-id gotcha (step 2) out
  of the organism; jest-tested (`src/__tests__/change-preview.test.ts`, 7 cases incl.
  type-morph + nested todo ids + non-mutation). `PREVIEW_ID = '__preview__'`.
- **Layer 1 — atom** `src/components/atoms/ProposalActions.tsx`: the Accept/Edit/Reject
  row + resolved status line, extracted from `ModuleDiffCard`. `onEdit` optional,
  relabellable (`Accept all`/`Reject all`), `divider` toggle. + stories.
- **Layer 2 — molecules**: `ModuleDiffCard` refactored to consume the atom (existing
  stories = regression proof); **new** `src/components/molecules/ProposalGroup.tsx` —
  card stack + group bar, partial accept first-class, bar hidden for a single change /
  once all resolved. + stories.
- **Layer 3 — organism** `AITerminal.tsx`: `ProposeChangesPart` type+guard,
  `changeDecisions` keyed `` `${toolCallId}:${index}` `` (step 4), builds previews via
  the helper, `writeAcceptedChanges` → `applyProposedChanges` → `commitBlocks` →
  invalidate `['page', nodeId]`, `changeSkipped` surfaces the `skipped > 0` notice.

**Verify:** tsc + eslint clean; jest 22/22; storybook-vitest 17/17. **Live-verified**
against the running app (Browser Test page): a 2-change create batch rendered as a
`ProposalGroup`, Accept-all wrote both blocks with real minted UUIDs + "Saved", and a
single-change Reject wrote nothing (no group bar for a single change). Test blocks
cleaned up.

**Two code-review findings, both deferred to Phase 6 (they ARE Phase 6's job):**
(1) legacy `DiffCard.tsx` still inlines the footer that `ProposalActions` now owns —
duplication resolves when `DiffCard` is deleted. (2) the composition path drops the
`reason` line the `propose_edit` path shows — `changeSchema` has no `reason` field, so
adding parity is a server-contract change (its own small task). Sharp edge: partial
accept re-fetches fresh blocks each time, so an edit/remove whose target a prior accept
already consumed counts as `skipped` and can fire a spurious "couldn't apply" notice.

---

### Original plan (superseded above — kept for reference): wire AITerminal (branch 6 + 7)

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

## Phase 6 / cleanup (after Phase 5 is live) — now the priority; review findings land here

- Collapse `propose_edit` into `propose_changes`; delete the old tool, its `AITerminal`
  handling (the `ProposeEditPart`/`proposalDecisions`/`writeAcceptedEdit`/`handleEditProposal`
  stack), and the now-unused `DiffCard` + `applyProposedEdit`. **This kills both standing
  review findings at once:** the `DiffCard` footer duplication (fold onto `ProposalActions`
  by deletion) and the parallel decision-map/write-handler stacks in `AITerminal`.
- **Restore the `reason` line on the composition path.** `propose_edit` shows a per-proposal
  `reason`; `propose_changes` currently can't (no field in `changeSchema`). Add an optional
  `reason` to each `changeSchema` variant, thread it through `ChangePreview` →
  `ProposalGroup` → `ModuleDiffCard` (which already accepts `reason?`). Server-contract
  change — model-facing, so re-verify the model actually populates it.
- Wire `experimental_repairToolCall` (ai@7 supports it) — verify against a live model; it's
  a self-correction enhancement on top of the strict `inputSchema` gate already in place.
- Full verify (tsc / jest / storybook / eslint).

## Watch / deferred

- **metric-ring `pct`** stays presentation-shaped (not `value`+`target`). Resolve only if
  Phase 5's AI needs to compose a ring against a target.
- **Bare reorder** is awkward — `edit` requires `data`, so a pure move re-emits full block
  data. Faithful to branch 3 but revisit if reorder becomes common.
- **`hydrateBlock` typing** (`unknown` + cast) left defensive on purpose; optional cleanup.
