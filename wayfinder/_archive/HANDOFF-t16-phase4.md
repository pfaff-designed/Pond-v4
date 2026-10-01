# HANDOFF — t16 Phases 1–3 shipped (data layer); Phase 4 is next (typed diff cards)

_Written 2026-08-15, session 8. Prior state: `wayfinder/HANDOFF-t12-registry.md`
(the t12 module registry). This session built the **AI composition data layer**
(t16 Phases 1–3): the registry-derived tool schema + prompt catalog, the route-handler
tool, and the client-side apply/write function — all test-first, reviewed, and green.
**Everything is UNCOMMITTED.** Next session builds **Phase 4** (per-module `differ`s +
the typed multi-op DiffCard stack)._

## TL;DR

t16 is being built in 6 phases. **Phases 1–3 (the data layer) are done, reviewed
(Standards + Spec, both axes), and verified green — but NOT committed.** They are not
yet user-visible: `AITerminal` still only renders the old `tool-propose_edit`, so a
compose request currently calls `propose_changes` and silently no-ops. Phase 4 starts
making it visible.

- `tsc --noEmit` → **0** · jest → **160 passed / 17 suites** (+24 new) · eslint (changed files) → **0**.

## What shipped this session (Phases 1–3)

| File                                                                                   | What                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/modules/ai-composition.ts` **(new)**                                          | `moduleDataSchema` (registry-derived `discriminatedUnion('type')` over the 4 **content** modules, every id stripped — block + nested), `changeSchema`/`proposeChangesSchema` (create/edit/remove batch, discriminated on `op`), `moduleCatalog` (prompt teaching string). Server-safe.                     |
| `src/lib/pages/edits.ts` **(modified)**                                                | Added `applyProposedChanges(blocks, changes, mintId)` + `hydrateBlock`. Mints all ids, `after`-anchoring with a same-anchor ordering offset map, missing-anchor→append, re-validates each block against `blockSchema` and **skips** malformed (never a corrupting write). `applyProposedEdit` left intact. |
| `src/app/api/chat/route.ts` **(modified)**                                             | New `propose_changes` tool (no `execute`; strict `inputSchema = proposeChangesSchema` — this **is** the emit-time server gate) + `moduleCatalog` injected into `SYSTEM_PROMPT`. `propose_edit` **kept fully working** (non-breaking).                                                                      |
| `src/__tests__/ai-composition.test.ts` **(new)** + `page-edits.test.ts` **(modified)** | 24 new tests: closed-union / id-stripping / catalog + create / edit / type-morph / remove / partial-batch / anchor-fallback / same-anchor-order / nested-id-mint / malformed-skip / no-mutate.                                                                                                             |

### Design decisions locked this session (Charles chose)

- **Client mints nested ids too** — todo item ids are stripped from the AI schema and minted in `hydrateBlock` (the single nested-id case today; a documented special-case, not a per-module facet).
- **metric-ring kept as `pct`** — the value/target ratification is **deferred** (still just presentation-shaped). Revisit if/when the AI actually needs to compose a ring against a target.
- **Composition is flat, content-only** — the `page` container is **excluded** from `moduleDataSchema` and `moduleCatalog` (composition stays a flat ordered list until `section` lands at t18, branch 3).

## Review outcome (both axes)

- **Spec: faithful.** All 7 branches honored within Phases 1–3 scope. The branch-2 `type?`
  field was intentionally **folded into `data`** (which is discriminated on `type`) — one
  source of truth, strictly better than a redundant top-level `type`.
- **Standards: clean.** One fix applied — the `ai-composition.ts` header comment was
  corrected: only `moduleCatalog` is truly registry-derived (zero-edit); the `data` union
  is hand-listed, so **adding a module type requires adding its id-stripped schema to
  `moduleDataSchema`** (kept explicit because Zod discriminated-union construction from a
  registry isn't ergonomic). Two carried judgement calls (optional, see below).

### Carried findings (optional pre-Phase-4 cleanups — not blockers)

1. `hydrateBlock`'s param is typed `unknown` + cast. A reviewer suggested typing it
   `ModuleData` and dropping the casts. Left as-is on purpose: branch-7 says don't trust
   AI output at the write boundary, and the `Array.isArray` guard keeps a malformed payload
   from throwing before `safeParse` catches it. Decide if you prefer the cleaner signature.
2. **Bare reorder is awkward:** `changeSchema`'s `edit` variant makes `data` **required**,
   so "just move block X after Y" forces re-emitting the block's full data. Spec-faithful
   (branch 3 never marks `data` optional) but ergonomically lossy. If Phase 4/5 makes reorder
   common, consider a `data`-optional edit or a dedicated move — but that reopens branch 3, so
   only if a real case hurts.

## Run / verify

Repo: `/Users/charlespfaff/Documents/Code/Projects/Pond-v4` (single package, shadcn
base-nova + Bklit charts). Node 22 = stable path (`~/.nvm/versions/node/v22.15.0/bin`).

- Typecheck: `PATH=~/.nvm/versions/node/v22.15.0/bin:$PATH node node_modules/typescript/bin/tsc --noEmit`
- **Jest gotcha (unchanged from t12):** `jest.config.ts` needs `ts-node`, not installed here,
  so `npm test` fails at config parse. Workaround: a throwaway CJS mirror config that
  `require`s `next/jest.js` **by absolute path** (relative resolution fails from scratchpad)
  and sets `rootDir`/`moduleNameMapper` at the repo:
  ```js
  const nextJest = require('/Users/charlespfaff/Documents/Code/Projects/Pond-v4/node_modules/next/jest.js')
  const createJestConfig = nextJest({ dir: '/Users/charlespfaff/Documents/Code/Projects/Pond-v4/' })
  module.exports = createJestConfig({
    rootDir: '/Users/charlespfaff/Documents/Code/Projects/Pond-v4',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/.claude-worktrees/'],
    moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  })
  ```
  Run: `node node_modules/.bin/jest --config <that>.cjs`. (Real dev env with ts-node → `npm test` works.)
  The `jest-haste-map: naming collision: pond-v4` warning is a pre-existing `.claude-worktrees/`
  artifact — harmless.
- Storybook story tests (Phase 4 will add some): `node node_modules/.bin/vitest --project=storybook run <story>`

## Next: Phase 4 — typed diff cards (branch 6)

**Goal:** render an AI `propose_changes` batch as a **stack of typed DiffCards under one
proposal message**, each card's body drawn by its module type's `differ`. This is UI/component
work — **confirm before editing** (per the global component rule): repo is the single package
above, shadcn base-nova wrappers (not atoms-from-scratch); `DiffCard` is an existing molecule.

Entry points:

1. **Per-module `differ`s.** The `ModuleRenderer.differ?` facet is **declared but unimplemented**
   (`src/lib/modules/types.ts:55` — `differ?: ComponentType<{ before: T | null; after: T }>`).
   Add differs starting with `text` (before/after), and a generic before/after fallback for the
   others via a read-only `ModuleView`. Wire them into `moduleRenderers`
   (`src/lib/modules/renderers.tsx`).
2. **Generalize `DiffCard`** (`src/components/molecules/DiffCard.tsx`). Today it's text-only
   (`before`/`after` strings). Make it render **per op**: `create` = new-content preview (no
   "before"), `edit` = before/after (type-morph = old type's differ/view as before, new type's as
   after), `remove` = removal preview. Delegate the body to the module `differ`. Keep the shared
   shell (header, Accept/Edit/Reject buttons, resolved status line).
3. **Storybook play-tests** per card state (create / edit / morph / remove / accepted / rejected),
   per the front-end workflow (atomic design + Storybook + story tests; no stray components
   outside atoms/molecules/organisms).

Do **not** wire `AITerminal` or the write path in Phase 4 — that's **Phase 5** (per-card + group
Accept-all/Reject-all, partial accept, `applyProposedChanges` → `commitBlocks` → invalidate
`['page', nodeId]`). Phase 4 should be pure presentation + stories, keeping the checkpoint tidy.

## Still open after Phase 4 (Phases 5–6)

- **Phase 5:** `AITerminal` consumes `tool-propose_changes` → renders the DiffCard stack, per-card
  - group actions, partial accept; Accept path uses `applyProposedChanges(blocks, changes,
() => crypto.randomUUID())` → existing `commitBlocks` (`src/lib/pages/commit.ts`) → `saveBlocks`.
    **Do not add a new write handler.**
- **Phase 6 / cleanup:** collapse `propose_edit` into `propose_changes` and drop the old tool +
  its `AITerminal` handling once the new path is live; wire `experimental_repairToolCall` (ai@7
  supports it — verify against a live model, it's a self-correction enhancement on top of the
  strict `inputSchema` gate that's already in place); then full verify (tsc / jest / storybook /
  eslint).
- **Watch:** the metric-ring `pct` vs value/target shape (above) — resolve if Phase 5's AI needs
  to compose rings against a target.

## Commit note

Nothing is committed. Suggested commit boundary when Charles is ready:
`feat(modules): t16 AI composition data layer — registry-derived tool schema, catalog, apply path`
(the 5 files above). Then Phase 4 on top.
