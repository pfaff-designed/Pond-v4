# HANDOFF — t12 registry foundation shipped; t16 is next

_Written 2026-08-15, session 7. Prior state: `wayfinder/HANDOFF-v85-compose.md`
(the v85 "Clearing" proto + AI-composition feel-proto). This session harvested the
**real module registry** (t12) out of the proto. Next session builds **t16** (AI
composition) on top of it._

## TL;DR

The module registry (ticket-12) is **built, reviewed, committed, and pushed**
(`922e50e`, `main` up to date). It's the foundation t16 and the real chrome both
consume. `tsc` 0 · jest **136 passed** · storybook 2 play-tests · eslint 0.

## What shipped this session

- Pushed the prior session's compose feel-proto (`41bc8c4`).
- Removed 3 leftover empty `… 2` iCloud dedup dirs.
- **Built `src/lib/modules/`** — the t12 two-map registry:
  - `types.ts` — facet types `ModuleDescriptor` / `ModuleRenderer` / `ModuleViewProps`.
  - `registry.ts` — **server-safe** `moduleDescriptors` (`{type, schema, description}`);
    re-exports `blockSchema` + `Block`. Importable in Route Handlers with no client React.
  - `renderers.tsx` — **client** `moduleRenderers` + the single **`ModuleView`**
    dispatcher (unknown type → `null`, no throw; t12 §2).
  - `content.ts` — `blockSchema = z.discriminatedUnion('type', […])` → `Block` type.
  - Five modules, each `schema.ts` (Zod = single source of truth) + `view.tsx`:
    `text` / `todo` / `metric` (absorbed from `DocumentPanel`), `metric-ring`
    (harvested from proto `Ring`), `page` (recursive container — renders children
    via `ModuleView`; the t12 §6 seam and t18 drop-in point).
  - `documents/types.ts` is now a **re-export shim** — all ~7 existing `Block`
    consumers keep working unchanged.
  - Proof: `src/__tests__/module-registry.test.tsx` (7 tests) + `page/view.stories.tsx`
    (2 play-tests) + shared `page/sample.ts` fixture.

## Review outcome (Standards + Spec, both axes)

- **Standards:** no hard violations. Fixed the one actionable smell (duplicated
  test/story fixture → extracted `page/sample.ts`).
- **Spec:** faithful to all 7 t12 decisions. One flagged assumption, **deferred to
  t16 with an in-code note** (`metric-ring/schema.ts`): the ring's `pct: 0..1` is
  presentation-shaped, not `value`+`target`. Per t12 §5 ("ship flat, refactor when a
  real case hurts"), t16 — where the AI actually composes a ring — is where that
  gets ratified. **Watch this when wiring t16.**

## Run / verify

Repo: `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` (single package, shadcn
base-nova + Bklit charts). Node 22 = stable path.

- Typecheck: `PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH node node_modules/typescript/bin/tsc --noEmit`
- **Jest gotcha:** `jest.config.ts` needs `ts-node`, which is **not installed** in
  this environment, so `npm test` fails at config parse. Workaround used this
  session: a throwaway JS mirror config (points `next/jest` + rootDir at the repo by
  absolute path). Re-create it in scratchpad and run:
  `node node_modules/.bin/jest --config <that>.cjs`. (In the real dev env with
  ts-node, `npm test` works normally.)
- Storybook story test: `node node_modules/.bin/vitest --project=storybook run src/lib/modules/page/view.stories.tsx`

## Next: t16 — AI module-composition contract

Spec: `wayfinder/ticket-16-ai-composition-contract.md` (already resolved/specced).
Entry points now that the registry exists:

1. **The tool** — one generalized tool emitting `changes[]`, each
   `{ op: create|edit|remove, blockId?, type?, data }`. `data` is a **Zod
   discriminated union built from `moduleDescriptors`** (map over
   `Object.values(moduleDescriptors)` → `.schema`) + a generated system-prompt
   catalog (from each descriptor's `description`). New module type ⇒ AI learns it
   with zero edits. AI **never mints IDs** (client mints on accept).
2. **Emit-time validation** — discriminated-union check **server-side in the Route
   Handler** (`src/app/api/chat/route.ts` is where chat/tools live). This _is_ the
   t16-sanctioned write gate (conscious divergence from t12's literal server-write
   boundary; single-user, t05).
3. **Review/accept** — stack of typed DiffCards (`src/components/molecules/DiffCard.tsx`
   is the shell; add per-module `differ`s — the `ModuleRenderer.differ?` facet is
   **already declared but unimplemented**). Accept is the sole write gate.
4. **Commit** — `applyProposedChanges` → the existing shared
   `commitBlocks` (`src/lib/pages/commit.ts`) → `saveBlocks`. Do **not** add a new
   write handler.
5. **Watch:** the `metric-ring` presentation-vs-domain shape (above) — decide
   value/target here if the AI needs to compose rings.

Existing AI wiring to build on: `src/lib/ai/`, `src/app/api/chat/route.ts` (Vercel
AI SDK `streamText`/tools), `src/components/organisms/AITerminal.tsx`.

## Deviations from the original harvest sketch (intentional)

- One `registry.ts` with _both_ maps would poison the server bundle — used the
  **two-barrel split** the t12 contract mandates.
- Dropped a homogeneous `satisfies Record<…>` on `moduleRenderers` (onChange is
  contravariant across distinct data types); correctness is enforced at each view's
  own typing, and the one dynamic-`type` boundary is cast in `ModuleView`.
