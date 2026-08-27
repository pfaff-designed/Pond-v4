---
id: 20
label: ux-audit:finding
status: open
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
