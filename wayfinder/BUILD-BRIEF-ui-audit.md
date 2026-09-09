# Build Brief — Pond-v4 UI/UX Audit (nitpick sweep)

Triaged 2026-09-07. Source: user component audit + two read-only investigation agents.
All file:line anchors verified live (proto/** excluded — throwaway). Repo is
**customized Next.js** (read `node_modules/next/dist/docs/` per AGENTS.md). UI is
hand-rolled "Press" design system (`press-*`, `motion-*`); almost nothing here sits on
shadcn. **Grill open decisions (marked ⚠️) before building** per AGENTS.md, then build via
`/tdd` where testable + `/code-review` + live `/verify`. Build slices are independent.

---

## ✅ RESOLVED DECISIONS (grilled 2026-09-07 — this is the signed-off spec; build to this)

All four ⚠️ decisions are settled. Build to these; the slice bodies below are the anchors.

- **1b — text caret fix → Option A (click→caret-offset map).** On the entering-edit click,
  map the click point to a caret offset in the source (`caretRangeFromPoint`/
  `caretPositionFromPoint`) and set the textarea selection there. Keeps typeset-at-rest
  (two-render model). Accurate for plain prose; for headings/`**bold**`/tables the
  rendered↔source offset diverges — land the caret at the **approximate mapped position and
  clamp**, and **never force caret-to-end** (remove `view.tsx:25-31`'s slam-to-end for
  non-empty blocks). Not doing Option B (direct-edit textarea, regresses ticket-20 typeset)
  or B′ (contentEditable WYSIWYG, out of scope).
- **2a — "+ Add a block" button → drop an empty text block directly** via
  `emptyBlockForType('text')` (`palette.ts:47`), NOT open the palette. Keep the button
  visible (discoverability). Touches `BlockInserters.tsx` (`AddBlockButton.onAdd`) +
  `BlockCanvas.tsx` only. `InsertBetween` hover-`+` stays palette-first (unchanged).
- **2b — `/` trigger stays NARROW.** `/` opens the palette only as the first char of an
  empty text block (existing `BlockCanvas.tsx:311-325`). Do NOT widen to non-empty/mid-block
  (avoids literal-`/` hijack). The new text-default add + narrow `/` gives the clean
  add→slash→pick flow with zero new surface.
- **2-copy — add `paletteDescription`** to `ModuleDescriptor` (`types.ts`); prefer it in
  `palette.ts:39`, leave long `description` for the AI. Routing eval must stay green.
- **3 — invisible create card → dev-only instrumentation, no blind fix.** Replace the three
  silent `return null` suppressions with a **dev-mode `console.warn`** naming which gate
  fired + dumping the part (`type`, `state`, `input`): (i) stuck streaming
  (`AITerminal.tsx:1732`), (ii) missing `title`/`type` (`:1734`), (iii) `isCreatePagePart`
  name-drift filter (`:183`, `:1607-1609`). NOTE grounded fact: `tools.ts:32-36` makes `type`
  a REQUIRED enum (no default) — a valid finalized call always carries it, so the likely
  cause is tool-selection (model chose `propose_changes` / prose) or name-drift, NOT a
  missing field. No happy-path change. Catalog; user logs a real repro (exact prompt + what
  showed instead + on-existing-page-vs-blank) on recurrence, then we fix to the captured cause.
- **6-build — hand-rolled `src/components/atoms/Checkbox.tsx` in Press.** No Radix/shadcn
  (would be the codebase's first `ui/` component + foreign paradigm). Own the markup so the
  `motion-check` settle is preserved verbatim. Swap into the 3 call sites: `todo/view.tsx:24`,
  `view/view.tsx:839`, `PropertyInspector.tsx:131`.
- **6-look — editorial rounded-sm square.** ~16px, radius ~4px; border `press-faint` at rest
  → `press-accent` on hover; checked = `press-accent` (sage `#5f7355`) fill + paper-white
  check that DRAWS IN via existing `motion-check-settle` (0.86→1.06→1.0); padded tap target.
  Mobbin refs: Apple Reminders / Amie (square, quiet). Storybook story + play test per the
  front-end workflow rule.

**No open decisions remain** for 1a (guard `Rail.tsx:174` focus like `:190`), 4 (ghost
overlap guard/alignment), 5 (voice button `w-6 h-6`→~`w-9 h-9`). Build order unchanged (below).

---

## Slice 1 — Interaction bug cluster (HIGHEST LEVERAGE) 🐞

Four reported symptoms → **two independent root causes**. Fix both and all four resolve.
This is the "feels clunky / click twice / can't place cursor / Enter goes to sidebar" cluster.
Recommend `/diagnose` to confirm live, then fix.

### 1a. Rail steals DOM focus (symptoms: "focus forced to next sidebar item", Enter→sidebar, half of click-twice)

- **Root cause:** the rail's roving-tabindex effect reflects keyboard focus into real DOM
  focus **without guarding that focus is already inside the rail**. It re-runs on every
  page-open/expand because it depends on `visibleIds`, which recomputes whenever the tree
  expands/collapses or `['pages']` refetches.
- **Anchor:** `src/components/organisms/Rail.tsx:174-176` (unguarded `.focus()`), fired via
  the reveal-on-selection effect `src/components/organisms/Rail.tsx:438-461`. Contrast the
  ALREADY-guarded fallback effect at `Rail.tsx:190` (checks `document.activeElement === body`).
- **Why Enter misbehaves:** once focus is stuck on a tree row, `TreeRow` keydown
  (`src/components/molecules/TreeRow.tsx:210-214`) → `treeKeyCommand`
  (`src/lib/rail/tree.ts:290-292`) maps Enter/Space → `{kind:'open'}` and `RailView`
  preventDefaults + navigates (`Rail.tsx:194-218`). The editor's own Enter handling
  (`src/components/organisms/BlockCanvas.tsx:249-258`) never gets focus.
- **Fix direction:** guard the `Rail.tsx:174-176` effect to only call `.focus()` when focus
  is already within the rail (e.g. `asideRef.current?.contains(document.activeElement)`),
  mirroring line 190. This stops the rail yanking focus out of the editor on navigate.
- **ACs:** (1) clicking into a text block, then opening/expanding a rail page elsewhere, does
  NOT move focus out of the block; (2) with the caret in a block, Enter creates a new block
  (BlockCanvas), never navigates the sidebar; (3) arrow keys inside a block move the caret,
  not the tree selection. Rail keyboard nav still works when focus is genuinely in the rail.

### 1b. Text block is click-to-edit + forces caret to end (symptoms: can't place cursor mid-word, other half of click-twice)

- **Root cause:** text blocks are NOT directly editable. They render a read-only
  `<div role="button" tabIndex=0>` of typeset markdown; the first click only flips
  `setEditing(true)`, swapping in a `<textarea>`; an effect then **slams the caret to
  end-of-value** regardless of where the user clicked. So click-mid-word never positions the
  caret, and every edit needs two clicks (one to enter edit, one to place caret).
- **Anchors:** `src/lib/modules/text/view.tsx:73-75` (onClick→setEditing), `:25-31`
  (`setSelectionRange(len,len)` force-to-end), `:66-89` (read-only trigger div), `:37-54`
  (textarea). NOTE: value is controlled but DocumentPanel debounces + only re-adopts server
  blocks when saved+signature-differs (`DocumentPanel.tsx:127-145`), so mid-typing rerenders
  do NOT reset caret — the caret bug is purely the click-to-edit + force-to-end design.
- **Fix direction (⚠️ pick one — grill):**
  - **(A) Map click→caret offset:** on the entering-edit click, use
    `document.caretPositionFromPoint(x,y)` (Firefox) / `caretRangeFromPoint` (WebKit/Blink)
    to set the textarea selection to the clicked offset instead of forcing end. Keeps the
    two-render model; smallest change.
  - **(B) Direct-edit at rest:** make the block a persistently-mounted textarea/contentEditable
    (no read-only trigger), so a single click positions the caret natively. Bigger change,
    best feel, must preserve markdown typeset rendering somehow (edit-in-place vs preview).
  - Minimum viable: stop forcing caret-to-end when the block is non-empty (`view.tsx:25-31`).
- **ACs:** clicking mid-word places the caret at that character on the FIRST click; no
  double-click needed to edit; empty blocks still focus correctly.

---

## Slice 2 — Block inserter behavior + palette copy ⚠️

- **Desired:** typing `/` summons the block palette; otherwise a **plain text block is the
  assumed default**. Block descriptions trimmed to 1–2 sentences.
- **Current state:** a `/`-opens-palette path ALREADY EXISTS but is narrow — only fires on an
  empty text block's exact `''`→`'/'` transition (`BlockCanvas.tsx:311-325`, SlashMenu anchored
  `:298-305`). The always-visible `AddBlockButton` ("+ Add a block") currently opens the palette
  directly (`src/components/molecules/BlockInserters.tsx:65-97`, docstring says "palette-first").
  `InsertBetween` hover-`+` at `BlockInserters.tsx:27`. Palette items from
  `src/lib/modules/palette.ts:34-40`; SlashMenu is `src/components/molecules/SlashMenu.tsx`.
- **Fix direction:**
  - Behavior: change `AddBlockButton`'s default action to insert a **text** block (via
    `emptyBlockForType('text')`, `palette.ts:47`) instead of opening the palette; keep `/` as
    the palette summon. Touches `BlockInserters.tsx` + `BlockCanvas.tsx` only; SlashMenu +
    palette reusable as-is. ⚠️ **Grill:** keep AddBlockButton visible at all (or rely solely
    on `/`)? Does `/` need to work on non-empty blocks / anywhere, not just empty text blocks?
  - Copy: the palette reads `d.description` verbatim (`palette.ts:39`, rendered
    `SlashMenu.tsx:136`) — but the SAME field is the AI's capability text, so trimming in place
    would degrade AI composition. **Add a short `paletteDescription` field** to
    `ModuleDescriptor` (`src/lib/modules/types.ts`), prefer it in `palette.ts:39`, leave long
    `description` for the AI. Too-long today: table, metric, stat, chart-line/bar/area, heatmap,
    timeline, view (each in its `src/lib/modules/*/schema.ts`). OK: text, metric-ring, todo.
- **ACs:** typing `/` in a block opens the palette; the plain add affordance drops a text block
  ready to type; palette rows show ≤2-sentence descriptions; AI composition unaffected (routing
  eval `node --env-file=.env.local scripts/eval-routing.mts` still passes).

---

## Slice 3 — Create-Project / structural proposal card not visible 🐞

- **Symptom:** the structural (create_page) project proposal card doesn't render.
- **Anchors:** render/gate `src/components/organisms/AITerminal.tsx:1729-1759`; parts filter
  `:1607-1609`; type guard `isCreatePagePart` (`:166-183`, matches exactly
  `type === 'tool-create_page'`); card `src/components/molecules/CreatePageProposalCard.tsx`.
- **Most likely causes (verify in this order):**
  1. Gate `if (!input?.title || !input.type) return null` (`AITerminal.tsx:1734`) — if the
     model omits/renames `type` (sends `kind`, or a non-`NodeType`), the card is silently
     suppressed. Check the tool schema in `src/app/api/chat/tools.ts` emits `type` as a
     required `NodeType`.
  2. `if (part.state === 'input-streaming') return null` (`:1732`) — never flips off if the
     tool result isn't finalized.
  3. Name mismatch: filter needs the streamed part `type` to be exactly `tool-create_page`
     (`:183`). Codebase mixes `create_page`/`createNode`/`createPage` naming
     (`src/lib/nodes/create.ts`, `src/lib/pages/create-page.ts`) — confirm no drift.
- **Fix direction:** reconcile tool name + payload contract (`tools.ts` / `route.ts`) with the
  guard + gate; loosen/repair the `type` requirement or add a degraded render instead of silent
  `null`. Likely all within `AITerminal.tsx` + chat tools def. Card itself renders fine once fed.
- **AC:** ask Pond to create a project/page → the structural proposal card appears with title,
  type, scaffolded blocks, Save-to picker, Create/Dismiss; reproduce the exact failing prompt
  first (⚠️ get the user's repro phrasing).

---

## Slice 4 — Ghost suggestion overlap 🐞

- **Symptom:** the composer autocomplete "ghost" text overlaps typed text in the visible state.
- **Anchors:** `src/components/atoms/GhostSuggestion.tsx:56-77` — ghost `<span>` is
  `absolute inset-x-0 top-0 px-0 py-1.5 ... truncate`, layered BEHIND the `<textarea>` which is
  `relative z-10` (`AITerminal.tsx:2119`). Guards: ghost returns null unless `inputValue===''`
  (`GhostSuggestion.tsx:56`) and placeholder blanks while shown (`AITerminal.tsx:2112-2114`).
  Distinct from `StageText.tsx` (flow-positioned "generating" line — not the overlap).
- **Root cause:** absolute-over-textarea at identical coords; if the null-guard is a frame late
  (ghost still mounted as `input` becomes non-empty) or padding/line-height drift between ghost
  (`py-1.5`) and textarea, the grey suggestion prints under/over typed text. The Tab pill
  (`GhostSuggestion.tsx:72-74`) can also collide with truncation.
- **Fix direction:** tighten the guard so the ghost unmounts the instant `inputValue` is
  non-empty (don't rely on a separate dismiss effect), and/or align ghost padding+line-height to
  the textarea (`AITerminal.tsx:2093/2119`). Cleaner: prefix the ghost inside the same text layer
  instead of stacking absolute. Hand-rolled atom.
- **AC:** as soon as a character is typed the ghost disappears (no overlap frame); ghost + Tab
  pill never overlap the caret/typed text; long suggestions truncate cleanly.

---

## Slice 5 — Voice input button too small (cosmetic)

- **Anchor:** `src/components/atoms/VoiceInputButton.tsx:110-131` — currently `w-6 h-6`
  (24px) with a 14px SVG; placed `self-end mb-2` (`AITerminal.tsx:2124-2128`). Hand-rolled.
- **Fix:** bump to ~`w-9 h-9`/`w-10 h-10` and SVG ~18-20px; re-check baseline alignment with
  send + paperclip in `AITerminal.tsx:2127`. Single-file. AC: visibly larger, still aligned.

---

## Slice 6 — Checkbox redesign ⚠️ (cosmetic-ish)

- **Current:** every checkbox is a raw native `<input type="checkbox">`. Worst offender = todo
  block: bare input, no base class (`src/lib/modules/todo/view.tsx:24-41`), only a conditional
  `motion-check` on checked (`:33`). Others tint via `accent-press-accent`:
  `src/lib/modules/view/view.tsx:839-847`, `src/components/molecules/PropertyInspector.tsx:131-141`.
  No shadcn checkbox exists (`src/components/ui/` has none); no reusable atom either.
- **Fix direction:** author ONE styled checkbox — either add shadcn `Checkbox` (Radix) or a
  hand-rolled `src/components/atoms/Checkbox.tsx` in the Press design language — and swap into
  the 3 call sites. Must preserve the todo `motion-check` settle animation.
  ⚠️ **Grill:** shadcn/Radix vs hand-rolled atom? What should it LOOK like (Press-styled box,
  check glyph, size, checked color)? Get a visual direction before building; consider Mobbin
  reference per the frontend-workflow rule.
- **AC:** all three call sites use the new checkbox; todo settle animation preserved; Storybook
  story + play test; matches Press aesthetic.

---

## Suggested build order (fresh session)

1. **Slice 1** (interaction cluster) — highest impact, unblocks daily use; `/diagnose` → fix →
   `/verify` live (the two fixes are independent, can ship together or separately).
2. **Slice 3** (structural card invisible) — real bug, needs user's repro prompt.
3. **Slice 4** (ghost overlap) — small, self-contained.
4. **Slices 2 + 6** — carry ⚠️ open decisions; grill first.
5. **Slice 5** (voice button) — trivial, ride along.

## Open decisions to grill before building

- 1b: click→caret-offset (A) vs direct-edit textarea (B)?
- 2: keep the always-visible add button or `/`-only? Should `/` work beyond empty text blocks?
- 3: exact prompt that fails to show the card (repro).
- 6: shadcn/Radix vs hand-rolled; visual direction for the checkbox.

## Gotchas

- Front-end workflow: atomic design + Storybook + per-component story/Playwright tests +
  `/code-review`; no stray components outside atoms/molecules/organisms (user rule). Research
  reference patterns via Mobbin MCP before UI design.
- Routing eval must stay green after Slice 2 description changes.
- Supabase free-tier auto-pauses (~1wk idle) → NXDOMAIN; restore via mgmt API
  `POST /v1/projects/ifhahsvgqedvygpdeaix/restore` (~4 min).
- Next 16 blocks a 2nd `next dev` in the same dir — reuse the running :3000 or kill first.
