# HANDOFF — next task: Bklit "lived-in" charts proto (`#72`)

**Goal:** a NEW throwaway variant showing what Pond looks like after someone has
used it for a while — a lived-in surface **rich with Bklit charts** (confirmed:
the **Bklit** chart library). Still a static mockup (seeded data, no real backend).

## Where it goes
- New file `src/app/proto/visual-language/variants/v72-<name>.tsx`, self-contained
  `'use client'`, inline styles, exports `variant` (id 72, boldness 72).
- Register in `variants/index.tsx` (import + append to `variants[]`, after `v71`).
- It becomes the LAST variant → from index 0 press **←** once to wrap to it.
- Route `/proto/visual-language`; `←/→` cycle, `h` hides chrome. Dev server :3000.

## Aesthetic anchor (reuse Folio's, `v71-folio.tsx`)
Earthy: PAPER `#efeae0`, INK `#2a2722`, sage ACCENT `#5f7355`; fonts via
`--proto-font-{sans,serif,display,mono}`. **Charles's latest rulings (this session):**
FLAT — no glass "containers", modules sit directly on the page; areas in a plain
left rail; no Document→Dashboard slider. So charts should feel like flat panels on
warm paper, not glass cards.

## What "lived-in" means (build seeded history so it feels used for months)
- Multiple areas/pages with real-looking accumulated data.
- LOTS of Bklit charts: mileage-over-time line/area, weekly bars, sleep trend,
  consistency/streak, project burn-down, reading pace, etc. Variety of chart types.
- Small textural signs of use: streaks, "12-week" ranges, PRs, annotations.

## ⚠️ Do FIRST — verify Bklit's real API before writing charts
`grep -ri bklit package.json src` and read the lib's docs/types in `node_modules`.
Do NOT guess the component API. Confirm import path + a minimal working chart, then
scale up. (Reminder: this is the modified Next.js 16 / Turbopack repo — see root
`AGENTS.md`; `rm -rf .next` if cloud-sync `"<name> 2.ts"` dupes break `tsc`.)

## Verify before done
`npx tsc --noEmit` clean · load in browser, screenshot to
`wayfinder/screens/r5-72-*.png` · 0 console errors. Then update
`HANDOFF-r5-fusion.md` + the `pond-v4` memory.

## State of #71 Folio (current direction, DONE this session)
Rail + one flat centered page (doc↔dashboard by module density, slider removed) +
flat Notifications drawer restyled as a time-spine timeline + floating chat + ⌘K
(switches pages) + capture. Relationships cut. Typecheck-clean, verified live.
Screens `wayfinder/screens/r5-71-folio-*.png`. #70 Atrium kept for comparison.
