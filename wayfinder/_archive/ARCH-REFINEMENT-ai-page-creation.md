# Architecture Refinement — AI Page Creation arc

_Reviewer pass, 2026-08-17. Repo `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`, branch `main` @ `f56568b` (clean). Arc commits: `315ce52` (M0 routing/prompt), `800e0fa` (M1 create_page + proposal card), `b70e3b4` (M2 editing eval), `f56568b` (M3 table block + context-serialization fix)._

Method: followed the `/improve-codebase-architecture` process (explore for friction → deepening candidates → prioritized recommendation), using `/codebase-design` vocabulary (**module, interface, depth, seam, adapter, leverage, locality**) for the architecture and `CONTEXT.md` terms (**module, block, page, host, slot, composition**) for the domain. No ADRs exist (`docs/adr/` absent); nothing to re-litigate. **This is a report — no source files were changed.** Output format follows the skill's candidate-card structure, rendered as markdown (this is a persisted background artifact, not the interactive HTML-and-grill flow the skill defaults to).

Legend: **module** = a registered `schema + renderer` pair keyed by `type` (CONTEXT.md); **descriptor** = the server-safe half `{ type, schema, description }` (`modules/types.ts`); **block** = a content module in a page's `blocks[]`.

---

## Executive read

The arc's **render seam is deep and clean** — the UI never branches per block type (every surface dispatches through `ModuleView`/`ModuleDiffCard` by `type` string). The arc's **AI-serialization seam is shallow and scatter-prone** — the knowledge "what is a block of type X" is smeared across 8 files / 11–12 edit sites, and two of those sites fail _silently and destructively_ when a new block type is forgotten. The seeded finding (make context serialization a required descriptor facet) is the highest-leverage fix and is correct; it should be widened to cover a small family of per-type facets that share the same defect shape.

The one real bug of the night (table edits silently deleting rows) was not a model failure — it was a **missing `blockPreview` case**, i.e. a shallow-module omission that the type system did not catch. That is the signal this report is built around.

---

## Candidate 1 — Lift block serialization into the ModuleDescriptor (registry-enforced)

**Strength: `Strong`** · category: `in-process`

**Files**

- `src/lib/context/assemble.ts` — `blockPreview` (L101–120), `blocksToText` (L70–88)
- `src/lib/modules/types.ts` — `ModuleDescriptor` (L26–31)
- `src/lib/modules/registry.ts` — `moduleDescriptors` (L18–25)
- each `src/lib/modules/<type>/schema.ts` (descriptor definitions)

**Problem**

A block type's "how do I read this into text for the model" logic lives in two hand-maintained `switch`es in `assemble.ts`, detached from the module it describes. Both fall through to `default: return ''`. Forgetting a case is invisible at compile time and **data-destroying at runtime**: the `edit` op replaces a block wholesale (`edits.ts:86`), so if the model can't see a block's current content in the injected context, it re-emits a partial block and the omitted rows/items are lost on accept. This is exactly the table bug (`JUDGEMENTS` §"The one real bug"). The two switches have **already diverged** — `blocksToText` still lacks `metric-ring` and `table` cases (`assemble.ts:82`), so the document-body injection used for the current node _and_ every @mentioned node silently drops those blocks' content today. The bug the arc fixed in `blockPreview` still exists, uncaught, in its twin `blocksToText`.

The `ModuleDescriptor` (`types.ts:26`) already carries `schema` and `description` as required, registry-enforced facets and is already the server-safe artifact the AI and the server-side write path read. Serialization belongs there.

**Solution**

Add a required `serialize(data): string` facet to `ModuleDescriptor` (or a required `{ preview, body }` pair). Move each block's `blockPreview`/`blocksToText` arm into its own `schema.ts` descriptor. `assemble.ts` calls `descriptor.serialize(block)` — no `switch`, no `default: ''`. Because the facet is required on the descriptor and `moduleDescriptors` is `satisfies Record<string, ModuleDescriptor>`, a new module that omits it is a **compile error**, not a silent data-loss path.

**Before / After**

