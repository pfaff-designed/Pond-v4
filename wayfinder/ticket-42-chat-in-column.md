---
id: 42
label: cycle-3:w4
status: open
blocked-by: []
blocks: []
---

# Chat lives in the center column, not a full-width bottom slab (user directive)

## Problem

The user compared the shipped chat to the v85 "Clearing" proto
(`~/v85-pond-wholelife.png`, `~/r6-v85-compose-newtopic.png`): in the proto the
conversation lives in the CENTER COLUMN over the paper — no full-width dock.
t32 centered the transcript TEXT (`max-w-2xl mx-auto px-8 pl-[252px]`) but the
terminal SURFACE/CHROME is still a full-width bottom `region` — the background
slab, the separator handle, the input row and the Send button all span
edge-to-edge. So the "chat interface takes up the entire bottom area."

## Direction (chosen: INLINE CENTER COLUMN — the "Half Marathon" compose shot)

Constrain the WHOLE terminal region to the center column measure so the
conversation reads as part of the paper, not a docked panel:

- The terminal region's visible surface (background, top hairline/separator,
  padding, the composer row, Send) all live within the SAME centered measure
  the transcript already uses (`max-w-2xl mx-auto` + the `pl-[252px]` rail
  offset — factor the shared metric so text and chrome can't drift; the t32
  Resolution flagged `pl-[252px]` as a coupling to Rail's `w-[252px]` — use a
  shared const/CSS var). Outside that measure the paper shows through — no
  full-width beige band.
- The composer ("Talk to Pond…" + Send) sits at the foot of that column, quiet,
  aligned to the column — matching the proto's "Talk to Pond…    Send".
- The context bar ("Context: Life · building" + Clear) also confines to the
  column (or becomes a quiet inline line above the composer) — no full-width
  strip.

## Preserve (do NOT regress — verify each still works)

- t24 drawer mechanics: collapse toggle + drag-resize (the resize now caps the
  column region's height; the grip stays visible, ticket-34) + persisted
  height/collapsed in localStorage + auto-grow on proposal (t24) + ⌘K focus
  (t34) + Clear.
- t32 correspondence: serif replies, POND attribution, left-ruled user asides,
  `.press-arrive`, StageText, proposal cards, SourceList.
- t34 receipts/toasts (the toast viewport is separate — leave it).
- t39 chips + question cards + phase word in the context label.
- Scroll: the transcript scrolls WITHIN the column region; newest stays in view.

## Rules (token regime)

Focused layout change — mainly AITerminal + its layout wrapper (and the shell
layout that currently gives the terminal full width). Story tests for the
changed structural states where feasible; jest stays green (~756);
touched-files lint clean; NO dev server (orchestrator runs the live pass —
this one NEEDS the visual before/after screenshot). Resolution + status:
resolved. Aesthetic bar: the proto — calm, centered, zen.
