# HANDOFF — R4 interactive, use-case-driven prototypes (ticket-14)

**Status:** All 6 R4 prototypes built, wired, typecheck-clean, zero console errors.
Facets (64) mode-switch verified live (Browse morphs the layout). Full visual review
of 65–69 interactions NOT yet done — that's the next step.

## What changed this round
- **Curation:** pruned the switcher down to the 7 winners Charles named — `48 Prism,
  51 Ma, 59 Constellation, 60 Command, 61 Ink, 62 Current, 63 Almanac`. The 56 pruned
  files are backed up (untracked in git!) at:
  `/private/tmp/claude-501/-Users-charlespfaff/31f52bb4-.../scratchpad/removed-variants/`
  (session scratchpad — copy anywhere permanent if any are wanted back).
- **New R4 set (ids 64–69)** — interactive (real `useState`, "key interactions only"),
  use-case-driven, each with a built-in "how it works" hint:
  | id | name | approach | key interaction (wired) |
  |----|------|----------|--------------------------|
  | 64 | Facets | adaptive mode-switch (top tabs, light) | click mode → whole layout morphs ✅ verified |
  | 65 | Loom | adaptive mode-switch (bottom dock, dark) | dock pill → canvas reshapes |
  | 66 | Triage | use: Review queue | Accept/Reject advance a 3-proposal stack → "inbox zero" |
  | 67 | Catch | use: Capture | type + Enter → prepends to inbox w/ AI routing chip |
  | 68 | Ink Live | deepen 61: Write | Accept inline suggestion → sentence rewrites; click line → focus dim |
  | 69 | Current Live | deepen 62: Reflect | composer adds entries; Accept resolves diff entry; area chips filter |

Registry: `src/app/proto/visual-language/variants/index.tsx` — array is
`[v48,v51,v59,v60,v61,v62,v63, v64,v65,v66,v67,v68,v69]` (13 total).

## Harness facts (unchanged)
- Route `/proto/visual-language`; `←/→` cycle (wraps), `1–9` jump (single-digit only,
  so 66–69 need arrows/pips), `h` hides chrome. Counter + pip strip derive from
  `variants.length`.
- Each variant is a self-contained `'use client'` file, inline styles, imports shared
  `../content` (tree, openPage, transcript, diffCard, contextLabel, openNodeId), exports
  `variant: Variant {id,name,pov,boldness,Component}`.
- Modified Next.js 16 (Turbopack) — see root `AGENTS.md`. **Gotcha:** cloud-sync makes
  `"<name> 2.ts"` duplicate files in `.next` that break `tsc`; `rm -rf .next` fixes it.
- Screens saved to `wayfinder/screens/r4-*.png` (and `r3-*.png` from last round).

## NEXT STEPS
1. **Drive each R4 interaction live** (dev server hot-reloads): for 65–69, exercise the
   key interaction and screenshot resting + post-interaction states. Read them, curate.
2. Report a shortlist to Charles; decide which use-case directions to carry forward.
3. Charles's standing prefs: north star = **zen**; he loves earthy + curved-container +
   glass; wants it **clear how each UI works** and **more interactive** each round.
4. Likely next round: either deepen the remaining winners (59/60/63) into interactive,
   or fuse the strongest R4 uses into one coherent adaptive shell.
