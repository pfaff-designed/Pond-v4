# MN reskin — audit round 2 handoff (2026-09-28)

## Shipped this session
Branch `feat/mn-token-layer` (worktree `Pond-v4-mn`), **NOT pushed**. New commit:
- `e8f180c` fix(reskin): stop sage leaking into functional roles; sans tables, SVG close marks, one easing curve
  - **Root cause fix (token-level):** `--press-accent*` was sage (an AREA colour) but fed FUNCTIONAL roles across ~40 files. Repointed `--press-accent*` → ink (light) / paper (dark) in `src/app/globals.css` (lines ~325-327 light, ~408-410 dark). Cascades to every shadcn role + every `press-accent*` className at once. Rail `LifeMark` switched to `--mn-area-a` to stay sage.
  - Markdown tables → `font-sans` (both variants); prose stays serif.
  - 5 literal `×` → hand-drawn SVG (stroke 1.4, round caps, path `M3 3l6 6M9 3l-6 6`): CsvAttachmentPill, QuoteChip, RelationChip, FileAttachmentChip, BlockCanvas.
  - Easing: `--ease-out`/`--ease-in` collapsed to house curve `cubic-bezier(.22,.8,.2,1)`.
- **Verified:** tsc clean; jest 1454 pass (14 failures PRE-EXISTING on branch, terminal-render `findByPlaceholderText(/Talk to Pond/)` timeouts, unrelated). Live Storybook: Rail (sage glyphs kept, ink selection fill), RelationChip (ink wash + SVG close), Markdown (sans table).

## Audit round 2 result (charts + modules — the area the round-1 auditor failed on)
Read-only agent, 2026-09-28. **3 High, 8 Medium, 4 Low.** `press-*` all resolve ink/paper ✓, `--chart-1..5` monochrome ink ramp ✓, no lucide ✓, no serif-weight violations ✓ (all `font-medium` hits are on sans tables/labels = correct).

### High — colour-system
1. `src/lib/modules/view/view.tsx:1361-1382` — `TOKEN_DOT` maps option/select colours to ~18 raw Tailwind palette classes (red/sky/blue/indigo/violet/purple/pink/emerald/teal/cyan/lime/green/yellow/amber/orange + zinc/slate/stone). A rainbow outside the ink/paper/signal/area system. **DECISION NEEDED:** ink-tier ramp loses distinguishability for many options — grill the user on whether option dots become an ink ramp, the 3 area marks only, or a sanctioned extended palette.
2. ~~`src/components/charts/tooltip/date-ticker.tsx:23,96` — hardcoded zinc/white pill.~~ **DONE** (commit below): → `bg-[var(--chart-tooltip-background)] text-[var(--chart-tooltip-foreground)]` (self-themes dark) + `shadow-lg`→`shadow-mn-md`. tsc clean; visual deferred (interactive-only surface, shows on scrubbing a 60+ point chart).
3. `src/components/charts/heatmap/heatmap-colors.ts:96` & `src/components/charts/pattern-preset.tsx:179` — `"accent"` preset uses `var(--mn-area-a)` as a functional chart fill/pattern stroke (area mark in a series role). Use a `--chart-*` ink token; reserve `--mn-area-*` for genuine area separation. **Debatable — confirm intent.**

### Medium — type/icon register
4. `src/lib/modules/metric/view.tsx:143` — literal `→` in a nav button ("go to source") → inline SVG arrow.
5. `src/lib/modules/view/view.tsx:674,683` — literal `‹`/`›` move-column chevrons → inline SVG.
6. `src/lib/modules/view/view.tsx:1260` — literal `✓` checkbox-checked glyph → inline SVG check.
7. `+`/`+ Add` control affordances as literal `+` text: `kanban/view.tsx:591`, `text/view.tsx:16`, `view/view.tsx:329,556,559,581,798` → prepend hand-drawn plus SVG (reuse TreeRow's `M6 2.4v7.2M2.4 6h7.2`).

### Medium — paper-not-frames
8. `kanban/view.tsx:191`, `view/view.tsx:642,893` — column/group containers are full 4-side bordered boxes (`rounded-mn-inner border border-press-hair`) → convert to `shadow-mn-*` paper surfaces. (Cards inside already use shadow-mn-sm ✓.)
9. `view/view.tsx:283,312,384,390` — toolbar/segmented controls with full `border` boxes (lower confidence — chrome controls). Confirm before touching.

### Medium — motion off-token (pervasive in vendored Bklit chart lib — treat carefully)
10. Hardcoded durations off {90,150,280,460,560} + non-token easings/springs across `src/components/charts/`: `duration:0.22` (heatmap-cells:42, heatmap-legend-gradient:12, heatmap-legend:24), `0.4` (highlight-segment:63, bar-x-axis:62), `0.1` (tooltip-box:216), `"opacity 0.15s ease-in-out"` (bar-squares:474, bar:164,434, series-markers:249), `"opacity 0.4s ease-in-out"` (x-axis:83); easings `easeInOut`/`easeOut` (highlight-segment:63, bar-x-axis:62, series-hover-dim:51, background:123); overshoot springs `stiffness:400,damping:25` (ring:185,218); `DEFAULT_ANIMATION_EASING="cubic-bezier(0.85,0,0.15,1)"` (animation.ts:4). Route through `--motion-*`/`--ease-press`, drop springs. **NOTE: Bklit is vendored — a broad sweep here is its own scoped task.**

### Low — polish
11. `charts/tooltip/tooltip-box.tsx:179` — `rounded-lg shadow-lg` → `shadow-mn-*`/`rounded-mn-*`.
12. `kanban/view.tsx:232`, `view/view.tsx:716,916` — `hover:shadow-md` → `shadow-mn-*`.
13. `charts/bar-y-axis.tsx:42,47` — drop `var(--color-zinc-500)` raw-palette fallback.
14. `chart/card.tsx:92-93` — axis labels use `↕`/`↔` text glyphs; consider SVG for register consistency.

## Also spotted (pre-existing, not in audit scope)
- `src/app/globals.css:256-257` — quadruple-dash typo: `--color-chart-tooltip-foreground: var(----chart-tooltip-foreground)` and same for `-background`. Breaks the `bg-chart-tooltip-*` / `text-chart-tooltip-*` Tailwind utilities (should be two dashes). Chart code that uses raw `var(--chart-tooltip-*)` is unaffected. Quick fix.

## Next session
1. Grill decisions on findings #1 (option-dot palette), #3 (area colour in chart fill), #9 (chrome control frames).
2. Batch the mechanical ones: #2 (date-ticker), #4-7 (literal glyphs → SVG), #8 (frames→shadow), #11-13.
3. Treat #10 (Bklit motion) as a separate scoped pass.
4. Re-verify tsc + jest + Storybook; the whole `feat/mn-token-layer` branch is still unpushed — decide when to push/PR.
