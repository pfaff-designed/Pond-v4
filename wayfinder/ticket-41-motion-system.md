---
id: 41
label: cycle-3:w4
status: open
blocked-by: []
blocks: []
---

# Motion & micro-interaction system (F17)

Graduate the map's oldest fog: motion tokens + a micro-interaction language
across the daily touchpoints. Research REQUIRED: the 60fps MCP
(mcp__60fps__search_shots / get_motion_breakdown) is the motion reference
library — mine it like mobbin was mined for layout (checkbox marks, list
reorder, palette open, toast entry, drawer, card resolve). Cite what shaped
what. impeccable discipline: motion as craft confirmation, never decoration;
one language, not scattered singles.

1. **Motion tokens** in globals.css beside the press-* colors: durations
   (--motion-quick ~120-160ms, --motion-calm ~400-500ms — name them well) +
   easings (--ease-press exists; add an out/in pair if earned). Refactor
   existing moments (press-rise/arrive, chevron, count-up gate) onto the
   tokens — no behavior change, one source.
2. **Micro-interactions** (each token-driven, reduced-motion guarded):
   checkbox check (satisfying mark draw + the bound metric's tick already
   counts up — make the pair feel causal), tree expand/collapse (children
   settle, not pop), card hover/press states (overview + kanban cards),
   proposal card resolve (accept → settle-to-inert, not snap), toast
   entry/exit (rise/fade on the existing viewport), SlashMenu/palette open
   (grow from anchor, quick), threshold focus (the sage baseline ink — make
   it a draw, not a flash), block insert/reorder settle.
3. Every animation respects prefers-reduced-motion (audit the existing ones
   while there). No new deps unless a tiny one earns it (CSS-first).

Token regime: story tests for state-driven classes (animations themselves are
visual — stories exercise the states; assert classes/tokens applied);
NO dev server. Touched-files lint clean. Resolution + status: resolved with a
"motion inventory" table (surface → token → guard).
