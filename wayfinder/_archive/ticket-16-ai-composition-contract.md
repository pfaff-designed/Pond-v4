---
id: 16
label: wayfinder:grilling
status: resolved
blocked-by: [12]
blocks: []
---

# AI module-composition contract

## Question

Give the AI the ability to properly use the components to _create_ things — the second half of the goal. Given the registry contract (t12), decide:

- Tool surface: generalize today's text-only `propose_edit` into typed-module payloads and add create/compose operations — or separate tools per operation (create_module / edit_module / compose_page)?
- Catalog-teaching: is the system prompt generated from the registry's AI-capability descriptions so a new module type auto-teaches the AI?
- Composition: how does the AI assemble multiple modules into a page/section while honoring "AI produces only on explicit request" and "never emits modules unprompted" (ticket-06, ticket-09)?
- Diff/review: how typed diff cards (t12 differ) present multi-module proposals in the terminal for Accept/Reject/Edit (extends ticket-10).
- Validation/safety: rejecting malformed AI output against module schemas before it reaches the panel.

Uses the current chat route + `propose_edit` tool and AITerminal/DiffCard as incumbent authority.

## Answer

Resolved by grilling (2026-08-09). Ground truth checked first: today's `propose_edit` is a **single-block, text-only, edit-only, client-resolved tool (no `execute`)** — `{blockId, newContent, reason}` → DiffCard → Accept → client `commitBlocks`/`applyProposedEdit` → Supabase `saveBlocks`. `create_node` makes _pages_ (area/project/routine/action), not blocks. The t12 registry is designed but **not yet built** (no `src/lib/modules/`), so t16 specs the contract that t12+t16 build together. Seven branches decided:

**1. Tool surface — one generalized tool emitting a targeted change list.** Generalize `propose_edit` into a single tool that emits `changes[]` — a batch of per-module operations. Considered and rejected: **(A) full-page-state** (AI re-emits the whole `blocks` array; differ diffs old vs new) — clobber risk + token cost on large pages, the page-level twin of t12's deferred ops tension; **(C) separate tools per op** (`create_module`/`edit_module`/`compose_page`) — tool sprawl, multi-op proposals fragment across calls. **(B) targeted change list** won: least churn from the incumbent, true multi-module proposals in one call (which the diff cards need to render as one unit), no clobber, flat-and-full-state _per module_ (honors t12). **Marked "for now"** — same refactor-when-it-hurts posture as t12; full-page-state / ops protocol stay deferred (see fog).

**2. Change entry shape — explicit `op`.** Each entry: `{ op: 'create' | 'edit' | 'remove', blockId?, type?, data? }`.

- **AI never mints IDs.** `create` omits `blockId`; the client mints a UUID on accept. `edit`/`remove` reference an existing ID from injected context (validated to exist). Kills the hallucinated/colliding-ID failure mode.
- **`edit` may type-morph** — swap `type` + `data` on the same ID, preserving identity + position. Handles "turn this into a todo list" as a single edit.
- The explicit `op` is **composition-level** (which blocks exist) — _not_ the within-module ops grammar t12 rejected; that decision stays closed.

**3. Composition & ordering — anchor-relative, flat, layout-agnostic.** Optional `after?: blockId` anchor on `create`/`edit`; `changes[]` **array order sequences the batch** (appends/same-anchor creates land in array order); default append (create) / keep position (edit). **No separate move op** — reorder is an `edit` carrying a new `after`. Composition stays a **flat ordered list** until `section` lands (t18); sections then arrive as just another container module the AI `create`s via recursive composition — same tool, no new mechanism.

**4. Catalog-teaching — both layers auto-generated from `moduleDescriptors`.** (a) The change `data` is a **Zod discriminated union** over all registered types (iterate the registry → `zod-to-json-schema` → tool input schema); the model structurally cannot emit an unknown `type` and sees each type's exact shape. (b) A **system-prompt "module catalog"** is assembled from each descriptor's one-line `description` (purpose + when-to-use). Descriptors are server-safe/isomorphic (t12), so the Route Handler imports them with no client React. **Adding a module type auto-teaches the AI — zero per-type prompt or tool edits.** Caveat noted: discriminated-union tool schemas grow with type count; fine at t12's 3–6 types, fall back to looser `data` + heavier server validation if the catalog ever grows large.

**5. Behavioral gating — prompt-only proposing; Accept is the sole structural write gate.** Two moments, one irreversible: _proposing_ (cheap, reversible — Reject dismisses, nothing persists) vs. _writing_ (Accept → `commitBlocks`, the only path to persistence). "Never emits unprompted" is enforced by the **t06 persona at the prompt** for proposing; the **Accept gate is the structural guarantee** for writing. No request-classifier, no mode toggle (brittle + speculative). Contract invariant: **a proposal is never a write.** t06's "extraction candidates" fold in as ordinary `create` proposals — no special case.

**6. Diff/review — a stack of typed cards, per-card + group actions.** A multi-module proposal renders as a **stack of DiffCards under one proposal message**, each card rendered by its module type's **`differ`** (t12) in the shared shell: `create` = new-content preview (no "before"); `edit` = before/after (type-morph = old type's view as before, new type's as after); `remove` = removal preview. **Per-card** Accept/Reject/Edit **plus a group Accept-all / Reject-all.** **Partial accept allowed** (independent targeted ops); anchor to a _rejected_ create → falls back to append. **Accept-then-edit** carries over per card (t10: Edit accepts that change into the document panel + focuses it). Write path: a generalized **`applyProposedChanges(blocks, changes)`** → shared `commitBlocks` (t12's "user edit and AI-accepted edit share one persist path").

**7. Validation/safety — emit-time (server) + accept-time (client); no new write handler.** Two gates: **(1) emit-time, server-side** — the discriminated-union tool schema (branch 4) validates AI output inside the Route Handler _before it streams_; add `experimental_repairToolCall`/retry so a malformed emit self-corrects instead of hard-failing the turn. **(2) accept-time, client** — re-validate the accepted change against the isomorphic Zod schema before `commitBlocks`; on failure show a "couldn't apply — malformed" card state and **never write**. **No dedicated server write handler** (layer 3) — the write stays client-side per the incumbent, justified by **t05's single-user, single-account, RLS threat model** (the only "adversary" is a buggy AI, caught by gates 1+2). **No read-side validation** (reaffirms t12); the renderer **degrades gracefully on an unknown `type`** (fallback view) rather than hard-failing a page load. **Conscious, documented divergence from t12's literal "validate server-side at the write boundary":** the emit-time check _is_ the real server-side gate and satisfies t12's intent (no corrupt JSONB); a second server check at the write costs a round-trip + re-architecture of the client write path for a threat that doesn't exist here.

**Downstream.** t16 blocks nothing (leaf on the arch track); it reconciles with the visual track at **t17** (token↔contract) and coordinates with **t18** (the AI composes `section` layout once t18 defines its schema — same tool). **Fog carried forward, sharpened:** the patch/ops emit protocol stays fog, now two layers — _within-module_ ops for large modules AND _page-level_ full-state-vs-targeted-list — graduating when a real kanban-scale page makes the flat targeted list hurt.
