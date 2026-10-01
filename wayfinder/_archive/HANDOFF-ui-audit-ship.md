# Handoff — UI-audit multi-issue ship (orchestrator pattern)

Date: 2026-09-11. Orchestrator = Opus; builders = Fable via `.claude/workflows/ship-issue.mjs`
(run with `Workflow({scriptPath: ".../ship-issue.mjs", args:{issue:N}})`).

8 issues were filed from live-use feedback (#57–#64) + one config request (eslint #69).
`#62` was consolidated into `#59`. Base branch = `main`.

## Shipped to main ✅

- **#57** responsive gantt/timeline axis — PR #65, merged `3f54aa0`
- **#58** resizable editor column (draggable width handle) — PR #66, merged `55359f1`
- **#69** eslint `max-lines` 250 LOC **warn** (33 offenders; error would break CI; exempts tests/stories/proto) — merged `9559841`
- **#60** center SavePickerModal close ✕ — PR #70, merged `5fc625b`
  - ⚠️ ASK USER: fixed the `aria-label="Close"` ✕ in SavePickerModal. There's also an `UndoToast` "Dismiss" × (`UndoToast.tsx:73`) left untouched. Confirm which 'x' the screenshot meant; UndoToast fix is a one-liner if needed.

- **#63** create_page scaffolds a real table — PR #67, merged `76396d4`. Eval 28/29 (both #63 cases PASS).
- **#64** kanban card → page-preview modal + Open-page expand — PR #71, merged `1192aeb`. Rebased builder work; code CI green (incl. Storybook Playwright); prior review verdict ship/spec-complete.
- **#61** image/file attachments — composer paperclip + page `image` block on a Supabase Storage bucket — PR #72, merged `bb2d21f`. Both scopes landed (no split). Full jest 1334 green.
  - ✅ DEPLOY PRE-REQ DONE (verified 2026-09-12): `supabase/migrations/0008_attachments_bucket.sql` is applied to prod (`ifhahsvgqedvygpdeaix`). Verified via mgmt API: bucket `attachments` (public, 10485760B limit, 7 mime types) + all 3 RLS policies (`attachments_insert_own_folder`/`_read`/`_delete_own_folder`) present and matching spec. Attachments work live.

- **#59 (+#62)** scope-before-build gate — PR #68, merged `4302da6`. Issues #59 + #62 closed. Story:
  - Baseline `main` = 82/87 (pre-existing fails: `M3 inventory→table` 0/3 `(no tool)`, `make-this-a-project` flaky 1/3 — `main` was NOT 87/87).
  - Builder's **draft-1 regressed 2 cases** (MERGED "Website Redesign" 3/3→0/3, inference "inventory page for workshop tools" 3/3→0/3) — both subject-carrying create requests over-scoped to `(no tool)`.
  - **Fixed** by reframing the SCOPING prompt section (BUILD is the default; named subject → build + scaffold defaults; titled project exempt from GRILL; when-in-doubt-BUILD). Deterministic `scoping.ts` + `scoping-gate.test.ts` unchanged.
  - **Final full eval `--runs 3` = 86/87** (0 ERROR): both regressions cleared 3/3, `make-this-a-project` fixed, M3 even _improved_ (main 0/3 → 2/3, 1 flake left — pre-existing, out of #59 scope). Strictly better than main. Evidence: `wayfinder/eval-baseline-main.txt`, `eval-59-full.txt`, `eval-59-fixed.txt`.
  - Non-blocking nit (not addressed): stale "separate tool batches" doc-comments in `step-budget.ts` + `route.ts` ~L126.

## ✅ All 8 UI-audit issues shipped. Follow-ups outstanding:

- ~~**#61 DEPLOY PRE-REQ**~~ ✅ DONE (verified 2026-09-12) — bucket + 3 RLS policies live on prod, matching the migration spec. No longer blocking.
- **#60 open question (from earlier session):** confirm whether the `UndoToast` "Dismiss" × (`UndoToast.tsx:73`) also needs the centering fix — one-liner if so.
- **Known pre-existing eval gap:** `M3 "make an inventory page for my workshop tools"` (from Home, no area) flakes to `(no tool)` ~1/3 — predates #59; a candidate for a future create_page-scaffolding tweak.

## Ship recipe (per issue, from primary repo root)

1. `git -C .claude-worktrees/feat-issue-N push -u origin feat/issue-N`
2. `gh pr create --head feat/issue-N --base main --title … --body "Closes #N…"`
3. CI gates code (jest/tsc/lint/build + **Storybook Playwright** = browser proof for UI). AI-routing issues also need the routing eval (credits required).
4. `gh pr merge <#> --squash --delete-branch`
5. Cleanup: `git worktree remove --force .claude-worktrees/feat-issue-N; git branch -D feat/issue-N; git fetch origin main:main`

## Gotchas hit

- `gh pr merge --delete-branch` can't delete a local branch still held by its worktree → remove the worktree first, then `git branch -D`.
- Worktrees symlink `../../node_modules` + `.env*`; the Storybook vitest project can't run from a worktree (symlinked node_modules outside Vite fs root) — **CI runs it instead**, that's the real gate.
- Anthropic **API credits** (in `.env.local`) power routing eval + browser chat; **account session limit** is separate (resets 11pm ET).