```
BEFORE — serialization detached from the module, unenforced
                                                   ┌─────────────────────────┐
  modules/text/schema.ts  ─ schema, description ──▶│  ModuleDescriptor       │
  modules/table/schema.ts ─ schema, description ──▶│  { type, schema, desc } │  (facets enforced)
                                                   └─────────────────────────┘
  context/assemble.ts
    blockPreview  switch(type){ text todo metric metric-ring table  default:'' }  ← hand-kept
    blocksToText  switch(type){ text todo metric                    default:'' }  ← DIVERGED, drops table
                              └── forget a case → silent, wholesale data loss on edit ──┘

AFTER — serialization is a required descriptor facet, one place per module
  modules/table/schema.ts ─ schema, description, serialize() ─┐
                                                              ▼
                                          ┌──────────────────────────────────┐
                                          │  ModuleDescriptor (deep)          │
                                          │  { type, schema, desc, serialize }│  ← compiler enforces
                                          └──────────────────────────────────┘
                                                              ▲
  context/assemble.ts  →  descriptor.serialize(block)  ───────┘   (no switch, no default:'')
```

**Wins**

- locality: a block's serialization lives with its schema
- leverage: one facet, read by preview + body + future surfaces
- forgetting a new type becomes a compile error, not silent data loss
- kills the `blocksToText`/`blockPreview` divergence in one move
- `default: ''` — the silent-omission fallback — is deleted

**Deletion test** — delete `blockPreview`: complexity does not vanish, it reappears at N call sites (preview listing, @mention body, future export). It earns its keep — but it belongs _on the module_, not floating in `assemble.ts`.

**Note on the alternative** the judgements doc flagged: a lint rule / exhaustiveness `switch` with a `never` default would also make omission a compile error and is cheaper. It is strictly worse on locality — the arm still lives in `assemble.ts`, away from the module — and does nothing for the second surface (`blocksToText`) unless duplicated. The descriptor facet fixes both surfaces and both bugs with one seam. Recommend the facet; accept the exhaustive-`switch` only as a `<½ day` stopgap if the facet can't land this week.

---

## Candidate 2 — Localize nested-id handling to the module (kill the five-site ladder)

**Strength: `Worth exploring`** · category: `in-process`

**Files**

- `src/lib/modules/ai-composition.ts` — id-strip per type (L38–46)
- `src/lib/modules/hydrate.ts` — id-mint per type (L23–28)
- `src/lib/modules/preview.ts` — display id-stamp per type (L41–52)
- `src/components/molecules/CreatePageProposalCard.tsx` — card id-stamp (`withPreviewIds`, L66–77)

**Problem**

The single fact "a `todo` has id-bearing `items`; a `table` has id-bearing `rows`" is encoded **five times**, as four independent per-type `if`-ladders plus one omit-chain:

1. `ai-composition.ts` — strips nested ids so the AI never mints them
2. `hydrate.ts` — mints real nested ids on the write path
3. `preview.ts` — stamps placeholder nested ids for the diff card
4. `CreatePageProposalCard.tsx` — stamps placeholder nested ids for the create card

These must stay in lockstep. They already do not: `CreatePageProposalCard.withPreviewIds` (L66–77) has a `todo` branch but **no `table` branch** — a create-page proposal containing a table renders its rows without stable ids, a latent defect the arc introduced alongside the table block. Every one of these files carries a comment admitting the smell (`hydrate.ts`: "small documented special cases … ship flat, refactor when it hurts, t12 §5"). The arc added a `table` arm to three of the four and forgot the fourth — the exact failure mode this pattern guarantees.

**Solution**

Give each block that owns nested id-bearing collections one declared fact — e.g. a descriptor facet naming its nested-id paths (`nestedIdPaths: ['rows']`) or a `stripIds` / `mintIds` pair. The four call sites become one generic walk over that fact. Two adapters already justify the seam (write-time minting vs display-time stamping); a third and fourth (strip, card) confirm it is real, not hypothetical.

**Before / After**

```
BEFORE — one fact, five hand-kept copies
   "todo.items and table.rows carry ids"
      ├─ ai-composition.ts   omit id from items/rows      ✓ table
      ├─ hydrate.ts          mint real ids                ✓ table
      ├─ preview.ts          stamp __preview__ ids        ✓ table
      └─ CreatePageProposalCard.withPreviewIds            ✗ table  ← forgotten → latent bug

AFTER — one fact, declared on the module
   modules/table/schema.ts  →  nestedIdPaths: ['rows']
                                     │
        one generic id-walk ────────┴──────▶ strip · mint · preview-stamp · card-stamp
```

