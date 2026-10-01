---
id: 41
label: cycle-3:w4
status: resolved
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

---

## Resolution

Motion system shipped as ONE token-sourced language. `globals.css` gained a
duration ladder — `--motion-instant` (90ms, reflex), `--motion-quick` (150ms,
user-caused change), `--motion-settle` (280ms, finding rest), `--motion-calm`
(460ms, one object arriving), `--motion-slow` (560ms, a page staggering) — and
an easing set: `--ease-press` (house settle curve, kept), `--ease-out`
(decelerate into rest — entries/draws), `--ease-in` (accelerate away — exits).
Existing moments were refactored onto the tokens with no behavior change
(`press-rise` → slow, `press-arrive` → calm, chevron 280ms → settle+press).

Discipline held (impeccable): motion is confirmation, not decoration; nothing
overshoots for show — things settle. Every entrance/settle collapses to its end
state under one consolidated `prefers-reduced-motion` block; color/opacity hover
transitions (no travel) stay.

### Motion inventory (surface → token → guard)

| Surface                             | Class / token                                               | Motion                                                                         | Reduced-motion guard                                        |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Page mount (press-rise)             | `.press-rise` → `--motion-slow` `--ease-press`              | staggered rise+fade                                                            | consolidated block → `animation:none`                       |
| Message/card arrival (press-arrive) | `.press-arrive` → `--motion-calm` `--ease-press`            | rise+fade                                                                      | consolidated block → `animation:none`                       |
| Todo checkbox                       | `.motion-check` → `--motion-quick` `--ease-press`           | box settles on check (scale 0.86→1.06→1), lands with the bound-metric count-up | consolidated block → `animation:none`                       |
| TreeRow caret                       | `duration-[--motion-settle]` `ease-[--ease-press]`          | 90° rotate                                                                     | inherits (transform transition; imperceptible at token dur) |
| TreeRow revealed child              | `.motion-settle-in` → `--motion-settle` `--ease-out`        | settle from a hair up+faded                                                    | consolidated block → `animation:none`                       |
| OverviewCard                        | `--motion-settle`/`--motion-instant` `--ease-press`         | hover lift + `active:` press-down settle                                       | `motion-reduce:transition-none`                             |
| Kanban card                         | `--motion-settle` `--ease-press`                            | quiet hover shadow-raise                                                       | `motion-reduce:transition-none`                             |
| Kanban drag ghost                   | (existing)                                                  | tilt on lift                                                                   | `motion-reduce:rotate-0` (pre-existing)                     |
| ModuleDiffCard resolve              | `.motion-resolve` → `--motion-settle`                       | ease opacity + scale to inert                                                  | consolidated block → `transition:none`                      |
| UndoToast                           | `.motion-toast` → `--motion-calm` `--ease-out`              | rise + fade in                                                                 | consolidated block → `animation:none`                       |
| SlashMenu / palette                 | `.motion-menu` → `--motion-quick` `--ease-out`              | grow from anchor (origin var)                                                  | consolidated block → `animation:none`                       |
| AITerminal composer                 | `.motion-focus-draw::after` → `--motion-quick` `--ease-out` | sage baseline draws in on focus                                                | consolidated block → `transition:none` (snaps in on focus)  |
| DocumentPanel inserted block        | `.motion-settle-in` → `--motion-settle` `--ease-out`        | settle from a hair up+faded                                                    | consolidated block → `animation:none`                       |

Validation: `tsc` clean · jest 756/756 · storybook 149/150 (the one failure —
`TerminalDrawer.stories.tsx:131` asserting `justify-center` — pre-exists on main
and is unrelated: the class moved to an inner span in an earlier refactor while
the test wasn't updated). Touched-files lint + prettier clean. Story tests added
asserting the state classes are applied (UndoToast, ModuleDiffCard, TreeRow,
SlashMenu, OverviewCard).

60fps references (mined like mobbin for layout): **CRED paid-check** (checkmark
trim-draw + spring settle-to-1.0 → checkbox settle & card-resolve settle-not-snap),
**1Password Watchtower** (arc draw synced to a count ticker → checkbox↔metric
causal pairing), **Telegram copy-link toast** (rise+fade, subtle overshoot →
toast entry, minus the bounce for the Press register), **Google AI-mode search
morph** + **Amie accordion** (scale-from-anchor preserving spatial context →
menu grow-from-anchor; anchored scale+fade revealing from the top → tree/insert
settle), **FocusFlight draw-in** (→ threshold-focus baseline as a stroke, not a
flash).
