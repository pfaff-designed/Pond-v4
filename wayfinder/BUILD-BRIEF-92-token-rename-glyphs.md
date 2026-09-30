# Build Brief — #92: press-* → MN token rename + glyph system

_Grilled + specced 2026-09-29. Supersedes the issue body's "family-by-family / remove lucide" framing: **lucide is already gone (0 imports)**; the icon clause is satisfied. Two sequential PRs, both close #92._

**Authoritative rules:** `AGENTS.md` "Design language (Make Noise)" + `wayfinder/design_handoff_pond/PROJECT_RULES.md` §colour/icons + `_ds/mn/readme.md` §Iconography. Core mandate: **no `press-*` naming survives a file we touch**; area marks = glyph via CSS mask over `currentColor`; page-kind marks = `KindDot`.

---

## PR-1 — Token rename (mechanical, pixel-identical). Execute as a deterministic codemod.

Goal: collapse the `press-*` token vocabulary into the one true MN contract (`mn-*` / `raw-*`) with **zero visual change**. Verified by `tsc` 0 + jest green + Storybook spot-check showing no pixel diff.

### 1. Color-utility + var mapping (segment → segment, property-prefix preserved)
`bg-press-paper`→`bg-raw-paper`, `text-press-ink`→`text-mn-text`, `var(--press-ink)`→`var(--mn-text)`, `var(--color-press-ink)`→`var(--color-mn-text)`, etc. **Apply longest-token-first** (accent-soft before accent; lime-ink before lime) or the codemod corrupts.

**CORRECTED against dark theme:** `press-paper`/`press-card`/`press-lime-ink` are theme-aware surface roles (flip on `.dark`), so they map to coined theme-aware tokens, NOT fixed `raw-paper`. **5 new tokens.**

| `press-*` token | → target | light | dark |
|---|---|---|---|
| `press-paper` | **`mn-surface`** (NEW) | raw-paper | raw-ink (ground) |
| `press-card` | **`mn-card`** (NEW) | raw-paper | raw-card-dark |
| `press-lime-ink` | **`mn-surface`** | raw-paper | raw-ink |
| `press-ink` | `mn-text` | raw-ink | raw-paper |
| `press-body` | `mn-text-meta` | 0.8 | 0.8 |
| `press-muted` | `mn-text-secondary` | 0.68 | 0.68 |
| `press-line` | `mn-line` | 0.09 | 0.12 |
| `press-hair` | `mn-hair` | 0.055 | 0.07 |
| `press-accent` | `mn-text` | raw-ink | raw-paper |
| `press-lime` | `mn-text` | raw-ink | raw-paper |
| `press-rust` | `raw-red` | red | red |
| `press-faint` | **`mn-text-faint`** (NEW) | 0.30 | 0.30 |
| `press-accent-soft` | **`mn-selected-fill`** (NEW) | 0.12 | 0.20 |
| `press-accent-wash` | **`mn-wash`** (NEW) | 0.06 | 0.10 |

### 2. New tokens (coin in globals.css, exact values, both themes — pixel-identical)
Add to the `--mn-*` role block (light `:root`) + `.dark` block, and expose via `@theme` `--color-*`:
- `--mn-surface`: light `var(--raw-paper)`, dark `var(--raw-ink)`
- `--mn-card`: light `var(--raw-paper)`, dark `var(--raw-card-dark)`
- `--mn-text-faint`: light `rgb(27 29 20 / 0.30)`, dark `rgb(250 249 239 / 0.30)`
- `--mn-selected-fill`: light `rgb(27 29 20 / 0.12)`, dark `rgb(250 249 239 / 0.20)`
- `--mn-wash`: light `rgb(27 29 20 / 0.06)`, dark `rgb(250 249 239 / 0.10)`

Then repoint the shadcn semantic tokens (`--background`→`var(--mn-surface)`, `--card`→`var(--mn-card)`, `--foreground`/`--primary`/`--ring`→`var(--mn-text)`, `--primary-foreground`/`--sidebar-primary-foreground`→`var(--mn-surface)`/`var(--mn-card)`, `--secondary`/`--muted`→`var(--mn-wash)`, `--accent`→`var(--mn-selected-fill)`, `--destructive`→`var(--raw-red)`, `--border`/`--input`→`var(--mn-line)`, etc.) off `--press-*` onto the MN tokens, and DELETE the `.dark` `--press-*` overrides (the MN tokens are already `.dark`-aware).

