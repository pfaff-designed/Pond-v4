# Handoff — prompt caching, F26, roadmap issues, CI debt (2026-09-01)

Long session. This captures state so a fresh session can continue cleanly.

## What shipped this session

- **Prompt caching** on the chat route (`src/app/api/chat/route.ts`): one ephemeral
  `cacheControl` breakpoint on the **last content part** of the final model message
  (part-level, not message-level — `@ai-sdk/anthropic` reads `part.providerOptions`).
  Caches tools+system+prior turns; reads back at ~0.1x. Verified live: turn 2 read the
  full ~16.7k-token prefix from cache. Cache counts live on
  `providerMetadata.anthropic.usage.cache_*` (raw snake_case), NOT standard `usage`.
- **F26 fixed + closed (#8):** new pages showed at ROOT until refresh. Added
  `insertPageOptimistic()` in `src/lib/pages/tree.ts`, called before navigate in all
  three create paths (top-bar modal, AI-accept card `AITerminal.acceptCreatePage`,
  rail add-child `Rail.handleAddChild`). Browser-verified via Playwright.
- **Roadmap → issues:** 7 GitHub issues created from `wayfinder/ROADMAP-notion-parity.md`,
  labeled by epic. **#8 (F26) closed.** The 20 §4b-shipped findings and the Database
  Primitive (→ grill/spec first) were intentionally excluded.

## Open roadmap issues (build order)

| #   | F#  | Epic | Title                                                               |
| --- | --- | ---- | ------------------------------------------------------------------- |
| 9   | F25 | A    | Drag pages into pages to reparent (MOVE / set parent_id) ← **NEXT** |
| 10  | F27 | B    | Kanban cards linkable to pages                                      |
| 11  | F1  | B    | Gantt/timeline module (accept-skip half already shipped)            |
| 12  | F13 | B    | Promote heatmap + stat to module types                              |
| 13  | F23 | D    | De-sycophancy persona tuning (`prompt.ts`)                          |
| 14  | F24 | E    | SMS Pond (Twilio inbound webhook)                                   |

Crown epic (Database Primitive, §3 of roadmap) is NOT an issue yet — grill via
`/grill-me` then `/spec` before decomposing (per AGENTS.md).

## PR #15 — `feat/prompt-cache-and-f26`

- URL: https://github.com/pfaff-designed/Pond-v4/pull/15 · base `main` · MERGEABLE (no conflicts).
- Commits: caching (`144069e`), F26 (`9d2ea6a`), lockfile fix (`4fa797d`),
  lint fix (`ec46509`), test fix (`4838cd8`).
- **My work is green:** lint, typecheck, all 813 jest tests pass.

### Two PRE-EXISTING CI failures still red (NOT from this PR's changes)

Surfaced because pushing local `main` sent **142 un-CI'd commits** to CI for the first
time (remote main had been frozen at `c191051`, Aug 27). **`main` itself is now CI-red**
on these until fixed; every PR inherits them:

1. **Build:** `next build` fails prerendering `/sandbox` — "Error occurred prerendering
   page /sandbox" (ticket-43 sandbox route). Likely needs `export const dynamic = 'force-dynamic'`
   or a client-only guard on that route; investigate the prerender-time error.
2. **Storybook (Playwright):** `src/components/molecules/BlockInserters.stories.tsx`
   ("Always Visible Add", "Insert Between Blocks") fails under `test-storybook`.

Neither touches caching/F26. Decide: fix these (green up main) vs. merge #15 via override.

## Environment gotchas (will recur)

- **Git push:** `origin` is SSH but there's no TTY for host-key/passphrase prompts, so
  SSH push **stalls**. Push URL is already set to HTTPS (`git remote set-url --push origin
https://github.com/pfaff-designed/Pond-v4.git`); fetch stays SSH. `gh auth setup-git` done.
- **Lockfile:** `package-lock.json` drift was Linux-only (`@emnapi` 1.11.3 for the Tailwind v4
  `@tailwindcss/oxide-linux-*` engine). macOS `npm install` can't fix it. Regenerate on Linux:
  `docker run --rm -v "$PWD":/app -w /app node:24 npm install --package-lock-only`. Do NOT
  `rm lock && npm install` on macOS — it strips all cross-platform optional deps.
- **Lint:** CI runs `npm run lint` = bare `eslint` (whole project), NOT `next lint`. React-Compiler
  hooks rules (`react-hooks/refs`, `set-state-in-effect`) are scoped OFF for
  `src/components/charts/**` + `src/app/proto/**` in `eslint.config.mjs` (vendored chart lib).
- **Supabase** free tier auto-pauses after ~1wk idle → NXDOMAIN; restore via management API.
- Dev server runs on **:3000** (user's own). `DEV_AUTOLOGIN=1`.

## Next session — F25 (#9)

1. Per AGENTS.md, **grill then spec** F25 before building (drag-and-drop + descendant-cycle
   guard + set `parent_id` + auto-expand target).
2. The F26 recon already mapped the create/tree layer — reuse it: page tree is the
   `['pages', workspace]` React Query cache (`src/lib/pages/tree.ts`), nested via
   `src/lib/rail/tree.ts` `buildTree`; `PageRow.parent_id` (snake) → `RailNode.parentId`.
   Reparent = a MOVE mutation setting `parent_id`, then optimistic cache update +
   invalidate (mirror `insertPageOptimistic`). Guard: reject dropping a node into its own
   subtree (walk ancestors).
3. Decide first whether to clear the 2 pre-existing CI failures so F25's PR can go green.
