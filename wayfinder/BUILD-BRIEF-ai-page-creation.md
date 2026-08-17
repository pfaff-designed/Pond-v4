# Build Brief — AI Page Creation & Field Editing (for Fable to plan from)

_Written 2026-08-16 by Opus (this session). Repo: `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`, branch `main` @ `9906bab` (clean). This brief is the full deck — Fable should be able to plan the architecture, feature list, and build loop from it without re-deriving. Prototypes referenced below are real, runnable, and already tell us most of what we need._

---

## 1. Mission

Make Pond's AI able to, from chat, **(a) create new pages** — project, dashboard, inventory/collection, recipe, document — scaffolded with real content, and **(b) reliably edit fields/content** on an existing page. Target bar: **used for real, in daily life** — not a demo. Charles is building this via **Fable orchestrating Opus builder agents** (see §7).

## 2. Where we are (proven, not guessed)

Two throwaway prototypes were built and run against the **real model** (`claude-sonnet-4-6`, the app default) using the **real tool schemas**. They are the evidence base — read them:

- `scripts/proto-createpage.mts` — forced `create_page` fill quality (can the model scaffold a good page from the 4 existing block types?).
- `scripts/proto-routing.mts` — unforced routing across all 4 tools (does it pick the right tool?).

Run either: `node --env-file=.env.local scripts/<file>.mts`. (Node 24 strips TS natively; `ANTHROPIC_API_KEY` is in `.env.local`.) **These are prototypes — delete or ignore for the real build; they exist as reference.**

### Prototype finding A — page-structure quality (the "do we need per-type templates?" fork)

Verdict: **generic blocks are enough for most kinds; NO template system needed.**

| Kind                     | Result                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **recipe**               | ✅ genuinely good — intro, ingredients + steps as checklists, tips, calorie metric                                                     |
| **project**              | ✅ excellent — phased checklists, progress metric, notes                                                                               |
| **document**             | ✅ good — reads like a real planning doc                                                                                               |
| **dashboard**            | ⚠️ structure fine but every value is `0` — a dead shell. Needs **data-binding** (a data problem, not a template). Defer.               |
| **inventory/collection** | ❌ model faked it as **markdown tables inside text blocks** — the tell that a real **`table`/`collection` block primitive** is missing |

Fill reliability: **5/5 valid payloads, zero repairs.** The model composes clean args.

### Prototype finding B — routing (unforced, all 4 tools, with simulated current-page context)

**6 of 8 clean.** Correct: pure chat→no tool; "reword intro"→`propose_changes` edit (right block); "add checklist"→`propose_changes` create; "make a recipe page" (from Home)→`create_page`; "recall Japan notes"→`fetch_context`; "create a project"→`create_node`.

Two things to carry into the plan:

- 🐛 **BUG (prompt tension):** "create a **separate page** for my lasagna recipe" (while on another page) → **stalled with a clarifying question, no tool call.** Cause: Pond's system prompt (`route.ts`) — _"you never initiate… wait for confirmation… offer a candidate and wait."_ The **steward persona actively suppresses the create action.** Fix: an explicit "create a page for X" **is** the confirmation; the prompt must act on it. This is the single most important thing to resolve.
- 🔀 **DESIGN FORK:** "create a project" → existing `create_node` (an **empty** shell/dialog), while "create a recipe" → `create_page` (**scaffolded**). So structural nodes come out bare and content pages come out rich — inconsistent UX. Decide the `create_node`↔`create_page` boundary (below).

## 3. Architecture facts (verified this session)

**Everything is a page.** One Supabase table `public.pages` (`src/lib/supabase/types.ts:18-56`): `id, user_id, parent_id` (null = top-level), `type, title, blocks` (Json[]), `status, props` (Json), `order, created_at, updated_at`. Areas/projects/routines/actions/pages are all rows; nesting via `parent_id`.

- **`type` (`NodeType`, `types.ts:8`) = `area | routine | project | action | page`** — a metadata tag with **no schema behind it**. The user's kinds (recipe/dashboard/inventory/document) are **not** modeled. This vocabulary is **too coarse** (proto mistagged a dashboard as `area`).
- **Runtime create exists:** `createPage(supabase, userId, {parentId, type, title, blocks?})` (`src/lib/pages/client.ts:112`). `createNode()` (`src/lib/nodes/create.ts:107`) parses an AI `ActionCard` → `createPage`; resolves parent by UUID **or title** (`resolveParentId`).
- **Blocks** (content modules, `src/lib/modules/*/schema.ts`): `text{content}`, `todo{items[{label,checked}]}`, `metric{label,value,unit?,trend?}`, `metric-ring{label,sub?,pct 0..1}`. Union in `src/lib/modules/content.ts`.
- **AI composition contract** (`src/lib/modules/ai-composition.ts`): `proposeChangesSchema` = batch of `changeSchema` ops **`create | edit | remove`** on blocks **within the current page** (`edit` can type-morph; every op has optional `reason`). `moduleDataSchema` is **id-stripped** — the AI never mints ids; the client mints on accept. `moduleCatalog` (NL block list) is registry-derived and auto-injected into the prompt.
- **Adding a new block type** = add its id-stripped schema to `moduleDataSchema` (not auto-derived — explicit by design) + a descriptor (auto-appears in `moduleCatalog`). This is the path for a **`table` block**.
- **Chat route** (`src/app/api/chat/route.ts`): tools `create_node` (client-side, no execute — opens dialog), `propose_changes` (client-resolved, no execute), `fetch_context` (has execute — semantic search). `streamText`, `stopWhen: stepCountIs(3)`. **`repairToolCall`** is wired (stable name; re-asks via `generateObject` on schema-invalid calls) — typechecked only, **no runtime evidence yet**.
- **Models** (`src/lib/ai/models.ts`): `quick=claude-haiku-4-5`, `standard=claude-sonnet-4-6` (chat default), `deep=claude-opus-4-8`.

