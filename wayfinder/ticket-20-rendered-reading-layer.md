---
id: 20
label: ux-audit:finding
status: resolved
blocked-by: []
blocks: []
---

# Text blocks display raw markdown — the reading experience betrays the writing ambition

## Problem

The single biggest gap between "premium" and what a user actually sees. Observed
live (UX audit 2026-08-27, `~/ux-02-leaf-page.png`, `~/ux-03-chat-answer.png`):

- The 3-Day Full-Body Dumbbell Routine page renders literal `##`, `**Equipment:**`,
  `---` rules, and pipe-table syntax as plain text in text blocks.
- Chat answers in the terminal show literal `**Biceps**` asterisks.
- The AI authors in markdown everywhere; no surface renders it.

Secondary, same surface: the editor drops the Press aesthetic entirely — overview
surfaces are Press serif, the editor is generic sans, the terminal is monospace.
Three type worlds on one screen, and the editor is where reading time is spent.

## Direction (not yet designed)

- Text module gets a **rendered read mode** (markdown → typeset output), with
  click-to-edit source — the diff-card edit loop already established
  click-to-edit text blocks (ticket-10), so this extends an existing pattern.
- Terminal transcript renders assistant markdown (bold/lists at minimum).
- Bring Press typography to the rendered reading view so page reading matches
  the overview surfaces' quality bar.
- Companion ticket-21 attacks the other half: stop the AI from authoring
  markdown-shaped content that should be structured modules in the first place.

## Build notes

Atomic design per ticket-13: rendered text view lives in the text module's
renderer (`src/lib/modules/`), any new presentational pieces as atoms/molecules
with Storybook stories + story tests (front-end workflow rule — no stray
components outside atoms/molecules/organisms).

## Origin

Hands-on UX audit, 2026-08-27 (this session; screenshots `~/ux-01…07-*.png`).

## Resolution (2026-08-27)

Shipped the rendered reading layer. No more literal `##`, `**bold**`, `---`, or pipe
tables anywhere a human reads.

### What shipped

- **`Markdown` atom** (`src/components/atoms/Markdown.tsx`) — the single
  rendered-reading primitive. `react-markdown` + `remark-gfm`, styled per-element via
  the `components` map (Tailwind on the mapped tags), in two variants:
  - `reading` — Press serif prose (Fraunces body at ~17px/1.65, Instrument-Serif
    display headings, `press-body`/`press-line` tokens) so page reading matches the
    overview-surface quality bar.
  - `terminal` — compact treatment sized for the chat-transcript bubble.
    Story + story tests cover both variants, GFM tables, and the XSS-inertness of raw
    HTML in the source.
- **Text module rendered read mode + click-to-edit** (`src/lib/modules/text/view.tsx`)
  — read-only always typesets markdown; editable renders the reading view by default
  and drops into the source textarea on click (extends the ticket-10 loop), caret at
  end, content intact. Blur or Escape returns to the rendered view. An empty block
  starts in edit mode so a freshly-added "+ Add text" block is immediately typeable.
  Story + story tests added (`view.stories.tsx`).
- **Terminal transcript** (`src/components/organisms/AITerminal.tsx`) — assistant
  messages render through `Markdown variant="terminal"`; streaming-safe (the growing
  `text` string re-parses each render). User messages stay verbatim (`whitespace-pre-wrap`),
  never markdown-interpreted.

### Decisions

- **One markdown solution = `react-markdown` + `remark-gfm`.** react-markdown v10 never
  emits raw HTML (no `rehype-raw` wired), so output is XSS-safe by construction —
  arbitrary HTML in the source renders as inert text. `remark-gfm` adds the exact
  artifacts seen live (pipe tables, `---`, strikethrough, task lists).
- **AI-edit focus path** now clicks the block's `[data-text-edit-trigger]` to open the
  source before focusing, since the textarea only exists once in edit mode.
- **Jest ↔ ESM.** `react-markdown`/`remark-gfm` are pure ESM and `next/jest` doesn't
  transpile `node_modules` (and fully overrides `transformIgnorePatterns`). Rather than
  fight that, both are stubbed for jsdom via `moduleNameMapper` →
  `src/__mocks__/react-markdown.tsx` (emits raw source). Typeset rendering is verified
  by the **Storybook story tests** (native ESM in the vitest browser env), the mandated
  component-test surface per the front-end workflow rule.

### Deferred / notes

- **Text `differ` left as a source diff** (`text/differ.tsx`): a change-review card
  intentionally shows the literal before/after text you're approving, not typeset
  output. Out of scope for "reading"; not regressed.
- **Pre-existing lint failures** in `src/components/charts/` (the Bklit library) are
  unchanged and unrelated — identical on untouched `main`. All files touched here lint
  clean.
- One adjacent story test (`CreatePageProposalCard.stories.tsx`) was updated: its text
  block preview now renders `# Lasagna` as a real `<h1>`, so the exact-text lookup was
  disambiguated. The component itself was not touched.