**Wins**

- locality: nested-id shape declared once, on the block
- leverage: one declaration, four call sites converge
- the `CreatePageProposalCard` table gap closes automatically
- `preview.ts` and `CreatePageProposalCard` id-stamp logic collapse into shared code

**Deletion test** — delete the `hydrate.ts` table arm: rows persist without ids, breaking table editing. It earns its keep — but the _knowledge_ it encodes is duplicated four ways and should live on the module. This is smaller-scale than Candidate 1 and can ride behind the same descriptor-facet seam.

---

## Candidate 3 — Make the "add a module" contract honest (registry-derive the unions, or exhaustiveness-check them)

**Strength: `Worth exploring`** · category: `in-process`

**Files**

- `src/lib/modules/renderers.tsx` (L20–24 comment), `registry.ts`, `content.ts` (L22–28), `ai-composition.ts` (L48–54)

**Problem**

`renderers.tsx` documents the contract: _"Adding a module = one folder + one line here (and one in `registry.ts`)."_ After the arc this is **false**. Adding a content block type now requires editing 8 files across 11–12 sites (confirmed by full-file read): the module folder (schema + view — legitimate), plus `registry.ts`, `renderers.tsx`, `content.ts` (`blockSchema` union), `ai-composition.ts` (`moduleDataSchema` id-stripped union), `assemble.ts` (`blockPreview`; Candidate 1), and — if nested ids — `hydrate.ts` + `preview.ts` + the create card (Candidate 2). Two of these (`blockSchema`, `moduleDataSchema`) are hand-maintained discriminated unions the code comments justify as "intentional — Zod discriminated-union construction from a registry isn't ergonomic." That justification is real for the _union type_, but nothing enforces that the union stays in sync with `moduleDescriptors`; a type added to the registry but not to `moduleDataSchema` compiles fine and is silently un-composable by the AI.

**Solution**

Two tiers, pick by appetite:

- **Cheap:** add a type-level exhaustiveness assertion that every `DescriptorType` (from `registry.ts`) appears in `moduleDataSchema` and `moduleRenderers`. Omission becomes a compile error. Keeps the hand-written unions; just fences them.
- **Deeper:** derive `moduleDataSchema` and `blockSchema` from the registry via a small helper that maps `moduleDescriptors → discriminatedUnion`, so the unions have no hand-maintained membership at all. Higher effort, resolves the ergonomics complaint the comment raises rather than working around it.

Fold the render+descriptor into a single registration site so the true contract matches the documented one, then update the `renderers.tsx` comment to state the real cost.

**Wins**

- leverage: one registration, N derived artifacts
- registry membership stops drifting from the unions
- the documented contract becomes true again
- exhaustiveness turns four silent omissions into compile errors

**Deletion test** — the unions are not deletable (they _are_ the type surface), but their hand-maintained _membership_ is the shallow part: it duplicates `moduleDescriptors`' key set. Concentrate that membership in one place.

---

## Seam assessments — what the arc got right (preserve, do not refactor)

These are deep seams the arc built or reinforced. Flagged so a future refinement pass does not "consolidate" them into something worse.

- **`chat/tools.ts` + `chat/prompt.ts` extraction (M0).** Descriptions and schemas live in `tools.ts`; the system prompt in `prompt.ts`. The routing/editing/repair evals import the **exact same** `buildSystemPrompt`, `createPageTool`, `proposeChangesTool` production runs (`eval-routing.impl.mts`). This is "the interface is the test surface" done right — the eval crosses the same seam production does, so a prompt regression is a failing eval, not a silent drift. `route.ts` correctly retains only `fetch_context`'s `execute` closure (it captures the per-request supabase client + user — correct locality). **Deep. Keep.**

- **Render dispatch is fully generic.** `ModuleView` (`renderers.tsx:45`) and `ModuleDiffCard` dispatch by `type` string with a `differ`-then-`ModuleView` fallback; `CreatePageProposalCard` and `AITerminal` render proposed blocks through `ModuleView` with **zero** per-type branching. A new block type needs no UI edits. This is the payoff of the two-map registry (`t12`). The scatter in this report is confined to the _serialization/schema_ layer — the _render_ layer is clean. **Deep. Keep.**

