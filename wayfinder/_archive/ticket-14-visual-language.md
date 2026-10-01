---
id: 14
label: wayfinder:prototype
status: claimed
blocked-by: []
blocks: [15, 18]
---

# Visual language & premium aesthetic direction

## Question

Pond must look and feel like a daily-driver **premium productivity app** — a stated priority, not a nice-to-have (the owner uses it every day). Establish the visual world the whole UI system inherits:

- The aesthetic POV / world: what references define "premium productivity" for Pond specifically (mine **Mobbin** for flows/screens, **60fps** for motion, apply **impeccable**'s craft floor)? Linear / Things / Notion / Raycast-adjacent, or a more distinct POV?
- Core visual moves: density, surface/elevation model, borders vs. shadows, corner language, iconography, and the IDE-shell feel (ticket-07) rendered premium rather than utilitarian.
- The AI **persona** expression (PRODUCT.md: a distinct persona is committed; voice undecided) — how much does the steward's character show up visually/tonally, if at all yet?
- Enough direction to seed tokens (t15) and motion (fog) without pre-deciding them.

HITL prototype: gather references via the MCPs, produce a cheap concrete artifact (mood/direction, or impeccable new-work) to react to. Output feeds the token architecture (t15) and eventually writes/replaces DESIGN.md. Do NOT resolve tokens here — that is t15.

## Progress (in flight — HITL prototype)

Building **15 aesthetic prototypes** on a boldness ladder (1 restrained → 15 wild), all rendering the same faithful Pond three-panel shell (sidebar tree · page editor · AI terminal) with shared dummy content. Throwaway harness at `src/app/proto/visual-language/` (route `/proto/visual-language`, ←/→ to flip, `h` hides chrome). `globals.css` untouched. Inspiration gathered via Mobbin (screens), 60fps (motion), Design Systems MCP (craft) — note: no Savee/"Save" MCP connected, substituted Design Systems MCP.

Ladder: 1 Paper · 2 Slate · 3 Blueprint · 4 Graphite · 5 Midnight · 6 Parchment · 7 Sage · 8 Craft · 9 Editorial · 10 Aurora · 11 Signal · 12 Vapor · 13 Brutal · 14 Expressive · 15 Dreamscape.

Scaffold + all variants built by parallel agents; verify compile then have Charles react to pick a direction (or blend). Delete `src/app/proto/` once the aesthetic is chosen. Do NOT resolve tokens here (that's t15).
