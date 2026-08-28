---
id: 32
label: cycle-2:second-brain
status: resolved
blocked-by: []
blocks: []
---

# The conversation surface reads "developer console," not "luxury thinking partner"

## Problem

Audit finding 3 (major, aesthetic verdict): document/home surfaces are
genuinely premium (paper, editorial serif, sage accents) but the AI terminal is
a monospace slab — the product's most important surface is its cheapest. Split
typographic personality; the two halves don't feel like one object.

Finding 11: 25–30s generations show only "…" — no stage feedback.

## Direction (audit's boldest upgrade #1 — go further)

- Reskin the terminal as a **conversation**: same serif/paper system as the
  document; AI replies as letterpress-style cards with sage accenting; user
  messages quiet and distinct; replies fade+rise in.
- AI-generated structured content in replies renders in the SAME visual
  language as saved page blocks (tables/lists via the module renderers where
  feasible).
- Long generations stream stage text ("drafting your budget table…") — derive
  from tool-call events already visible to the client.
- Keep ALL shipped ergonomics: drawer resize/collapse/auto-grow (t24), ⌘K,
  Clear, proposal cards + resolutions (t19), context label. The terminal
  input can stay quietly monospace if it earns its place — the transcript
  cannot.

## Rules (cycle 2)

Front-end flagship → mobbin (premium AI chat / journal patterns), impeccable,
design-knowledge REQUIRED; aesthetic mandate: bolder than bold, luxury, zen —
this ticket is the proving ground. Live Playwright verify + screenshots.
/code-review.

## Origin

Cycle-2 audit findings 3 + 11 + aesthetic verdict.

## Resolution

The terminal is no longer a monospace console — it is **"The Correspondence,"** a
private letterpress exchange between Charles and Pond in the same paper/serif system
as the document surface. Reskin only: every shipped ergonomic (t24 drawer, t19
resolutions/inertness, t29 sources, t30 target stamping, t31 accept flow, the
AI-edit path) is byte-for-byte preserved — the change is typographic and tonal.

### Design decisions (grounded in research)

- **Chat convention inverted.** Mobbin's premium conversation surfaces — **Dot (New
  Computer)**, **pillowtalk**, **Claude iOS**, **Microsoft Copilot** — all treat the
  AI reply as the _authored artifact_ (full-measure typeset prose, no bubble) and the
  user's line as the _quiet aside_. Adopted exactly: the **AI reply is a letterpress
  card** (`.press-letter`: warm near-paper surface, a 2px sage-inked left margin like
  a ruled letter, a soft debossed inset highlight) rendered in **Press serif prose**;
  the **user message is a right-anchored, indented serif aside** on a faint sage wash
  with a thin right rule — never a competing bubble.
- **Structured content = page-block language.** The Markdown `terminal` variant was
  rebuilt from a compact sans/mono treatment to the **Press serif reading treatment
  scaled for the drawer** (`TERMINAL_PROSE_CLASS`, derived beside `READING_PROSE_CLASS`
  so the two can't drift). Tables/lists/headings in a reply now match saved page
  blocks (`press-line`/`press-hair` rules, display headings, sage links).
- **Motion.** Replies and every proposal object fade+rise in with **one calm breath**
  — a new `.press-arrive` (460ms, the existing `--ease-press` cubic-bezier, guarded by
  `prefers-reduced-motion`), a shorter sibling of the page-level `.press-rise`. Design-
  knowledge (Fluent 2 "functional/consistent", Material 3 "effects springs don't
  overshoot") steered this to one shared, non-bouncy arrival — no scatter.
- **Stage text (finding 11).** A pure, jest-pinned mapping
  (`lib/conversation/stage-text.ts`) turns the tool-call parts already in the stream
  into human copy — `tool-web_search`→"searching the web…", `tool-read_page`→"reading
  Ceramics Studio Plan…" (id resolved to title against the loaded pages list),
  `tool-create_page`→"drafting <title>…", `tool-fetch_context`→"searching your
  workspace…", `tool-propose_changes`→"proposing changes…". The `StageText` atom
  renders it in the correspondence serif with a slow sage pulse; it shows only while
  streaming with no visible answer yet, then yields to the reply card.
- **Proposal objects + SourceList + Inferred badge + TargetMissing** all moved off the
  `zinc/white/amber` palette onto the letterpress language (Press tokens, serif reason
  lines, sage `Inferred` badge, rust for the missing/skip notices) so a proposal reads
  as one object with the transcript.
- **Input-font decision — kept quietly monospace.** It _earns_ its place as the console
  **threshold**: the one seam where typed intent (and the `/clear · /handoff · /save`
  commands) crosses into the serif conversation. Mono marks "you are typing" as
  distinct from "Pond is speaking." Restyled to the Press field (paper surface, sage
  focus ring) so it reads intentional, not like a leftover dev console.

### Verify

Live Playwright on :3032, screenshots `~/t32-verify-01…10-*.png`: serif reply with
fade-in (`03`); web search → "searching the web…" stage line (`04`) + letterpress
SourceList (`05`); cross-page edit to Ceramics Studio Plan as a letterpress proposal
card (`06`/`07`), accepted (`08`), then undone via a second proposal (`09`) — the page
DB-confirmed to end WITHOUT the test item, Shopping Checklist otherwise intact (`10`).
Zero console errors.

### Validation

tsc clean · jest 528 (516 baseline + 12 new stage-text) · story tests 108 (105
baseline + 3 new StageText) · lint clean on all touched files. No behavioral story
assertion was weakened; the only copy change (`"Start a conversation…"` →
`"Talk with Pond — think out loud, ask, or compose."`) is in the organism, not any
tested story (the TerminalDrawer story uses its own sample body).

### Deferred / risky

- Stage copy is intentionally coarse — one line for the whole active tool, last-tool-
  wins. It doesn't narrate multi-search progress ("search 2 of 3"); a finer stage
  model can layer on the same pure mapping later.
- `.press-letter`/`.press-arrive` live in `globals.css` as chrome-only component
  classes (the terminal is a host, not a module) — consistent with the Press token law
  but worth a glance if a token audit sweeps bespoke chrome.