- **`hydrateBlock` as the single accept-time gate.** Both accept paths — `edits.applyProposedChanges` (propose_changes) and `create-page.hydrateProposalBlocks` (create_page) — mint ids and re-validate through one `hydrateBlock` (`hydrate.ts`). No duplication between the two write paths. Note this is the _validation_ seam, distinct from the _nested-id_ smear in Candidate 2 (which is about _which fields_ to walk, not _whether_ to validate). **Deep. Keep the reuse; Candidate 2 only relocates the per-type knowledge, not the gate.**

- **Full-state edit contract.** `edit` replaces a block wholesale (`edits.ts:86`), matching the module `onChange` full-state contract (`types.ts:38–44`). This is a _correct_ design, not a bug — the bug was that the model couldn't _see_ the state to re-emit it (Candidate 1). Do not "fix" the wholesale replace into a field-merge; that would fork the edit contract away from the module contract. **Keep; Candidate 1 is the real fix.**

- **`repairToolCall` now has runtime evidence.** The brief listed `repairToolCall` as "typechecked only, no runtime evidence." The arc extracted it to `lib/ai/repair.ts` and added `eval-repair.mts` exercising it against a synthetic schema-invalid batch. **Gap closed.**

---

## Minor observations (not deepening candidates)

- **`props.kind` is an unmodeled free string.** `create-page.ts` stores page-kind (recipe/inventory/document/…) as `kind?: string` in `props.kind`, unvalidated. CONTEXT.md's domain does not yet name "kind." This is fine for now (the coarse `type` enum stays authoritative), but if `kind` starts driving rendering or placement it should graduate into a named domain term + a checked union. Watch, don't act.
- **Eval harness has no shared abstraction, by design.** The three evals share the `_launch.mts` alias-hook launcher but each defines its own scenarios/fixtures/assertions standalone. This is appropriate — they test different seams (routing vs batch-shape vs repair) and a premature shared "eval framework" would be a shallow module. The surgical-batch invariant in `eval-editing` (a batch may touch only allow-listed block ids) is a genuinely good test-design idea worth keeping as the pattern for future editing cases. No action.

---

## Prioritized recommendations

| #   | Candidate                                                          | Strength        | Effort                                                 | Why this order                                                                                                                                               |
| --- | ------------------------------------------------------------------ | --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Serialization → required `ModuleDescriptor` facet                  | **Strong**      | **~1–1.5 days**                                        | Fixes a _shipped, live_ silent-data-loss twin (`blocksToText` drops table + metric-ring today) and makes the whole class compile-enforced. Highest leverage. |
| 2   | Localize nested-id handling to the module                          | Worth exploring | **~1 day** (rides Candidate 1's seam)                  | Closes the already-present `CreatePageProposalCard` table gap; collapses a 4-copy ladder. Do with or right after #1.                                         |
| 3   | Honest "add a module" contract (exhaustiveness or registry-derive) | Worth exploring | **~½ day** (exhaustive-check) / **~1.5 days** (derive) | Fences the manual unions so registry drift is a compile error. The ½-day check is a strong cost/benefit; the derive is optional polish.                      |

**Top recommendation: Candidate 1.** It is the only finding that fixes a defect _currently shipped in `main`_ (the `blocksToText` omission of `table` and `metric-ring`, the exact bug the arc caught and fixed for `blockPreview` but not its twin), and it converts an entire class of "forgot a case → silent data loss" from a runtime hazard into a compile error. Candidates 2 and 3 are the same disease (per-type knowledge smeared off the module) at smaller scale and should ride the same descriptor-facet seam once it exists.

**Effort estimates** assume test-first work (each candidate has an obvious eval/jest target: Candidate 1 → an `eval`/jest case asserting `serialize` round-trips every registered type incl. `table`; Candidate 2 → a jest case asserting create-card and hydrate agree on nested ids; Candidate 3 → a type-level test that fails when a registry type is missing from a union) and exclude the `src/components/charts/` region (out of scope, vendored, untouched).
