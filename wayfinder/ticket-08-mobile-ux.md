---
id: 08
label: wayfinder:grilling
status: resolved
blocked-by: [07]
---

# Mobile UX: responsive design approach for quick capture and reference

## Question

Pond's mobile usage is quick capture, plan/list reference, and brief AI queries — always connected, no offline needed. How should the responsive web app handle mobile specifically? Questions to resolve: does mobile get a distinct layout or just a narrowed desktop layout? How does quick capture work (floating button? keyboard shortcut? AI prompt always visible?)? How does referencing a list or workout plan feel on a small screen?

Key constraint: this is a responsive web app — not a native app — so solutions must work within browser constraints.

## Decisions

### Layout approach

Use responsive flexbox classes throughout — no hard-coded viewport units. Mobile gets a distinct layout (not a narrowed desktop layout): chat-first, drawer nav, capture + reference only. No document editing on mobile.

### Quick capture

The chat input IS the capture surface. No FAB, no separate inbox. The AI routes captures to the right node. Single text entry point, consistent mental model.

### Referencing content

AI always mediates on mobile. No browse path, no file tree in the drawer. "What's my workout today?" → AI reads the node and surfaces it inline in chat. No read-only escape hatch — AI slowness/incorrectness is an acceptable risk to keep the surface minimal.

### Drawer nav depth

Top-level pages only on mobile (the `area`-type pages — see ticket-02 "Superseded"). Tapping one in the drawer switches context. No drill-down into sub-pages from the drawer — ask the AI instead. (Desktop sidebar retains the full page tree per ticket-07.)

### AI orienting line trigger

Fires on the first message sent after a context switch, not on drawer tap. Silent context switch keeps the Ghostty/terminal mental model intact and avoids collision between an auto-fired orientation and a message the user is already composing.
