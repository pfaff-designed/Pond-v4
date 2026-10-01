# MN reskin — session 3 handoff (2026-09-28)

Supersedes `HANDOFF-mn-reskin-audit2.md`. **All audit-2 findings (#1–#14) are now resolved.** Branch `feat/mn-token-layer` (worktree `Pond-v4-mn`) — **still NOT committed/pushed** (28 files staged in working tree, clean stopping point). Node 22.

## Verification (proven this session)

- `tsc --noEmit` → **0 errors**.
- `jest` → **1454 pass / 14 fail**. The 14 are the SAME pre-existing terminal-render `findByPlaceholderText(/Talk to Pond/)` timeouts in 5 suites (baseline before any of this work). None of the 28 edited files are among the failing suites → zero new failures.
- **Visual: NOT yet live-verified.** The token/glyph/shadow/motion swaps compile and pass tests but have not been eyeballed in Storybook. See "Next" below.

## What shipped (28 files, +189/−115) — all uncommitted

| Finding           | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| globals.css typo  | **All 21** `var(----…)` four-dash refs in the `@theme inline` block fixed (audit only named 2). The whole chart color-utility system (`text-chart-label`, `bg-chart-tooltip-*`, …) was dead; now resolves. Verified no four-dash names are defined anywhere + all two-dash targets exist.                                                                                                                                                                                                                                  |
| #4/#5/#6/#14      | Literal glyphs → hand-drawn SVG (house convention: viewBox 12, stroke 1.4, round caps): metric `→`, view `‹`/`›`, view checkbox `✓`, chart-card `↕`/`↔`.                                                                                                                                                                                                                                                                                                                                                                   |
| #8                | 3 kanban/group/calendar drop-containers: 4-side border → paper. Idle `shadow-mn-sm`; drop-target lifts to `shadow-mn-md` + `bg-press-accent-wash`.                                                                                                                                                                                                                                                                                                                                                                         |
| #11/#12/#13       | tooltip-box → `rounded-mn-inner`/`shadow-mn-md`; `hover:shadow-md`→`-mn-md` (3 sites); dropped `--color-zinc-500` fallback in bar-y-axis.                                                                                                                                                                                                                                                                                                                                                                                  |
| **#1** (grilled)  | **Curated MN palette.** `TOKEN_DOT` rewritten: 18 raw Tailwind names → 8 house hues via CSS vars (neutrals→olive-mid, red/rose→red, pink→**new `--raw-rose #c48a94`**, orange/amber→burnt-orange, yellow/lime→wheat, green/emerald/teal→sage, cyan/sky/blue→mist, indigo/violet/purple→navy, accent→press-accent). `OptionDot` now renders via inline `style.backgroundColor`. Removed unused `CSSProperties` import. No picker UI offers these names — colors come from schema data, so `TOKEN_DOT` was the only surface. |
| **#3** (grilled)  | Repointed `var(--mn-area-a)` → `var(--chart-scale-05)` (ink) at heatmap-colors.ts:96 + pattern-preset.tsx:179. Area colours reserved for area separation.                                                                                                                                                                                                                                                                                                                                                                  |
| **#9** (grilled)  | 4 toolbar/segmented/input chrome controls: `border border-press-hair` → `shadow-mn-sm`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **#10** (grilled) | **Bklit motion sweep** — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| #7 (`+`)          | **N/A** — every site the audit listed is a code comment or an input `placeholder="+ Add card"` string; neither can hold SVG. Correctly left untouched.                                                                                                                                                                                                                                                                                                                                                                     |

## #10 Bklit motion — decisions + what changed

Two feel-decisions were grilled (not picked unilaterally):

1. **Signature reveal → snap to 560ms + house curve** (user chose this over keep-1100/leave-alone). Applied to BOTH the shared consts AND the per-component prop defaults (the prop defaults override the const, so charts really draw at 560 now):
   - `animation.ts`: `DEFAULT_ANIMATION_DURATION_MS` 1100→560; `DEFAULT_ANIMATION_EASING` + `.ease` array → house curve.
   - `heatmap-animation.ts`: `HEATMAP_DEFAULT_ENTER_DURATION_MS` 1600→560; `HEATMAP_DEFAULT_ENTER_EASE` → house curve.
   - Per-component `animationDuration = 1100` → `560` in area-chart, bar-chart, line-chart; `|| 1100` → `|| 560` in bar-squares (×4) + bar.tsx. JSDoc `Default: 1100` updated to 560 where the default was changed.
   - `line-loading-timing.ts` `LINE_LOADING_PULSE_EASE` → house curve.
2. **Springs → drop OVERSHOOT only** (user chose over drop-all). `ring.tsx` hover spring (`stiffness:400,damping:25`, both sites) → `{ duration: 0.15, ease: house }`. Functional following-springs in `motion-utils.ts` and `date-ticker.tsx` (`useSpring`) KEPT.

- Micro-motion literals routed to house curve/scale: durations `0.1→0.09`, `0.22→0.28`, `0.4→0.46` (0.15/0.28/0 left); `easeInOut/easeOut` idents + `ease-in-out`/`ease-out` CSS strings + `cubic-bezier(0.85,0,0.15,1)` → house curve; tooltip-content className → `duration-[var(--motion-quick)] ease-[var(--ease-press)]`.

### Known loose end (deliberate, low priority)

- `ring-chart.tsx:53` — JSDoc `Default: 1100` but the prop is optional (`animationDuration?: number`) with **no** runtime `= 1100` default. Left as-is rather than stamp an unverified 560. If you want doc accuracy, trace the effective ring reveal default and update the comment.

## Next session

1. **Live visual verify** (the only unproven axis). Node 22, Storybook :6006. Check: a board/table view (option dots recolored, drop-container shadows, segmented control shadow, `✓`/`‹›` SVGs), a line/bar/area chart (560ms house-curve reveal, no bounce), a heatmap (accent preset now ink, 560ms reveal), tooltip. Screenshots save to `~/verify-*.png` (home dir, not `.playwright-mcp/`).
2. **Commit / PR.** Whole `feat/mn-token-layer` branch is unpushed. Suggest one commit for the reskin-audit fixes (or split motion #10 from the color/glyph batch). Remember: regen lockfile under Node 22 if deps change; Supabase free tier auto-pauses (restore via mgmt API if app 500s).
3. Optional: ring-chart JSDoc loose end above.