## 4. The three decisions the plan must make

1. **Steward-vs-create prompt tension** (the 🐛). How does "Pond never initiates, waits for confirmation" coexist with "create this page now"? Likely: explicit user request = the confirmation; act, don't re-ask. Needs prompt design + tests.
2. **`create_node` ↔ `create_page` boundary.** Options: (a) `create_page` absorbs structural types and scaffolds everything (projects get content too); (b) keep the split (structural = empty shell, content pages = scaffolded); (c) merge into one create tool. Proto shows the model _naturally_ splits them — decide if that's the desired UX.
3. **Placement + type vocabulary.** How does `create_page` choose `parent_id` — current node? an area picker? AI-inferred + user-confirmed? And is the coarse `type` tag enough, or does page-kind (recipe/dashboard/…) need to live somewhere (e.g. `props.kind`) to drive rendering/placement?

## 5. Scope (Charles to lock; Fable may push)

- **A — `create_page` (generic blocks) + reliable edit.** The proven core (recipe/project/document). Smallest real, daily-usable slice.
- **B — A + `table`/`collection` block.** Unlocks inventories (the one kind generic blocks can't fake). **New primitive → needs its own tiny schema+render mini-proto before committing.**
- **C — B + richer type vocab + dashboard data-binding.** Longest; dashboards stay hollow until data-binding lands.

_Opus's recommendation: **B if collections matter for daily use, else A.** Do the `table` mini-proto first if B. Don't take on dashboards (C) yet — data-binding is a separate arc._

## 6. What's NOT de-risked (build-shaped, not more prototyping)

- **Rendering** — no evidence how generated blocks _look_ on screen. This is a UI question a prototype can't answer → make the **render path an early milestone**.
- **Placement wiring** — see decision #3.
- **`repairToolCall`** — still no runtime proof (can't be forced through the UI).

## 7. The build loop Charles designed

- **Fable = this session** (orchestrator): plans, gates approvals, presents to Charles. (Only the session model can converse with him — that's why Fable is the session, not a subagent.)
- **Opus agents = builders**, working **test-first** (`/tdd`, red-green-refactor, real integration tests — no mocks unless unavoidable).
- Each builder runs **`/code-review`** and **`/verify`** on its own work **before** reporting back to Fable. (Feasible — a builder subagent can invoke those skills.)
- **Fable judges** the result; if it passes, **presents the milestone to Charles** for approval.
- **Human gates at milestone granularity, not per-feature** — a background Workflow can't pause for approval, so gate at milestones and fan out Opus builders _within_ a milestone to keep parallelism. (This is a recommendation; Fable can choose turn-by-turn orchestration instead.)
- **Mobbin MCP for all front-end/UX work** (added 2026-08-16 by Charles): before designing any component, flow, or UX surface (M1 proposal card, M3 table block rendering, etc.), the builder researches real-world reference patterns via the `mobbin` MCP tools (`search_flows`, `search_screens`, `search_sections`) and grounds the design in what it finds. Not needed for backend/eval milestones.

## 8. Constraints & gotchas

- **`AGENTS.md`: this is a modified Next.js (16.2.12).** Read `node_modules/next/dist/docs/` before any Next-specific API. Don't trust training-data Next.
- **Charles's global rule:** before touching any component/UI file, confirm repo path + which package + shadcn-wrappers-vs-atoms, then **WAIT** for confirmation. (Answer for Pond: single Next app / atomic design with shadcn `ui` primitives — but still confirm per the rule.)
- **Debugging rule:** if a first fix fails, write assumptions + smallest disproof before coding attempt two.
- Pre-commit hook runs `eslint --fix` + prettier + `tsc` (reformats on commit). Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; target `main` (trunk-based).
- Pre-existing lint: **49 errors in `src/components/charts/`** (vendored Bklit lib) — unrelated, untouched, don't try to fix.
- Playwright MCP screenshots write to the MCP server's own cwd (unreadable from the workspace) — use **accessibility snapshots** for verification evidence.
- The "edit fields reliably" ask maps onto the **already-live** `propose_changes` `edit` op (t16, shipped `9906bab`). It works; the open question is _reliability_ (needs eval evidence), not new code.

## 9. Key files

- Chat route / tools / system prompt / repair: `src/app/api/chat/route.ts`
- AI composition contract: `src/lib/modules/ai-composition.ts` · block union: `src/lib/modules/content.ts` · block schemas: `src/lib/modules/{text,todo,metric,metric-ring}/schema.ts` · registry: `src/lib/modules/registry.ts`
- Pages data layer: `src/lib/pages/client.ts` (`createPage`) · node creation: `src/lib/nodes/create.ts` (`createNode`, `ActionCard`, `resolveParentId`)
- Supabase types: `src/lib/supabase/types.ts` · models: `src/lib/ai/models.ts`
- Prototypes (reference, throwaway): `scripts/proto-createpage.mts`, `scripts/proto-routing.mts`
- Prior context: `wayfinder/HANDOFF-t16-phase5.md`, commit `9906bab` (`git show`)
