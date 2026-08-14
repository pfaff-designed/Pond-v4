---
id: 12
label: wayfinder:grilling
status: resolved
blocked-by: [11]
blocks: [16, 17, 18]
---

# The module registry contract

## Question

The registry is the hinge of the unified system: one map `type → capabilities` that BOTH the UI renders from and the AI composes against. Given the taxonomy (t11), decide what each module type declares:

- **Data schema** — how a module's data is shaped and validated (Zod? matches the persisted `blocks` JSON).
- **View** — the render surface. One renderer, or view/edit/diff variants?
- **Editor** — the in-panel editing affordance (todo checkboxes interactive; text a textarea; metric read-only, per ticket-09).
- **Differ** — type-specific diff visualization for the AI edit loop (full-state todo, preview-only metric, before/after prose — the ticket-10 deferred items).
- **AI capabilities** — the description/schema the AI reads to know when and how to emit or edit this module (feeds t16).
- **Layout / slots** — how does a *container* module (e.g. a page) place its children? Does the contract carry layout intent? (Note per t11: chrome is a **host**, not a module — hosts lay modules into *slots*; the registry contract governs content modules, not the host frame.)

Decide whether this is a lightweight object-literal registry (3–6 types) or something heavier, and where it physically lives (`src/lib/modules/`?). Resist over-abstraction for a handful of types. Blocks the AI composition contract (t16) and the token↔contract reconciliation (t17).

## Answer

Resolved by grilling (2026-08-09). The registry is a **plain, keyed object-literal map** — no plugin/class framework — designed **AI-first**: it exists because the AI (t16) needs a machine-readable capability list that a TypeScript discriminated union structurally cannot provide (UI-DRY and N-type extensibility fall out for free once it exists).

**1. Two maps, split by runtime boundary, joined by the `type` string.** The AI runs server-side (t04, Route Handlers), so the AI-facing data must be importable in server context, while renderers are client React. Therefore:
- `moduleDescriptors` — **server-safe, isomorphic**: `{ type, schema, description }`. Pure data, no React.
- `moduleRenderers` — **client**: `{ view, editor?, differ? }`.
- The `type` string is the join key. Server reads descriptors only (never poisons its bundle with client components); client reads both.

**2. Zod is the single source of truth for schema.** Per module, one `z.object(...)` feeds three consumers: the TS type (`type Block = z.infer<...>`, so existing imports keep working), runtime validation, and the AI's tool-input schema (via `zod-to-json-schema`). **Validate AI output server-side at the write boundary** (the model *will* emit a malformed block eventually; an unvalidated write corrupts a page's JSONB). **No read-side validation** — it's our own persisted data and a stale row shouldn't hard-fail a page load.

**3. Render facets — `view` required, `editor?`/`differ?` optional.**
- `view(data, editable, onChange)` is the one required facet. When `editable`, the view wires its *own* interactions (todo checkbox fires, kanban drag fires), each emitting a new module state via `onChange`. **Editability is a prop the host/slot passes, not a flag on the descriptor** — the same module is interactive in the document panel but read-only when the AI terminal shows it as reference or on a constrained surface.
- `editor?` is the **exception**, declared only when the edit surface genuinely differs from the read surface (text: rendered-md → textarea). Interactive modules (todo, kanban) fold editing into the view and declare no separate editor.
- `differ?` is a **type-specific body slotted into the shared DiffCard shell** (the shell keeps the ticket-10 header/reason/Accept-Reject-Edit machinery). Not a generic diff-data structure — routing todo/metric/prose diffs through one union would need a union as rich as the modules themselves.
- **Unification:** a direct user edit and an AI-proposed-then-accepted edit both produce *a new module state → persist*. The AI path's only extra machinery is the `differ` (preview before approval); direct edits commit.

**4. AI descriptor is thin.** Just `description` (one NL line: purpose + when-to-use, so the model picks the right type) **+ the Zod schema**. Nothing else. This ticket defines *what a module declares to the AI*; how the AI *drives composition* (tool protocol, placement, ordering) stays in **t16**.

**5. Edit mechanics: full-state emit, flat — no `editMode` toggle, no ops vocabulary.** The AI edits by emitting a whole new `data` conforming to the schema; the differ compares old vs new. Considered and rejected: (a) pure patch/ops — forces an awkward ops grammar onto text/todo/metric and would be *designed blind* against tiny modules; (b) a `editMode: 'full' | 'ops'` dual-path seam — rejected by the user as a speculative toggle that risks becoming obsolete dead code to hunt down. **Decision rationale (user's principle):** ship the flat version and do one deliberate refactor when a real kanban-scale module makes full-state hurt, rather than carry guessed structure now. → *Filed as fog for t16: "patch/ops emit protocol for large modules."*

**6. Layout: no layout grammar in the contract, but recursive composition is locked in.**
- **Locked now:** a container module's view renders its child modules by looking them up in the registry. This is **already exercised by `page`** (a container whose view renders its block-modules), so it is not speculative dead code — it is the seam that makes in-page layout a friction-free drop-in later.
- **Deferred:** the layout *vocabulary* (columns / grid / spans) is **not** designed here — designing it before the visual track (t14) has produced real layout requirements would repeat the ops-grammar mistake. The in-page `section` container **graduates into its own ticket driven by the visual track** (see new ticket-18); it lands as a container module carrying a real layout schema that drops into the recursive seam — no contract rework.
- The AI *making* layout decisions is **t16** (composition against whatever `section`'s layout schema becomes).

**7. Weight & home.** Plain keyed object literal, no framework, no runtime registration. Home: `src/lib/modules/<type>/` (`text/`, `todo/`, `metric/`), each folder co-locating its **Zod schema + descriptor + differ logic**; two barrel files assemble the maps (`registry.ts` for descriptors = server-safe; a client renderer index). The existing `src/lib/documents/types.ts` `Block` union is **absorbed** — types derive from the per-module Zod schemas; that file becomes a re-export shim or is retired (one source of truth). **The view/editor components' atomic construction and placement in the atoms/molecules/organisms tree is delegated to ticket-13**, not decided here.

**Downstream:** unblocks **t16** (AI composition — reads descriptors, emits full-state `data`, composes via recursive containers) and **t17** (token↔contract reconciliation). Surfaces **new ticket-18** (in-page `section` container, blocked by the visual track). Fog added for t16: patch/ops emit protocol.
