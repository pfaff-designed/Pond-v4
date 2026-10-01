# Master build queue — Pond-v4 (phases 0→7)

> ## ⚠️ RE-BASELINE 2026-09-29 — READ FIRST (supersedes "Immediate next 3 actions")
>
> The original queue below was authored on the stale branch `feat/terminal-input-only-peek`
> (forked at `faf4b6e`, **before** the Make Noise reskin merged). `main` is 12 commits ahead.
> Verified against `main` on 2026-09-29:
>
> **Wave 1 (#85–#90) is ALREADY BUILT and merged to `main`** — `6ee8bb3 feat(tokens): MN token +
font foundation (#85–#90)` + `b8ec026 apply MN design language across component library` + chart
> reskin. `globals.css` carries all six token issues (inline `#85/#87/#88/#89/#90` markers); all 10
> PP faces present. **The issues #85–#90 are still OPEN on GitHub** (code landed, never closed) →
> verify + close, don't rebuild.
>
> - `--press-*` kept as value-correct **aliases** (nothing broke) → **#92 (press→color rename +
>   retire lucide) is NOT done**: 91 `press-*` refs + `lucide-react` still on `main`.
> - Charts: chart-area/bar/line + heatmap + metric + metric-ring + stat exist & MN-retinted, but
>   **#94's view-mode refactor (gated on #111 spec) remains.**
>
> **NOT on `main` (real remaining Wave 2):** #91 glyph mask, #93 PondAtom, #95 PondMolecule,
> #96 shell reskin, #92 rename+retire-lucide, #94 view-mode refactor.
>
> **#84 status:** was stranded on the stale branch, never on `main`. Rescued 2026-09-29 to branch
> `feat/mn-foundation-rescue` (2 commits: docs = MN design law + AGENTS.md rules that `main` also
> lacked; feat = #84 + migration `0009`). Validated: 36 unit + 11 pglite tests green. Pending: PR →
> merge → `supabase db push` (collapses prod pages 94→56, run with explicit go-ahead).
>
> **Corrected immediate actions:**
>
> 1. Land `feat/mn-foundation-rescue` PR (design law + AGENTS.md rules + #84) → then `db push`.
> 2. #107 doc-only spec amend (still valid, ~15 min).
> 3. Verify + close #85–#90 on GitHub (code is on `main`).
> 4. `/spec #111` (gates #94/#100/#101), then real Wave 2: #93 → #95 → #94 · #96 → #91 · #92 LAST.
>
> Everything below is the ORIGINAL (stale) plan — kept for the dependency graph + verify checklists,
> but its "Wave 1 SEQUENTIAL / start at #85" framing is DONE. Read the waves as still-accurate for
> #91–#106; ignore Wave 1 as pending.

**Date:** 2026-09-28
**Scope:** dependency-ordered execution order for all 30 open non-epic issues.
**Companion docs:** decisions in `project_pond_reconcile_decisions` (memory); throughput workflow + Lane model in `HANDOFF-mn-reskin-audit.md` / the backlog-planning handoff.
**Runner:** `.claude/workflows/ship-issue.mjs` (Fable builds in isolated worktree → Standards+Spec review → verify-checklist; `args: <issueNumber>`). Opus owns live-verify + merge.

Legend: 🟢 buildable now · 🟡 parallel-eligible (files disjoint) · 🔴 gated (blocker in parens) · 📝 spec-first · 👤 needs user decision

---

## Dependency graph (edges that actually constrain order)

```
#85 palette ──► #86 dark
#88 fonts ─────► #87 type
                                   Phase0 tokens ──► Phase1 spine
#93 atom ──► #95 molecule
#111 spec ─────► #94 chart, #100 bind, #101 turn-into
#108 migrate ──► #96 shell/rail   [pulled forward, before Phase 1]
#96 shell ─────► #91 glyphs
(all consumers migrated) ──► #92 rename+retire-lucide   [LAST]
#110 spec ─────► #102 change-log ──► #103 revert, #104 undo
#109 spec ─────► #104 undo
```

---

## Wave 0 — Loose pre-work (no deps, clears noise, do anytime)

| #       | Issue                | State                       | Note                                                                                                                                                                                                                                         |
| ------- | -------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 #107 | Money vs Finances    | agent-ready, doc-only       | Decision = keep `Finances`. Amend spec text, **no code**. ~15 min.                                                                                                                                                                           |
| 🟢 #84  | page-name uniqueness | **VERIFY FIRST**            | Memory: migration 0009 built+verified but UNCOMMITTED on some branch. Confirm real state before touching; if real → commit+push (`supabase db push` collapses prod 94→56).                                                                   |
| ⏸️ #14  | SMS capture          | banked (decided 2026-09-28) | PR #54 **closed** — built pre-#108/#110 (wrote `type='area'` + direct page write, no change-log). Branch `feat/issue-14` kept: salvage `src/lib/capture/sms.ts` as-is, redo write path (page + change-log) after Phase 3. Off critical path. |

## Wave 1 — Phase 0 token foundation 🔴 SEQUENTIAL

All six mutate `src/app/globals.css` + token files → parallel worktrees collide. Run one-at-a-time through `ship-issue.mjs`. Order respects internal deps.

1. 🟢 **#85** palette + semantic colours (light) — FOUNDATION; everything visual keys off it. Keeps `--press-*` as value-correct aliases (nothing breaks).
2. 🔴 **#88** fonts Google→PP local — blocks #87.
3. 🔴 **#87** type system (voices + UI scale + prose/answer) — needs #88 (faces loaded; serif-never-400 enforced by only loading 200/800).
4. 🔴 **#86** dark theme (single MN dark) — needs #85 (raw palette).
5. 🟢 **#89** surfaces (radii + shadow + glass) — independent.
6. 🟢 **#90** spacing scales (component + layout) — independent, lowest risk.

## Spec interlude 📝 (write before the gated build; do during/after Wave 1)

These are the 4 decided-but-unspecced reconcile issues. Grill half done → run `/spec` (decision → acceptance criteria). Each **folds into** a functional issue.

- ✅ **#111** charts/big-number = view-modes of a database → **SPECCED 2026-09-28** (agent-ready, phase-1). Locked: chart/big-number become `mode` values of the existing `view` block; standalone data-holding chart/stat/metric blocks deprecated (read-tolerant like kanban). Rewrites #94 (kinds→`chart.kind`), #100 (bind→view-of-db), #101 (unchanged). Grounded in design law (view = block that shows a database; record is source of truth).
- ✅ **#108** area = page (drop `type='area'`) → **SPECCED 2026-09-28** (agent-ready, phase-1), pulled forward before #96. Locked: area has NO technical meaning (design law); drop `'area'` from type CHECK, migrate rows→`page`; area-ness = has-children (computed); `isFolderNode = top-level || has-children`; surface switch on blocks/children not type; `isContent = !hasChildren`. Glyph/colour deferred to #91. Coordinate migration number with #84. (its body: "Blocks area-as-page modelling and the two-roots surface work" = #96). Spec early with #111; migration lands, then #96 reskins the final model. No longer Phase 3.
- ✅ **#110** diff durability → durable change-log → **SPECCED 2026-09-28** (agent-ready, kept phase-3). Locked = Option A: durable, only-grows `change_log` table (per pond = `user_id`+`workspace`), one record per action, before/after snapshots + the 8 statuses (proposed, accepted, rejected, changes_requested, outdated, withdrawn, undone, reverted); status state-machine + linked records (revert/revise/undo); own edits log as `accepted`, Pond's updates as `proposed`. Ephemeral `{messages,resolutions}` envelope **demoted to session UI cache** (source of truth moves to the table). Renders via DB views (all/proposed/by page/memory/deleted). **Gates #102** (store) / #103 (revert) / #104 (undo) / #105 (log UI). Grounded in design law (Concepts 3a `change log`/`diff`/`outdated`, AUDIT W6 + 6o + storyboard 06.15).
- ✅ **#109** session-undo → revert-from-log → **SPECCED 2026-09-28** (agent-ready, kept phase-3). Locked = Option A / decision C1: replace the deletion-only 6s grace window (`deferred-commit.ts`) with one **session-spanning** undo history over the person's own applied actions (edits/accepts/deletions/moves), spanning until tab/app close; each ⌘Z/⇧⌘Z is itself a logged record (target marked `undone`); cross-page undo opens the page first; **after the session → revert-from-log** (#103); undo becomes a proposed diff if it would remove others' later changes (fwd-compat). **Depends on #110/#102**, **gates #104**. Grounded in Concepts `undo` + AUDIT C1 + storyboard 06.15 frame 5.

(#107 doc-only, above. #112 = Phase 7 direction only, below.)

## Wave 2 — Phase 1 reskin the built spine 🔴(Wave 1 tokens landed)

1. 🟢 **#93** PondAtom (24-kind × 9-state) — spine foundation; molecules/blocks inherit reskin. FIRST.
2. 🔴 **#95** PondMolecule — composes atoms (after #93).
3. 🔴🟡 **#94** PondChart — 8 missing kinds **as view-modes** (after #111 spec) + MN retint. Can parallel #95 if files disjoint.
4. 🔴 **#96** Shell reskin + pond-name/switcher header — **after #108 migration lands** (resolved: migrate first). Switcher opens against multi-pond model (P7) → stub only.
5. 🔴 **#91** glyph mask-over-currentColor system — rides #96 rail.
6. 🔴 **#92** `press-*`→`color-*` rename + retire lucide — **LAST**; retires aliases only after every consumer migrated. size-L, touches everything.

## Wave 3 — Phase 2 core journeys 🟡 (functional; files fairly disjoint → parallel-eligible)

- 🟢 **#97** make-this-a-page from a streamed answer
- 🟢 **#98** diff request-changes flow + outdated state + show-original
- 🟢 **#99** reference → new page from selection (toolbar + linked quote)
- 🔴 **#100** block auto-bind to nearest table on insert (after #111 spec)
- 🔴 **#101** list → "turn into › table" gesture (after #111 spec)

## Wave 4 — Phase 3 durable change-log + memory 🔴 (heavy arch; spec-gated)

1. 🔴 **#102** durable change-log store (only-grows, 8 statuses) — FOUNDATION, after #110 spec. Replaces ephemeral transcript envelope. Gates #103/#104.
2. 🔴 **#103** revert-as-new-diff from the log — after #102.
3. 🔴 **#104** unified session undo → revert-from-log — after #102 + #109 spec. Replaces `deferred-commit.ts`.
4. 🟡 **#105** memory store: auto-recorded sourced notes — independent-ish, Phase 3.
5. 🟡 **#106** threads-as-a-database + context-fill warn/compact — independent, Phase 3.

## Later (direction only — not sequenced yet)

- **#112** real multi-pond model (dedicated pond table) — Phase 7.
- Phases 4 (templates #117), 6 (external sources #119), 8 (advanced #121) — no non-epic issues filed; epics are placeholders.

---

## Critical-path summary

```
#85 → #88 → #87 → #86 → #89 → #90            (Phase 0, serial)
         └─ spec #111, #108, #110, #109       (interleave)
#93 → #95 ┐
#94 ──────┤ (needs #111)                       (Phase 1)
#96 ──────┤ (needs #108) → #91                 (Phase 1)
#92 ─────────────────────── LAST               (Phase 1)
#97 #98 #99 · #100 #101(need #111)             (Phase 2, parallel)
#102(needs #110) → #103, #104(needs #109) · #105 #106   (Phase 3)
```

## Wave 1 execution detail (file-contention map + verify checklists)

**Contention finding: the whole token layer is ONE file — `src/app/globals.css`.** So all of #85–#90 are **hard-serial**; parallel worktrees would collide on every issue, not just the colour ones. `#88` also edits `src/app/layout.tsx` (fonts) but still touches the globals font-fallbacks → no parallel window. Confirms the handoff's SEQUENTIAL call.

`globals.css` regions (line anchors as of 2026-09-28):

| Region                                                  | Lines            | Owned by                                                             |
| ------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `@theme inline` — Press type set (families + fallbacks) | ~10–16           | **#88** (families) + **#87** (voices/scale) — shared region, #88→#87 |
| `@theme inline` — chrome tokens                         | ~17–31           | **#85** (colour chrome)                                              |
| `@theme inline` — motion system + easings               | ~32–119          | _(none in Wave 1 — locked by ticket-41)_                             |
| `:root` — Press palette raws (source values)            | ~122–137         | **#85** FOUNDATION                                                   |
| `:root` — shadcn semantic map onto Press                | ~138–193         | **#85**                                                              |
| `.dark` block                                           | ~194–243         | **#86** (needs #85 raws)                                             |
| liquid-glass (~430) + letterpress card (~416)           | components layer | **#89** (glass/shadow)                                               |
| radii / shadow / spacing token defs                     | `@theme`+`:root` | **#89** (radii/shadow) · **#90** (spacing)                           |
| `src/app/layout.tsx` next/font/local                    | —                | **#88**                                                              |

Per-issue verify (run each after its `ship-issue.mjs` pass; compare jest against the RED baseline — 14 jest + 4 storybook pre-existing fails, don't chase them):

- **#85 palette** — every `--press-*` alias still resolves (grep no dangling `var(--press-…)`); `audit-tokens` skill green (contrast on new light palette); Storybook chrome renders MN colours; tsc 0.
- **#88 fonts** — PP faces load via next/font/local (Network tab shows no Google fetch); fallback chain intact; only licensed faces referenced; `next build` clean.
- **#87 type** — serif-never-400 structurally (only 200/800 loaded → browser can't synth 400; check computed weight); voices + UI scale + prose/answer render; needs #88 present.
- **#86 dark** — toggle `.dark`: single MN dark renders, contrast passes, zero leftover shadcn oklch greys; tsc 0.
- **#89 surfaces** — radii/shadow/glass tokens resolve; liquid-glass chrome + letterpress cards intact (no visual break); tsc 0.
- **#90 spacing** — component + layout spacing tokens resolve; no Storybook layout blowout. Lowest risk → good confidence-builder to close the wave.

**Sequence (locked):** `#85 → #88 → #87 → #86 → #89 → #90`. One `ship-issue.mjs` at a time; Opus live-verifies + merges each before starting the next (each merge rebases the next onto the updated `globals.css`).

## Immediate next 3 actions

1. **Knock out #107** (doc-only, agent-ready) + **verify #84 migration state** — clears the loose pile.
2. **Start Wave 1 at #85** through `ship-issue.mjs` (serial, one at a time).
3. **`/spec #111` early** (before #94) — it's the only spec that reaches back into Phase 1.
