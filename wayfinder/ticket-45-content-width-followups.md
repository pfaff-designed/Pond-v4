---
id: 45
label: backlog:ux
status: open
blocked-by: []
blocks: []
---

# Content-width handle (#58) follow-ups: extend to overview surfaces + make the grip discoverable

## Context

#58 ("Editor/page width should be adjustable") shipped a working resizable
content column: a drag/keyboard handle persisted via `useContentWidth`
(`localStorage: pond:content-width`, clamp 480–1200, default 672). Confirmed
intact and in-branch (commits `7776e4f` / `55359f1`, PR #66).

But a user reported "it either regressed or doesn't work." Diagnosis (2026-09-12,
static — live browser was locked): **not a regression.** Two real gaps make it
feel absent:

## Gap 1 — no handle on the overview surfaces

`DocumentPanel` renders the handle ONLY on the editor branch. It short-circuits
earlier for the surfaces the post-reshape shell lands on most:
- `src/components/organisms/DocumentPanel.tsx:236` → `return <LifeOverviewPanel />`
- `src/components/organisms/DocumentPanel.tsx:256-259` → `return <AreaOverviewPanel …/>`
Neither renders `ContentWidthHandle`. Those surfaces use a **fixed**
`max-w-[720px]` (`src/components/organisms/OverviewSurface.tsx:215`), independent
of the user's `contentWidth`. So on Life home and area pages there is no grip at
all, and the width the user set on editor pages isn't honored here.

## Gap 2 — the grip is under-discoverable

Even on an editor page the affordance is a 4px-wide pill at ~21% effective alpha,
~45% down the right edge, 32px inside the paper:
`src/components/molecules/ContentWidthHandle.tsx:150,156`
(`w-4` hit area, `w-1` pill, `bg-press-muted/40`, `absolute inset-y-8 right-0`).
Easy to miss entirely — reads as "no handle."

## Direction (to grill before build)

1. **Extend to overview surfaces** — render `ContentWidthHandle` on
   `LifeOverviewPanel` / `AreaOverviewPanel` and drive their measure from
   `useContentWidth` instead of the fixed `max-w-[720px]`.
2. **Raise discoverability** of the grip (contrast, hit-area, and/or reveal on
   column-edge hover) without making it loud.

## Known constraints / hard factors (from code map)

- **No global settings store** (no zustand/jotai/context). Width state lives in
  the `useContentWidth()` hook, currently owned by `DocumentPanel`. Sharing it
  across editor + overview surfaces needs the state hoisted (to WorkspaceShell or
  a small context) OR each surface reading the same localStorage-backed hook.
- The terminal/chat measure is a **separate** hardcoded `max-w-2xl`
  (`src/components/molecules/TerminalDrawer.tsx:197,212`), NOT linked to
  `contentWidth` — decide whether chat should track content width (ticket-42
  interaction) or stay fixed.
- Overview surfaces currently use `max-w-[720px]` (720), editor default is 672 —
  reconcile the default when unifying.

## Open questions (grill — per AGENTS.md)

- Global width, per-page, or per page-type (wider default for collection/board,
  narrower for prose)?
- Should overview surfaces share the editor's stored width, or have their own?
- Should the chat measure track content width, or stay independent?
- Discoverability treatment: brighten the always-on pill, or reveal-on-hover of
  the column edge?

## Notes

Supersedes the deleted false-premise ticket-45 (which wrongly claimed the whole
feature was net-new — #58 already shipped it). Diagnosis capture: user "no handle
visible", surface unknown; self-check offered
(`document.querySelectorAll('[data-testid="content-width-handle"]').length` →
1 on a content page, 0 on an overview page confirms working-as-built). Not yet
grilled/specced; build in a fresh session.
