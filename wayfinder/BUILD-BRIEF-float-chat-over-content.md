# Build Brief — Float the chat card over full-height content

**Status:** specced + signed off 2026-09-13. Small, contained.
**Supersedes:** `BUILD-BRIEF-terminal-input-only-peek.md` — that brief redesigned the
chat into an input-only bar + separate peek overlay and dropped resize. The user
reversed that: **keep the current unified card exactly as-is** (Context/Clear
header + transcript + input + top-edge resize + proposal auto-grow). The only
change is positioning.

## The actual problem

The chat card is fine. The problem is the **band it sits in**. Today the right
column is a vertical flex of two siblings (`WorkspaceShell.tsx:40-50`):

```
right column (relative)
├── <main>     content — bg-background (paper), flex-1, scrolls
└── <section>  AI chat — flex-shrink-0, fixed height (~288px, up to 640px)
```

They stack, never overlap. `<main>` stops where the chat row begins, so content
**cannot flow under the chat**. The chat wrapper is already transparent
(`ticket-42`) — so in that bottom band the transparent wrapper reveals the page's
paper background (`body { bg-background }` = `#efeae0`, `globals.css:450-451`),
and there's no content there to see. The card floats in a strip of bare paper.
It's not paint covering content — the docked row **displaces** content.

## The change

Stop reserving a row; content owns full height; float the card over it.

1. **`<main>` fills the whole right column.** Once the chat is out of flex flow,
   `flex-1` makes main 100% height. Add bottom scroll padding (`pb-72`, ≈ default
   card height) so the last content lines can scroll clear of the floating card.
   (Approximate — card height varies; tune live if needed.)
2. **Chat `<section>` becomes `absolute inset-x-0 bottom-0 z-30`** inside the
   already-`relative` right column — removed from flow, anchored bottom-center,
   still `mx-auto max-w-2xl`, same card, resize grip still at the top edge (drag
   up grows the card upward from the bottom anchor). Keep the `height` style.
3. **Click-through flanks.** `pointer-events-none` on the `<section>`;
   `pointer-events-auto` on the resize handle and the card, so content behind the
   empty flanks stays scrollable/clickable.
4. **Suspense fallback** for `<AITerminal>` in WorkspaceShell → `null` (the old
   `h-72 ... bg-card` docked slab would flash a reserved row + a layout jump).

## Unchanged

Card visuals, Context/Clear header, transcript, composer, collapse, drag/keyboard
resize, proposal auto-grow, height persistence — all stay. `TerminalDrawer`'s
public contract is unchanged; only its root `<section>` classes change.

## Files touched

- `src/components/organisms/WorkspaceShell.tsx` — `<main>` full-height + `pb`;
  Suspense fallback → null.
- `src/components/molecules/TerminalDrawer.tsx` — root `<section>` → absolute
  overlay + `pointer-events-none`; handle + card → `pointer-events-auto`.

## Verify

`tsc` clean · jest green · live: content fills full height and scrolls **behind**
the card (real content visible around/behind it, no paper band); card floats
bottom-center; resize/collapse/auto-grow still work; content behind the flanks is
still scrollable/clickable; last lines reachable above the card.
