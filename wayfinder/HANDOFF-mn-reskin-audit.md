# MN reskin — audit handoff (2026-09-27)

## Where things stand

- Worktree `Pond-v4-mn`, branch `feat/mn-token-layer`, **NOT pushed**. Commits:
  - `6ee8bb3` token+font foundation
  - `b8ec026` MN reskin (55 files)
  - `07da45c` round-2 visual fixes (green border, proposal spacing, ring cutoff, palette highlight, ghost overlap)
- tsc clean. Storybook was running on :6006 (may need restart: `nvm use 22 && npm run storybook`).

## Re-audit result (read-only)

Full report: `/private/tmp/claude-501/-Users-charlespfaff/d8fe0059-7341-4652-9dae-d63aa818584c/tasks/wws6unaqm.output`
(copy it somewhere durable before /tmp clears). One auditor **failed** (`charts+modules`, API error) — **re-run that area**.

### Headline systemic root cause (fix first — one change, many sites)

`--press-accent` resolves to **sage `#648F7B` (an AREA colour = marks only)** but is piped into FUNCTIONAL roles in `Pond-v4-mn/src/app/globals.css`:

- `--sidebar-primary` (line ~364) → sage as a solid fill
- `--ring` / `--sidebar-ring` (~350, 369) → sage focus rings on every control
- `--secondary` / `--muted` / `--accent` / `--sidebar-accent` (~325-327, 341-346, 366-367) → sage washes as surface/hover fills
- `.motion-focus-draw::after` (~617-635) → sage hairline under composer
- Atoms (`CsvAttachmentPill`, `FileAttachmentChip`, etc.) fill chips with `bg-press-accent-wash` (sage 6%)

**Fix:** re-point these functional roles to ink tiers (e.g. an `--mn-hover-fill` ink-opacity tint) / paper, NOT sage. Sage stays only on area glyphs + page-kind dots. This clears the single largest deviation cluster.

### Other confirmed items

- `Markdown.tsx`: tables render **serif** (must be sans); `th` uses `font-medium` (~400, prose serif is 200/800 only); blockquote/table use `border-l/-t/-b` frames (paper-not-frames).
- Functional close marks are literal `×` text, not hand-drawn stroke-1.4 SVG.
- `--ease-out`/`--ease-in` curves ≠ law's single `cubic-bezier(.22,.8,.2,1)`.
- `.press-glass` values drift slightly from mockup (white glass border is legit chrome, only values differ — low).

## Next session

1. Re-run the failed `charts+modules` auditor (resume: `Workflow({scriptPath:".../wayfinder/mn-reskin-audit.js", resumeFromRunId:"wf_3e7cbdc9-90b"})`).
2. Apply the sage-role root-cause fix in globals.css + atom chip fills; then Markdown tables→sans, icon SVGs, easing.
3. tsc + Storybook re-verify; commit on `feat/mn-token-layer`.
