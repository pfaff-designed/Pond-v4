# Handoff — Make Noise adoption, resuming at Phase 0 part 2 (token layer)

_Written 2026-09-27. Paste this into a fresh Claude Code session in `Pond-v4` to continue._

## Where we are

The `design_handoff_pond` bundle (complete high-fidelity spec for the whole Pond product, in the **Make Noise** design language) was moved into `wayfinder/design_handoff_pond/`. **Decision: Make Noise supersedes the old "R6 Press / v85 Clearing" aesthetic — new decisions win over old wayfinder notes.**

**Done this session:**

- **Gap analysis** (7 parallel agents) → `wayfinder/GAP-ANALYSIS.md`. Read this first — it's the map.
- **Phase 0 part 1: rules folded into `AGENTS.md`** — new "Pond product rules (Make Noise)" section (authoritative source order, supersession, vocabulary, diff model, roles, design language, intelligence layer).
- Memory updated: `project_pond_make_noise_handoff.md`.

**Tasks:** #1 gap matrix ✅ · #2 rules ✅ · #3 token layer ⬜ (next) · #4 storyboard slices ⬜.

## Authoritative docs (in order — decisions beat mockups)

1. `wayfinder/design_handoff_pond/PROJECT_RULES.md` — product law
2. `wayfinder/design_handoff_pond/AUDIT.md` — flows + "Decided, 26 sep" log
3. `wayfinder/design_handoff_pond/*.dc.html` — final values inline (extract text with python tag-strip; don't Read whole — up to 280KB)
4. `wayfinder/GAP-ANALYSIS.md` — exists/partial/net-new + build plan
5. `AGENTS.md` "Pond product rules (Make Noise)" — the standing rules

## NEXT: Phase 0 part 2 — Make Noise token + font layer (task #3)

Foundation reskin that unblocks everything. **First, honour the global UI rule: confirm repo path (`/Users/charlespfaff/Documents/Code/Projects/Pond-v4`), that the package is the app root, and that it uses Tailwind v4 `@theme inline` (not shadcn-wrapper generation) — then grill/spec before building per AGENTS.md.**

Scope (from GAP-ANALYSIS §01, all values in README.md lines ~126-166 and `wayfinder/design_handoff_pond/_ds/mn/tokens/`):

1. **Colours** — adopt `_ds/mn/tokens/colors.css` as `--raw-*`; re-base semantic `--color-*`. Correct values: paper `#FAF9EF`, ink `#1B1D14` (dark card `#30312A`), ink tiers **exactly 3** (100/80/68). Add signal roles: burnt-orange `#D96629` (one dated thing/screen), wheat `#FFEFAE` (highlights only, carries ink text), red `#C55347` (diff removals only). Add area colours (marks only): sage `#648F7B`, mist `#A5C8D1`, navy `#12354E` (navy→mist on dark).
2. **Fonts** — swap the 4 Google fonts (`layout.tsx:2,9-28`) for the 3 licensed PP faces via `next/font/local`: PP Editorial New (serif, **200/800 only, never 400**), PP Neue Montreal (sans), PP Neue Montreal Mono (machine surface). Assets in `_ds/mn/assets/fonts/`.
3. **Type tokens** — add voice tokens + 8-step UI scale (11/13/16/18/22/28/36/46); prose 17.5/1.75 58ch; answer 13.5/1.55.
4. **Surfaces** — card radius 20 (currently base is 10 = MN's _row_ value); pills 999 / composer 20 / inner 14 / rows 10. Glass is near-exact (`globals.css:430-443`), tint tweak only.
5. **Icons** — remove **lucide** (in `Rail.tsx`, `TerminalDrawer.tsx`; `components.json` iconLibrary); build glyph-mask-over-currentColor system (`_ds/mn/assets/icons/`, `icon-mask.js`) for area/page marks; standardise functional SVG to stroke 1.4 round caps.
6. **Naming** — migrate `--press-*` → MN `--raw-*`/`--color-*`; update `src/components/atoms/press-kicker.ts`, `dialog-chrome.ts`.
7. **Motion** — already matches MN exactly (`globals.css:50-61`); rename to MN token names only if desired.

**Key files:** `src/app/globals.css`, `src/app/layout.tsx`, `components.json`, `src/components/atoms/{press-kicker,dialog-chrome}.ts`. **Don't** rebuild components yet — that's Phase 1 (reskin the spine family by family).

## Remaining phases (from GAP-ANALYSIS)

P1 reskin spine → P2 finish core journeys (01–10) → **P3 durable change-log/diff store** (pivotal — diffs are ephemeral transcript parts today) → P4 templates → P5 onboarding/settings/themes → P6 sources → P7 collaboration/multi-pond → P8 advanced (deep research/zen/freeform/agents/reminders). Each slice: grill→spec→build→verify via `.claude/workflows/ship-issue`.

## Open reconciliations (decide at the relevant slice)

Area name **Money**(spec) vs **Finances**(code) · area-as-type vs area-as-page · ephemeral vs durable diffs · chart/big-number as view-mode vs block · `workspace` col is main/sandbox (not a pond).

## Repo state

Branch `feat/terminal-input-only-peek`; pre-existing uncommitted work (migration 0009, dedupe-title, terminal peek). This session added only docs (`wayfinder/GAP-ANALYSIS.md`, this handoff) + `AGENTS.md`. Nothing committed.