### 3. globals.css CSS-var surgery
- Delete the `--color-press-*` `@theme` block (lines ~163–176) — replaced by existing `--color-mn-*`/`--color-raw-*` + the 3 new `--color-mn-*`.
- Delete the `--press-*` alias block (~320–336) and `.dark` `--press-*` overrides (~406–419).
- `--background: var(--press-paper)` → `var(--raw-paper)`; `--foreground: var(--press-ink)` → `var(--mn-text)`.

### 4. Non-color families (same "no press-*" rule)
- **Keyframes:** `@keyframes press-rise`→`mn-rise`, `press-down`→`mn-down`; update `animation:` refs; easing `--ease-press`→`--ease-mn`.
- **Font vars:** `--font-press-sans/serif/mono`→`--font-mn-sans/serif/mono` in `src/app/layout.tsx` (`variable:` on each `next/font/local`) + 4 consumers in globals.css. Fonts themselves unchanged.
- **Atom file:** rename `src/components/atoms/press-kicker.ts`→`kicker.ts`, export `pressKickerClass`→`kickerClass`; update ~40 imports. `dialog-chrome.ts` filename stays; migrate its token contents only.

### 5. Verify (crisp because pixel-identical)
`tsc` 0 · jest green (baseline 14 known fails only) · `grep -rn "press-" src/` returns **zero** (except unrelated words like "compress"/"express" if any — confirm none are tokens) · Storybook builds; spot-check Rail/DocumentPanel/a proposal card render identically to pre-change.

---

## PR-2 — Glyph system (net-new feature). Build via `ship-issue.mjs`.

Scope **(i)**: rendering primitives + wire *existing* marks with fixed default glyphs. **No DB schema, no user picker** (that is a separate follow-up issue). Rides on PR-1's clean token base.

### 1. `Icon` atom — `src/components/atoms/Icon.tsx`
Port `_ds/mn/assets/icons/icon-mask.js`. Client component. Props `{ name: string; size?: number; className?: string; 'aria-hidden'?: boolean }`.
- Fetch `/icons/<name>.png` **once**, cache in a module-level `Map<string, Promise<string>>` (data-URI), apply as `mask`/`-webkit-mask: url(dataURI) no-repeat center / contain` over `background: currentColor` → glyph inherits colour like text (colour with `color`, never `fill`).
- **Sandbox gotchas (from readme):** `mask-image` can't reference a file URL in a sandboxed origin → data-URI is mandatory; paths must be app-relative (`/icons/...` from `public/`, served at site root — confirm it resolves; if a path-prefix issue appears, fetch relative). A solid square = mask failed to load.
- SSR-safe: fetch in `useEffect`; render an empty sized `<span>` until painted.

### 2. Assets
Copy all 182 PNGs from `wayfinder/design_handoff_pond/_ds/mn/assets/icons/*.png` → `public/icons/` (skip `icon-mask.js`). The atom supports any glyph; the library is now available for the future picker.

### 3. `KindDot` atom — extract `src/components/atoms/KindDot.tsx`
Move `KindDot` out of `TreeRow.tsx` (currently inline, molecule) to atoms/, behavior identical (muted 7×7-ish rounded square in area colour). Update `TreeRow` import. Page-kind marks stay `KindDot` — **not** glyphs (per readme:260).

### 4. Wire area marks to the glyph system (fixed defaults)
`AREA_GLYPH` map (approved 2026-09-29):

| area | glyph |
|---|---|
| Life (root) | `ring` |
| Personal | `house` |
| Professional | `star-01` |
| Health | `leaf-01` |
| Finances | `stairs-01` |
| Creativity | `flower-05` |

- Replace `LifeMark` (hand-drawn sage half-disc, `Rail.tsx:116`) with `<Icon name="ring" />` in the area colour.
- Render `<Icon>` in each area's leading slot: Rail `TreeRow` `leading`, area-overview kicker (`OverviewSurface`), Breadcrumb where an area shows a mark. Glyph inherits the area hue via `currentColor` (same hue KindDot uses).
- Resolve the area key from `src/lib/rail/tree.ts` (Life) + the 5-area config; keep the map in one module (`src/lib/rail/area-glyph.ts` or similar).

### 5. Verify (per Pond front-end workflow)
`Icon` + `KindDot` get Storybook stories + story tests. Playwright-verify: a glyph renders as its silhouette (not a solid square = mask OK) and inherits area colour; Rail shows the 6 area glyphs; `tsc` 0; jest green (baseline only). Live in-app spot-check of the Rail after Supabase restore if needed.

### Out of scope (own follow-up issue)
User-assignable area glyph: per-area glyph storage (migration), glyph-picker UI in area/pond settings, assignment flow. File as new issue on merge.
