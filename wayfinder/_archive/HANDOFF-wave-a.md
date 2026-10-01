# Handoff — Wave A (2026-09-30)

Session ran the "no grill, no decision" tranche. **3 of 4 landed on main; 1 needs conflict resolution.**

## main is green at `ff426f8`

```
ff426f8 feat(#108): area = page with children — drop type='area' (#141)
d2358b2 refactor(tokens): adopt MN type + radius tokens where byte-identical (#139) (#140)
91869e3 refactor(components): reclassify 7 mis-filed atoms as molecules (#128) (#138)
9812b7b fix(auth): hard-gate DEV_AUTOLOGIN on a non-production build (#136)
43ba2d2 chore(ci): get CI green — refresh 18 stale post-reskin assertions (#137)
```

Baseline (verify against this, don't trust a "known failure"): **tsc 0 · jest 108 suites / 1709 tests · storybook 57 files / 292 tests · eslint 0 errors** (52 `max-lines` warnings). Node **22** via `.nvmrc` — node 24 breaks `npm ci` with EUSAGE.

Jest gotcha in a worktree: default `testPathIgnorePatterns` contains `/.claude/`, which matches worktree paths and collects 0 tests. Override:
`npx jest --testPathIgnorePatterns '/node_modules/' '\.pglite\.test\.ts$' '/__tests__/helpers/'`

## START HERE — PR #142 is DIRTY

`feat/111-chart-big-number-view-modes` (#111, 27 files, +2568/−373). Was CLEAN and fully green; went DIRTY when #141 (#108) merged. Both touch `src/lib/modules/view/` and the pages layer.

It was reviewed **safe-to-merge, 0 blocking findings**, with proofs independently re-run. So: resolve conflicts, re-prove, merge. Do **not** re-review from scratch and do **not** re-decide anything — #111's body is a LOCKED spec.

Resolve in a worktree; a concurrent session shares the main working tree — never switch branches there.

## Two consequences to confirm with the user before/at merge

1. **#111 removes single figures from freeform pages.** Retiring the `metric` block means a figure is now only a view of a database — on a non-collection page there is no way to show one figure at all. Follows from the locked decision, but it is a real behaviour loss. Also: `bindKey`/`ref` plumbing now has zero consumers (kept deliberately); 8 of 11 chart kinds accept config but render "not drawn yet" (the kinds are #94, deliberately out of scope).
2. **#108 changed what counts as content.** `isContent = !hasChildren` → an empty top-level page intended as an area counts as content until it gains a child. Overview numbers move.

## Migration 0010 is committed and NOT applied

`supabase/migrations/0010_drop_area_type.sql`. User explicitly reserved `supabase db push` for themselves — **do not apply it.** On apply: rewrites every `type='area'` row to `'page'` (tag only; no rows added/deleted/reparented/reordered), inside a transaction, updating rows _before_ narrowing the CHECK. Proven against PGLite seeded through `0009`. Known nit: seeds `'Finances'` where AC6/#107 say `'Financial'`.

## Also outstanding

- **AC8 of #108 unverified in-browser.** A concurrent session holds the Playwright browser. Same blocker kills the "live visual verify" card — still the MN reskin's only unproven axis (`HANDOFF-mn-reskin-3.md`).
- **Token sweep leftovers are decisions, not work** (#139 shipped 63 byte-identical swaps): `text-xs` (113 sites) + `text-sm` (77) are off the MN scale — does 12px go to 11 or 13? `spacing-mn-*` has **zero** clean candidates (all 22 arbitrary px values are 2/3/5/7/9/11/14/18/22/26/252; none land on 4/8/12/16/24/32) → needs a rem-vs-px ruling. 28 distinct font sizes against an 8-step scale.
- **#128 did not settle the control layer.** AGENTS.md fixes layers as atoms/molecules/organisms; no `controls/` exists. `ProposalActions` and probably `VoiceInputButton` move again when PondControl lands.
- **`chore/eslint-ignore-wayfinder` is redundant** — its commits landed squashed as `43ba2d2`. Safe to delete.
- Workflow worktrees may linger under `.claude/worktrees/wf_f1e66f54-7a4-*`; `git worktree prune` after removing them.

## Next work, in order

1. Resolve + merge **#142**.
2. **#102 → #103 → #104** — strictly sequential, each size-L. Specs are LOCKED in **#110** / **#109** and now cross-linked from each build issue. No grilling needed. This is the chain that needs a fresh context.
3. Needs the user, not an agent: **#112**, and **#134 + #135 together** (both turn on the same question — does area hue/glyph stay hashed off page id, or become explicit per-area assignment?).

## Board

The Pond page `Creativity › Pond` holds 34 cards (collection page `e023a498-a711-4133-8b7f-afca1c00ddbd`; rows are child pages of `type='row'`, status value = option **id**). #128/#139 and #108 are now done and their cards should move to Done; #111's moves when #142 lands.
