# HANDOFF — Board-authoring / SMS PR split

**Date:** 2026-09-08
**Repo:** `/Users/charlespfaff/Documents/Code/Projects/Pond-v4`

## What's DONE

- **Board authoring Slices 0–4 built, live-verified, and committed.** Two commits:
  - `93db1ac` (Slices 0–3): `/board` preset + card CRUD + mode switcher.
  - `bad72cd` (Slice 4): manual column add/rename/reorder + "+ Add property" (date → Gantt).
  - tsc clean, ESLint clean, 68 view unit tests green. Live-verified end-to-end (Blocked column + Start/End dates → Gantt bars; persists across reload; 0 console errors).
- **Board work has its own PR — [#55](https://github.com/pfaff-designed/Pond-v4/pull/55)** (`feat/board-authoring` → `main`). Cherry-picked cleanly onto `origin/main`; pushed. This PR is board-only and correct.

## The problem to finish: SMS separation

The two board commits **also still sit on `feat/issue-14`** (the SMS branch, PR **#54** `feat: inbound SMS capture endpoint`). So #54 currently double-shows the board work. Goal: **`feat/issue-14` should contain SMS work only.**

`feat/issue-14` commits above `main` (top→bottom):

```
bad72cd  board Slice 4          <- REMOVE from this branch
93db1ac  board Slices 0–3       <- REMOVE from this branch
bd7e641  fix(composer) voice btn        } these + below = SMS/other work
8022e72  fix(composer) ghost suggestion } that belongs on #54
b39330d  feat(ai) dev instrumentation
d3deaeb  fix(ui) rail focus
1f08882  feat: inbound SMS capture (F24, #14)
```

### Recommended path (lowest risk): rebase after #55 merges

1. Merge **#55** into `main`.
2. `git checkout feat/issue-14 && git fetch origin && git rebase origin/main`
   → Git drops `93db1ac`/`bad72cd` as duplicates (already in main). `feat/issue-14` becomes SMS-only. Force-push. No manual conflict surgery.

### Alternative (do now, but conflicts): reset + force-push

`git reset --hard bd7e641` drops the 2 board commits but would **lose the uncommitted UI-audit work** (see below) and, if stashed first, the stash pop **conflicts on `palette.ts` + `BlockCanvas.tsx`** (board is committed there, UI-audit diff was cut against that board base). Avoid unless you resolve those two files by hand. The rebase path is cleaner.

## ⚠️ Uncommitted UI-audit work in the tree (do NOT lose)

`feat/issue-14` working tree has a **separate, in-flight "UI-audit" effort**, still uncommitted:

- Modified: `BlockInserters.tsx`, `chart-line/schema.ts`, `metric/schema.ts`, `stat/schema.ts`, `table/schema.ts`, `types.ts` (adds `paletteDescription`), and the **entangled** UI-audit lines in `palette.ts` (`d.paletteDescription ?? d.description`) and `BlockCanvas.tsx` (`addTextBlock` / `AddBlockButton onAdd`).
- Untracked: `wayfinder/BUILD-BRIEF-ui-audit.md`, `wayfinder/HANDOFF-db-primitive-verify.md`.

This UI-audit work is unrelated to both board and SMS. Brief: `wayfinder/BUILD-BRIEF-ui-audit.md`. It should eventually become its **own** commit/PR too. It is why the reset path is messy — its diff is entangled with board lines in `palette.ts`/`BlockCanvas.tsx`. During a rebase, keep it stashed (`git stash push -u`) and pop after — clean pop as long as the board commits remain on HEAD when popping (they will after rebase-onto-main since board is in main).

## Verification aids

- Test page "Board Test" (nodeId `18169a38-75ea-4e84-a8cc-5a017b03ea81`) — scratch page holding my Slice-4 test edits (Blocked column, Start/End props, reordered columns). Delete when done.
- Screenshot: `.playwright-mcp/slice4-gantt-verified.png`.
- Supabase project `ifhahsvgqedvygpdeaix` was live this session (free-tier auto-pauses after ~1wk idle → restore via management API if NXDOMAIN).
